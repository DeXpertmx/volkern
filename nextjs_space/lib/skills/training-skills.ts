import { prisma } from '@/lib/db';
import { notifyUser } from './notification-layer';
import { broadcastPushNotification } from '@/lib/services/push-notification';
import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';
import { cosecharMejorPractica, UMBRAL_COSECHA } from '@/lib/sales/playbook-cosecha';

export interface RoleplayMessage {
  role: 'agent' | 'customer';
  content: string;
}

export interface RoleplaySession {
  leadId: string;
  history: RoleplayMessage[];
  objectionsPracticed: string[];
}

/**
 * Simulador de Negociación (Training Room)
 * Gemma 4 adopta el Digital Twin del cliente basado en su historial real.
 */
export async function generateCustomerResponse(input: {
  leadId: string;
  tenantId: string;
  agentMessage: string;
  history?: RoleplayMessage[];
  /** El vendedor que practica: su récord alimenta la escalada de dificultad (C2). Opcional para compatibilidad con llamadas sin sesión; sin él, el modo es ESTÁNDAR — nunca se usa el récord de otro vendedor. */
  agentId?: string;
}) {
  const { leadId, tenantId, agentMessage, history = [] } = input;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      notasTimestamp: { orderBy: { fechaCreacion: 'desc' }, take: 10 },
      interacciones: { orderBy: { fechaCreacion: 'desc' }, take: 5 }
    }
  });

  if (!lead) throw new Error('Lead no encontrado');

  // 1. Reconstruir el historial para el prompt
  const historialNotas = lead.notasTimestamp.map((n: any) => `- ${n.contenido}`).join('\n');
  
  // 2. Determinar NIVEL DE DIFICULTAD PERSONAL (C2): la escalada depende del
  // RÉCORD DEL VENDEDOR que practica, no del récord del tenant — antes la
  // consulta filtraba por `userId: tenantId`, un id que nunca existe como
  // vendedor, así que el modo leyenda nunca arrancaba con el historial real.
  // Sin vendedor (llamada sin sesión), ESTÁNDAR: no se adivina el récord de
  // otro — mejor un modo plano que un modo prestado.
  let bestScore: { score: number } | null = null;
  if (input.agentId) {
    bestScore = await prisma.trainingSession.findFirst({
      where: { userId: input.agentId, tenantId },
      orderBy: { score: 'desc' },
      select: { score: true }
    });
  }

  const isHardMode = (bestScore?.score || 0) > 85;

  // 3. Construir el "Prompt de Fidelidad de Negociación" solicitado por el usuario
  const systemPrompt = `
Eres ${lead.nombre}, un cliente potencial que está siendo contactado por un agente de ventas.
TU PERSONALIDAD (Basada en historial):
${historialNotas || 'No hay notas previas, actúas como un cliente escéptico interesado en servicios de CRM.'}

DIFICULTAD: ${isHardMode ? 'MODO LEYENDA' : 'ESTÁNDAR'}

INSTRUCCIONES DE COMPORTAMIENTO:
1. Sé realista. No cedas ante argumentos genéricos.
2. Si el agente es amable pero no aporta valor técnico o financiero, sé cortés pero mantén la distancia.
${isHardMode ? `
3. 🔥 REGLAS MODO LEYENDA (AGRESIVIDAD NIVEL 4):
   - Estás extremadamente ocupado y de mal humor. No toleras "saludos cordiales" ni "esperamos que estés bien".
   - Cuestiona el ROI de forma brutal: "¿Por qué debería gastar un centavo en ustedes cuando puedo invertir eso en leads directos? Demuéstralo o ya perdimos el tiempo".
   - Tácticas de Shock: Interrumpe al agente. Escéptico absoluto sobre la "IA": "Todos dicen que tienen IA hoy en día, dime qué hay bajo el capó o deja de mentir".
   - El Cronómetro: "Te doy 30 segundos. Si escucho algo genérico, te bloqueo de WhatsApp y LinkedIn ahora mismo".
   - Comparativa Destructiva: "Hablé con un competidor ayer y me ofrecieron lo mismo a mitad de precio. ¿Por qué no debería irme con ellos? Convénceme".
   - Desconfianza en Agencias: "Eres un Slot de una agencia. ¿Cómo sé que mañana no desaparecen y se llevan mi info?".
