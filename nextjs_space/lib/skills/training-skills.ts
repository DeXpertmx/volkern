import { prisma } from '@/lib/db';
import { notifyUser } from './notification-layer';
import { broadcastPushNotification } from '@/lib/services/push-notification';

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
export async function generateCustomerResponse(leadId: string, tenantId: string, agentMessage: string, history: RoleplayMessage[] = []) {
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
Actúa estrictamente como el cliente ${lead.nombre}. Tu personalidad se basa en las notas históricas:
${historialNotas || 'No hay notas previas, actúa como un cliente escéptico interesado en servicios de CRM.'}

MODO DE DIFICULTAD: ${isHardMode ? 'LEYENDA (Extremadamente difícil, no acepta excusas, cuestiona cada coma)' : 'ESTÁNDAR'}

Reglas de Oro:
1. No cedas rápido: Si el agente ofrece un descuento, no aceptes de inmediato. Cuestiona el valor.
${isHardMode ? '1.1. Hostilidad de Presupuesto: Si el agente no justifica el ROI en 2 mensajes, corta la llamada.' : ''}
2. Objeciones Específicas: Si en el pasado mencionaste el 'presupuesto' o la 'complejidad', vuelve a esos puntos constantemente.
3. Detección de Técnica: Si el agente usa una pregunta de cierre, evalúa internamente si fue natural o forzada.
4. Cierre de Sesión: Solo acepta el trato si el agente resuelve tus 2 principales 'Pain Points' detectados en el historial.
  `.trim();

  console.log(`[Roleplay] System Prompt constructed. HardMode: ${isHardMode}`);

  // 4. Simulación de lógica avanzada de respuesta (Digital Twin)
  // En una fase posterior, esto llamaría a: await openai.chat.completions.create(...)
  const lowercaseMsg = agentMessage.toLowerCase();
  let response = "";
  let objectionType = "resistencia";
  let sentiment = "skeptical";

  // Simulación de las "Reglas de Oro"
  if (lowercaseMsg.includes('descuento') || lowercaseMsg.includes('precio especial')) {
    response = "Aprecio el gesto del descuento, pero no se trata solo del precio. Mi directiva me pregunta qué valor real aporta esto al día a día que no tengamos ya. Convénceme de que no es solo otro software más.";
    objectionType = "valor";
  } else if (lowercaseMsg.includes('presupuesto') || lowercaseMsg.includes('caro')) {
    response = "Como te mencioné antes, el presupuesto está cerrado para este trimestre. Tendría que quitarle fondos a otra área para esto. ¿Por qué debería ser prioridad?";
    objectionType = "presupuesto";
  } else if (lowercaseMsg.includes('instalar') || lowercaseMsg.includes('configurar') || lowercaseMsg.includes('complejo')) {
    response = "Me sigue preocupando la complejidad. Si mi equipo tarda semanas en aprender, habremos perdido dinero. ¿Cómo garantizas una transición sin fricción?";
    objectionType = "complejidad";
  } else if (lowercaseMsg.includes('¿cerramos?') || lowercaseMsg.includes('¿te parece bien?') || lowercaseMsg.includes('listo para empezar')) {
    response = "Siento que me estás intentando cerrar muy rápido. Aún no me has resuelto cómo integra esto con mi ERP actual, que es mi mayor dolor de cabeza ahora mismo.";
    objectionType = "cierre_forzado";
  } else {
    response = "Entiendo... pero sigo necesitando ver cómo esto impacta en la productividad real del equipo de ventas. Dame un ejemplo concreto de cómo resolviste un problema similar en mi industria.";
    objectionType = "general";
  }

  return {
    customerResponse: response,
    objectionType,
    sentiment,
    leadName: lead.nombre,
    systemPromptUsed: systemPrompt // Útil para debugging del "tono" de Gemma
  };
}

/**
 * Genera el Reporte Post-Mortem de la sesión de entrenamiento.
 * Analiza el historial para dar feedback estructurado al agente y lo persiste.
 */
export async function generatePostMortem(leadId: string, tenantId: string, userId: string, history: RoleplayMessage[]) {
  // En una implementación real, enviaríamos todo el historial a Gemma 4 con un prompt de evaluación:
  // "Evalúa el desempeño del agente en esta negociación. Puntos clave: manejo de objeciones,
  // claridad en la propuesta, técnica de cierre, empatía."

  // Análisis simulado basado en el historial
  const numInteractions = history.length;
  const mentionPrice = history.some(m => m.content.toLowerCase().includes('precio') || m.content.toLowerCase().includes('descuento'));
  const solutionMentioned = history.some(m => m.content.toLowerCase().includes('solución') || m.content.toLowerCase().includes('volkern'));
  
  let score = 70;
  let strongPoint = "Mantuvo un tono profesional durante toda la simulación";
  let improvement = "Debería profundizar más en cómo la herramienta ahorra tiempo real en el día a día";
  let technique = "Venta consultiva básica";

  if (numInteractions > 6) {
    score += 15;
    strongPoint = "Excelente persistencia y manejo de múltiples objeciones encadenadas";
  }

  if (mentionPrice) {
    technique = "Negociación por valor/precio";
  }

  if (history.some(m => m.content.toLowerCase().includes('migración') || m.content.toLowerCase().includes('datos'))) {
    score += 10;
    strongPoint = "La explicación técnica sobre la migración de datos fue muy convincente";
  }

  if (history.some(m => m.content.toLowerCase().includes('¿cerramos?') || m.content.toLowerCase().includes('proceder'))) {
    technique = "Cierre directo / Cierre de alternativa";
    if (numInteractions < 4) {
      score -= 20;
      improvement = "Intentó cerrar el trato demasiado pronto, sin haber validado primero todos los puntos de dolor";
    } else {
      score += 5;
    }
  }

  const postMortem = {
    puntuacion_cierre: Math.min(score, 100),
    argumento_mas_fuerte: strongPoint,
    punto_de_mejora: improvement,
    tecnica_detectada: technique
  };

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
        interacciones: numInteractions
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
