import OpenAI from 'openai';
import { prisma } from '@/lib/db';

const client = new OpenAI({
  apiKey: process.env.ABACUSAI_API_KEY,
  baseURL: 'https://api.abacus.ai/v1',
});

export interface ChatbotResponse {
  success: boolean;
  response: string;
  fueraHorario?: boolean;
  error?: string;
}

/**
 * Procesa un mensaje utilizando la lógica del chatbot de Volkern
 */
export async function processChatbotMessage(
  tenantId: string,
  message: string,
  history: { role: 'user' | 'assistant' | 'system'; content: string }[] = []
): Promise<ChatbotResponse> {
  try {
    // 1. Obtener configuración
    const config = await prisma.chatbotConfig.findFirst({
      where: { tenantId, activo: true }
    });

    if (!config) {
      return { success: false, response: '', error: 'Chatbot no configurado o inactivo' };
    }

    // 2. Verificar horario
    const dentroHorario = isWithinBusinessHours(config);
    if (!dentroHorario && config.mensajeFueraHorario) {
      return { 
        success: true, 
        response: config.mensajeFueraHorario, 
        fueraHorario: true 
      };
    }

    // 3. Cargar contexto (Tenant y Servicios)
    const [tenant, servicios] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.servicio.findMany({ where: { tenantId, activo: true } })
    ]);

    // 4. Construir Prompt
    const systemPrompt = buildSystemPrompt(config, tenant, servicios);

    // 5. Llamar al LLM
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10), // Tomar últimos 10 mensajes para contexto
      { role: 'user', content: message }
    ];

    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 500,
    });

    const aiResponse = completion.choices[0]?.message?.content || 
                       'Lo siento, no pude procesar tu mensaje.';

    console.log(`[ChatbotProcessor] AI Response generated: ${aiResponse.substring(0, 50)}...`);

    // 6. Actualizar estadísticas (asíncrono)
    prisma.chatbotConfig.update({
      where: { id: config.id },
      data: { totalConversaciones: { increment: 1 } }
    }).catch(err => console.error('Error actualizando stats chatbot:', err));

    return {
      success: true,
      response: aiResponse
    };

  } catch (error) {
    console.error('[ChatbotProcessor] Error:', error);
    return { 
      success: false, 
      response: 'Error interno al procesar el mensaje.', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Verifica si está dentro del horario de atención
 */
function isWithinBusinessHours(config: any): boolean {
  const now = new Date();
  
  // Ajustar a la timezone del config si es necesario (simplificado aquí)
  // En producción se usaría una librería como date-fns-tz
  
  const dayOfWeek = now.getDay().toString();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  
  // Usar horarios personalizados si existen
  if (config.horariosPersonalizados && typeof config.horariosPersonalizados === 'object') {
    const daySchedule = config.horariosPersonalizados[dayOfWeek];
    
    if (!daySchedule || !Array.isArray(daySchedule) || daySchedule.length === 0) {
      return false;
    }
    
    for (const range of daySchedule) {
      if (!range.inicio || !range.fin) continue;
      
      const [startHour, startMin] = range.inicio.split(':').map(Number);
      const [endHour, endMin] = range.fin.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      if (currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes) {
        return true;
      }
    }
    
    return false;
  }
  
  // Fallback a horarios legacy
  const diasActivos = (config.diasActivos || "1,2,3,4,5").split(',');
  
  if (!diasActivos.includes(dayOfWeek)) {
    return false;
  }
  
  if (currentHour < config.horarioInicio || currentHour >= config.horarioFin) {
    return false;
  }
  
  return true;
}

function buildSystemPrompt(config: any, tenant: any, servicios: any[]): string {
  const serviciosList = servicios.map(s => 
    `- ${s.nombre}: ${s.duracionMinutos} minutos, $${s.precio}`
  ).join('\n');

  return `Eres ${config.nombreAsistente}, un asistente virtual de ${tenant?.nombre || 'nuestra empresa'}.
Tu objetivo es ayudar a los clientes con sus dudas y agendar citas.

${config.contextoNegocio ? `SOBRE EL NEGOCIO:\n${config.contextoNegocio}\n` : ''}
${config.personalidad ? `TU PERSONALIDAD:\n${config.personalidad}\n` : ''}

SERVICIOS DISPONIBLES:
${serviciosList || 'Consulta con nosotros para más información sobre nuestros servicios.'}

INSTRUCCIONES:
1. Sé amable, profesional y conciso.
2. Responde en español.
3. Proporciona información útil sobre los servicios.
4. Si el cliente quiere agendar una cita, explícale cómo hacerlo o pídele sus datos.
5. Si no puedes ayudar, ofrece conectar con un humano.
6. Mantén las respuestas cortas para que sean fáciles de leer en mensajería móvil.`;
}