` : '3. Sé un cliente difícil pero razonable. Plantea objeciones comunes sobre precio, tiempo e implementación.'}

Responde de forma concisa (máximo 2 párrafos) tal como lo haría un cliente por chat o teléfono. No salgas del personaje.
Responde ÚNICAMENTE con el mensaje del cliente en formato JSON:
{
  "customerResponse": "tu respuesta aquí",
  "objectionType": "precio|valor|confianza|tiempo|tecnico",
  "sentiment": "angry|neutral|skeptical|interested"
}
  `.trim();

  console.log(`[Roleplay] Calling Gemma. HardMode: ${isHardMode}`);

  const messages: GemmaMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m: any) => ({ 
      role: m.role === 'agent' ? 'user' : 'model', 
      content: m.content 
    })) as any,
    { role: 'user', content: agentMessage }
  ];

  const aiRes = await callGemma(messages, { 
    temperature: isHardMode ? 0.9 : 0.7, 
    responseMimeType: 'application/json' 
  });

  if (aiRes.error) {
    throw new Error(`Error de IA: ${aiRes.error}`);
  }

  try {
    // Limpiar posibles bloques de código markdown antes de parsear
    const cleanedContent = aiRes.content.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanedContent);
    return {
      customerResponse: parsed.customerResponse,
      objectionType: parsed.objectionType,
      sentiment: parsed.sentiment,
      leadName: lead.nombre,
      systemPromptUsed: systemPrompt
    };
  } catch (e) {
    console.error('[Roleplay] Error parsing AI response:', aiRes.content);
    
    // Fallback: Intentar extraer el mensaje si el JSON falló
    return {
      customerResponse: aiRes.content.length > 500 ? aiRes.content.substring(0, 500) + '...' : aiRes.content,
      objectionType: 'general',
      sentiment: 'neutral',
      leadName: lead.nombre,
      systemPromptUsed: systemPrompt
    };
  }
}

/**
 * Genera el Reporte Post-Mortem de la sesión de entrenamiento.
 * Analiza el historial para dar feedback estructurado al agente y lo persiste.
 */
