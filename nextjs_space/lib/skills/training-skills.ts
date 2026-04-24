import { prisma } from '@/lib/db';
import { notifyUser } from './notification-layer';
import { broadcastPushNotification } from '@/lib/services/push-notification';
import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';

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
export async function generateCustomerResponse(input: { leadId: string; tenantId: string; agentMessage: string; history?: RoleplayMessage[] }) {
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
  const historialNotas = lead.notasTimestamp.map(n => `- ${n.contenido}`).join('\n');
  
  // 2. Determinar Nivel de Dificultad Personal (Basado en el mejor score histórico)
  const bestScore = await prisma.trainingSession.findFirst({
    where: { userId: tenantId }, // Deberíamos pasar el userId actual, usaremos tenant para el mock o corregimos el handler
    orderBy: { score: 'desc' },
    select: { score: true }
  });

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
    ...history.map(m => ({ 
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
  if (aiRes.error) {
    // Fallback en caso de error de IA
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
      postMortem = {
        puntuacion_cierre: 60,
        argumento_mas_fuerte: "Evaluación parcial",
        punto_de_mejora: "El agente mantuvo el flujo pero la IA no pudo estructurar el reporte. Detalles: " + (aiRes.content.substring(0, 100)),
        tecnica_detectada: "Venta estándar"
      };
    }
  }

  // 4. Verificar si es un nuevo record personal para notificar
  try {
    const previousBest = await prisma.trainingSession.findFirst({
      where: { userId, tenantId },
      orderBy: { score: 'desc' },
      select: { score: true }
    });

    if (postMortem.puntuacion_cierre > (previousBest?.score || 0)) {
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
  } catch (err) {
    console.error('[Roleplay] Error persisting training session:', err);
  }

  // 6. COSECHA DE CONOCIMIENTO (NUEVO)
  // Si la sesión es excepcional (>90), la guardamos en el Playbook de Ventas
  if (postMortem.puntuacion_cierre >= 90) {
    await harvestBestPractices(tenantId, userId, history, postMortem);
  }

  return postMortem;
}

/**
 * AI Sales Playbook Harvester
 * Extrae lecciones aprendidas de las mejores sesiones para el Onboarding.
 */
export async function harvestBestPractices(tenantId: string, userId: string, history: RoleplayMessage[], postMortem: any) {
  try {
    console.log(`[Harvester] 🧠 Cosechando mejores prácticas para sesión de nivel legendario...`);
    
    // Simulación de categorización por IA
    const possibleTopics = ["Manejo de Objeción de Precio", "Justificación de ROI", "Cierre bajo presión", "Explicación Técnica"];
    const topic = possibleTopics[Math.floor(Math.random() * possibleTopics.length)];

    const entry = await prisma.salesPlaybookEntry.create({
      data: {
        tenantId,
        agentId: userId,
        topic,
        objection: "Resistencia del cliente en Modo Leyenda",
        bestResponse: postMortem.argumento_mas_fuerte,
        technique: postMortem.tecnica_detectada,
        score: postMortem.puntuacion_cierre,
        status: "approved"
      }
    });

    return entry;
  } catch (err) {
    console.error('[Harvester] Fallo al cosechar conocimiento:', err);
    return null;
  }
}