export async function generatePostMortem(input: { leadId: string; tenantId: string; userId: string; history: RoleplayMessage[] }) {
  const { leadId, tenantId, userId, history } = input;
  const systemPrompt = `
Eres un experto en entrenamiento de ventas de alto rendimiento.
Tu tarea es evaluar el desempeño de un agente en una simulación de roleplay de negociación.
Analiza el historial de mensajes adjunto.

CRITERIOS DE EVALUACIÓN:
1. Manejo de Objeciones: ¿Resolvió las dudas o solo las evitó?
2. Aportación de Valor: ¿Habló de beneficios o solo de características?
3. Técnica de Cierre: ¿Fue natural o forzada?
4. Escucha Activa: ¿Respondió a lo que el cliente realmente preguntaba?

Responde ÚNICAMENTE en JSON con el siguiente formato:
{
  "puntuacion_cierre": 0-100,
  "argumento_mas_fuerte": "resumen corto",
  "punto_de_mejora": "consejo accionable",
  "tecnica_detectada": "nombre de la técnica"
}
  `.trim();

  const messages: GemmaMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `HISTORIAL DE SESIÓN:\n${JSON.stringify(history)}` }
  ];

  const aiRes = await callGemma(messages, { responseMimeType: 'application/json' });

  let postMortem;
  // Marcador interno (NO forma parte del contrato público de 4 campos):
  // los tres fallbacks sintéticos —IA caída → 50, JSON roto → 60, score
  // ilegible → 60— se PERSISTEN como práctica, pero jamás celebran récord
  // personal ni high-five. La celebración exige un score real del modelo.
  let esFallback = false;
  if (aiRes.error) {
    // Fallback en caso de error de IA
    esFallback = true;
    postMortem = {
      puntuacion_cierre: 50,
      argumento_mas_fuerte: "Conexión fallida con evaluador IA",
      punto_de_mejora: "Reintentar evaluación más tarde",
      tecnica_detectada: "N/A"
    };
  } else {
    try {
      const cleanedContent = aiRes.content.replace(/```json/g, '').replace(/```/g, '').trim();
      postMortem = JSON.parse(cleanedContent);
    } catch (e) {
      esFallback = true;
      postMortem = {
        puntuacion_cierre: 60,
        argumento_mas_fuerte: "Evaluación parcial",
        punto_de_mejora: "El agente mantuvo el flujo pero la IA no pudo estructurar el reporte. Detalles: " + (aiRes.content.substring(0, 100)),
        tecnica_detectada: "Venta estándar"
      };
    }
  }

  // CONTRATO DEL POST-MORTEM (C3): la puntuación es un ENTERO 0-100 — única
  // definición, en el borde del módulo. El modelo puede colar strings
  // numéricos ("85"), valores fuera de rango (850) o null: se normaliza
  // ANTES del récord, la persistencia, la cosecha (≥90) y la puerta de
  // práctica (≥70), que consumen ESTE número. Inválido (null, texto no
  // numérico) → 60: «evaluación parcial», el mismo valor del fallback de
  // JSON roto. Sin esta normalización, un score fuera de rango corrompe el
  // récord personal y un null revienta la escritura de TrainingSession.
  const bruto = postMortem.puntuacion_cierre;
  const numero = bruto == null || bruto === '' ? NaN : typeof bruto === 'number' ? bruto : Number(bruto);
  if (!Number.isFinite(numero)) {
    // Score ilegible → mismo fallback de JSON roto (60). También es sintético:
    // el modelo no dio número, así que no puede celebrar récord.
    esFallback = true;
    postMortem.puntuacion_cierre = 60;
  } else {
    postMortem.puntuacion_cierre = Math.max(0, Math.min(100, Math.round(numero)));
  }

  // 4. Verificar si es un nuevo record personal para notificar. La
  // celebración exige un score REAL del modelo: un fallback (esFallback)
  // se persiste como práctica pero nunca dispara récord ni high-five —
  // antes, un 50 de IA caída con previo 40 se celebraba como récord.
  try {
    const previousBest = await prisma.trainingSession.findFirst({
      where: { userId, tenantId },
      orderBy: { score: 'desc' },
      select: { score: true }
    });

    if (!esFallback && postMortem.puntuacion_cierre > (previousBest?.score || 0)) {
      console.log(`[Roleplay] 🏆 Nuevo record para el usuario ${userId}: ${postMortem.puntuacion_cierre}`);
      
      // Notificar al usuario (In-App)
      await notifyUser(
        userId,
        '¡Nuevo Record de Venta! 🏆',
        `Has superado tu mejor puntuación en el simulador con un ${postMortem.puntuacion_cierre}%. ¡Sigue así!`,
        { tenantId, correlationId: `roleplay_record_${Date.now()}` }
      );

      // SOCIAL HIGH-FIVE: Notificar a todo el equipo
      const userName = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      await broadcastPushNotification(tenantId, {
        title: '¡High-Five del Equipo! 🙌',
        body: `${userName?.name || 'Un agente'} acaba de romper el récord de cierre con un score de ${postMortem.puntuacion_cierre}% 🏆`,
        tag: 'high-five'
      });
    }
  } catch (err) {
    console.error('[Roleplay] Error checking record:', err);
  }

  // 5. Persistir la sesión en la base de datos para el Ranking
  try {
    await prisma.trainingSession.create({
      data: {
        tenantId,
        userId,
        leadId,
        score: postMortem.puntuacion_cierre,
        argumentoMasFuerte: postMortem.argumento_mas_fuerte,
        puntoDeMejora: postMortem.punto_de_mejora,
        tecnicaDetectada: postMortem.tecnica_detectada,
        interacciones: history.length
      }
    });
    console.log(`[Roleplay] Session persisted for user ${userId} with score ${postMortem.puntuacion_cierre}`);

    // 5.5 PUERTA DE PRÁCTICA (bucle riesgo → roleplay): si la puntuación
    // alcanzó el mínimo, levanta la puerta de contacto del deal asociado a
    // este lead (si la tenía) y deja rastro en su línea de tiempo.
    try {
      const { TrainingGateService } = await import('@/lib/sales/training-gate-service');
      const cierre = await TrainingGateService.cerrarPuertaSiAlcanza({ tenantId, userId, leadId, score: postMortem.puntuacion_cierre });

      // EMISIÓN DE TRAINING_COMPLETED: el evento que el automation-listener
      // ya escuchaba ('capacitacion_completada') y que nadie emitía — hasta
      // ahora. Se emite SIEMPRE que la sesión termina y el deal existe, con
      // la puntuación del post-mortem; con la puerta cerrada, las
      // automatizaciones del tenant tienen el sello de «habilitado para
      // vender».
      if (cierre.dealId) {
        const deal = await prisma.deal.findUnique({
          where: { id: cierre.dealId },
          select: { titulo: true, usuarioAsignadoId: true },
        });
        const { eventBus, EVENTS } = await import('@/lib/skills/event-bus');
        eventBus.emitEvent(EVENTS.TRAINING_COMPLETED, {
          tenantId,
          userId,
          timestamp: new Date(),
          source: 'automation',
          trainingId: `gate_${cierre.dealId}`,
          employeeId: userId,
          employeeNombre: deal?.titulo ?? '',
          cursoNombre: 'Simulador de negociación (roleplay)',
          puntuacion: postMortem.puntuacion_cierre,
          certificadoEmitido: false,
        });
      }
    } catch (err) {
      console.error('[Roleplay] Error en la puerta de práctica:', err);
    }
  } catch (err) {
    console.error('[Roleplay] Error persisting training session:', err);
  }

  // 6. COSECHA DE CONOCIMIENTO — módulo propio (C4,
  // lib/sales/playbook-cosecha.ts): el umbral (>= 90) y la clasificación de
  // tema viven ALLÍ — una sola definición. La lección se guarda con la
  // OBJECIÓN REAL del cliente (último turno customer del diálogo), no con
  // una cadena fija.
  if (postMortem.puntuacion_cierre >= UMBRAL_COSECHA) {
    await cosecharMejorPractica({
      tenantId,
      agentId: userId,
      history,
      postMortem,
      score: postMortem.puntuacion_cierre,
    });
  }

  return postMortem;
}
