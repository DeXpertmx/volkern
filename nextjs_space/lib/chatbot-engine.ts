/**
 * Motor de Chatbot WhatsApp para Volkern CRM
 * Usa OpenRouter (DeepSeek V4 Flash + Gemini fallback) para procesar mensajes y agendar citas
 */

import { prisma } from '@/lib/db';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { callAssistantWithFallback, OpenRouterMessage } from '@/lib/assistant/openrouter-client';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatbotContext {
  tenantId: string;
  leadId: string;
  conversationId: string;
  phoneNumber: string;
  config: any;
  lead: any;
  services: any[];
}

/**
 * Procesa un mensaje entrante y genera respuesta del chatbot
 */
export async function processChatbotMessage(
  tenantId: string,
  phoneNumber: string,
  messageText: string,
  leadId: string,
  conversationId: string
): Promise<{ success: boolean; response?: string; action?: string; error?: string }> {
  try {
    console.log('\n🤖 ========== CHATBOT ENGINE ==========');
    console.log('📱 Procesando mensaje:', messageText.substring(0, 50));
    console.log('🏢 Tenant:', tenantId);

    // 1. Cargar configuración del chatbot
    let config = await prisma.chatbotConfig.findUnique({
      where: { tenantId }
    });

    // Si no existe configuración, crear una por defecto
    if (!config) {
      config = await prisma.chatbotConfig.create({
        data: {
          tenantId,
          activo: true,
          nombreAsistente: 'Asistente Virtual',
        }
      });
    }

    // Verificar si el chatbot está activo
    if (!config.activo) {
      console.log('⚠️ Chatbot desactivado para este tenant');
      return { success: false, error: 'Chatbot desactivado' };
    }

    // 2. Verificar horario de atención
    if (!isWithinBusinessHours(config)) {
      console.log('⚠️ Fuera de horario de atención');
      if (config.mensajeFueraHorario) {
        await sendWhatsAppMessage(phoneNumber, config.mensajeFueraHorario, tenantId);
        return { success: true, response: config.mensajeFueraHorario, action: 'fuera_horario' };
      }
    }

    // 3. Cargar datos del lead
    const lead = await prisma.lead.findUnique({
      where: { id: leadId }
    });

    // 4. Cargar servicios disponibles
    const services = await prisma.servicio.findMany({
      where: { tenantId, activo: true }
    });

    // 5. Cargar historial de conversación (últimos 10 mensajes)
    const recentMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { fechaCreacion: 'desc' },
      take: 10
    });

    // 6. Construir contexto para el chatbot
    const context: ChatbotContext = {
      tenantId,
      leadId,
      conversationId,
      phoneNumber,
      config,
      lead,
      services
    };

    // 7. Detectar intención y generar respuesta
    const response = await generateChatbotResponse(
      messageText,
      context,
      recentMessages.reverse()
    );

    // 8. Ejecutar acción si es necesario
    if (response.action) {
      await executeAction(response.action, context, response.actionData);
    }

    // 9. Enviar respuesta por WhatsApp
    if (response.message) {
      await sendWhatsAppMessage(phoneNumber, response.message, tenantId);
      
      // Guardar respuesta del bot en la conversación
      await prisma.message.create({
        data: {
          conversationId,
          contenido: response.message,
          direccion: 'saliente',
          canal: 'whatsapp',
          estado: 'enviado',
          metadatos: {
            source: 'chatbot',
            action: response.action,
          }
        }
      });
    }

    // 10. Actualizar estadísticas
    await prisma.chatbotConfig.update({
      where: { tenantId },
      data: {
        totalConversaciones: { increment: 1 }
      }
    });

    console.log('✅ Respuesta generada:', response.message?.substring(0, 50));
    console.log('========== FIN CHATBOT ==========\n');

    return {
      success: true,
      response: response.message,
      action: response.action
    };

  } catch (error) {
    console.error('❌ Error en chatbot:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

/**
 * Genera respuesta usando LLM
 */
async function generateChatbotResponse(
  userMessage: string,
  context: ChatbotContext,
  conversationHistory: any[]
): Promise<{ message: string; action?: string; actionData?: any }> {
  
  const { config, services, lead } = context;

  // Construir lista de servicios para el prompt
  const servicesInfo = services.map(s => 
    `- ${s.nombre}: ${s.descripcion || 'Sin descripción'} | Duración: ${s.duracionMinutos} min | Precio: $${s.precio} ${s.moneda}`
  ).join('\n');

  // Construir historial de conversación
  const historyMessages: ChatMessage[] = conversationHistory.map(msg => ({
    role: msg.direccion === 'entrante' ? 'user' : 'assistant',
    content: msg.contenido
  }));

  // Sistema prompt
  const systemPrompt = `Eres ${config.nombreAsistente}, un asistente virtual amigable y profesional.

${config.contextoNegocio || 'Ayudas a los clientes a conocer nuestros servicios y agendar citas.'}

${config.personalidad || 'Eres cordial, eficiente y siempre buscas ayudar al cliente.'}

INFORMACIÓN DEL CLIENTE:
- Nombre: ${lead?.nombre || 'Cliente'}
- Teléfono: ${context.phoneNumber}

SERVICIOS DISPONIBLES:
${servicesInfo || 'No hay servicios configurados aún.'}

INSTRUCCIONES:
1. Si el cliente pregunta por servicios, muéstralos de forma clara y amigable.
2. Si el cliente quiere agendar una cita, pregúntale qué servicio le interesa y qué fecha/hora prefiere.
3. Si detectas que quiere agendar, responde con el formato especial: [AGENDAR:servicio|fecha|hora]
4. Si el cliente quiere hablar con un humano, responde con: [TRANSFERIR]
5. Sé conciso pero amable. Usa emojis con moderación.
6. Responde siempre en español.

Fecha actual: ${new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

  // Construir mensajes para el LLM
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: userMessage }
  ];

  try {
    // Construir mensajes con historial para preservar contexto de conversación
    const llmMessages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ];

    // Llamar a OpenRouter (DeepSeek V4 Flash con fallback Gemini)
    const response = await callAssistantWithFallback(llmMessages);
    const assistantMessage = response.choices?.[0]?.message?.content || 'Lo siento, no pude procesar tu mensaje.';

    // Detectar acciones especiales en la respuesta
    let action: string | undefined;
    let actionData: any;
    let finalMessage = assistantMessage;

    // Detectar intención de agendar
    const agendarMatch = assistantMessage.match(/\[AGENDAR:([^|]+)\|([^|]+)\|([^\]]+)\]/);
    if (agendarMatch) {
      action = 'agendar';
      actionData = {
        servicio: agendarMatch[1].trim(),
        fecha: agendarMatch[2].trim(),
        hora: agendarMatch[3].trim()
      };
      // Remover el tag de la respuesta
      finalMessage = assistantMessage.replace(/\[AGENDAR:[^\]]+\]/, '').trim();
    }

    // Detectar transferencia a humano
    if (assistantMessage.includes('[TRANSFERIR]')) {
      action = 'transferir';
      finalMessage = assistantMessage.replace('[TRANSFERIR]', '').trim();
    }

    return {
      message: finalMessage,
      action,
      actionData
    };

  } catch (error) {
    console.error('Error llamando LLM:', error);
    return {
      message: 'Disculpa, estoy teniendo problemas técnicos. ¿Podrías intentar de nuevo en unos momentos?'
    };
  }
}

/**
 * Ejecuta acciones especiales (agendar cita, transferir, etc.)
 */
async function executeAction(
  action: string,
  context: ChatbotContext,
  actionData?: any
): Promise<void> {
  const { tenantId, leadId, phoneNumber } = context;

  switch (action) {
    case 'agendar':
      if (actionData) {
        await handleBookingRequest(context, actionData);
      }
      break;

    case 'transferir':
      await handleTransferRequest(context);
      break;

    default:
      console.log(`Acción desconocida: ${action}`);
  }
}

/**
 * Maneja solicitud de agendar cita
 */
async function handleBookingRequest(
  context: ChatbotContext,
  data: { servicio: string; fecha: string; hora: string }
): Promise<void> {
  try {
    const { tenantId, leadId, phoneNumber, services } = context;

    // Buscar servicio por nombre
    const service = services.find(s => 
      s.nombre.toLowerCase().includes(data.servicio.toLowerCase())
    );

    if (!service) {
      await sendWhatsAppMessage(
        phoneNumber,
        `No encontré el servicio "${data.servicio}". ¿Podrías indicarme cuál de nuestros servicios te interesa?`,
        tenantId
      );
      return;
    }

    // Parsear fecha y hora
    const fechaHora = parseFechaHora(data.fecha, data.hora);
    
    if (!fechaHora) {
      await sendWhatsAppMessage(
        phoneNumber,
        'No pude entender la fecha/hora. ¿Podrías indicarme de nuevo cuándo te gustaría agendar? Por ejemplo: "mañana a las 10am"',
        tenantId
      );
      return;
    }

    // Verificar disponibilidad
    const disponible = await checkAvailability(tenantId, fechaHora, service.duracionMinutos);
    
    if (!disponible) {
      // Obtener horarios alternativos
      const alternativas = await getAlternativeSlots(tenantId, fechaHora, service.duracionMinutos);
      
      await sendWhatsAppMessage(
        phoneNumber,
        `Lo siento, ese horario no está disponible. ¿Te funciona alguno de estos horarios?\n\n${alternativas.join('\n')}`,
        tenantId
      );
      return;
    }

    // Crear la cita
    const cita = await prisma.cita.create({
      data: {
        tenantId,
        leadId,
        servicioId: service.id,
        tipo: 'servicio',
        titulo: `${service.nombre} - ${context.lead?.nombre || 'Cliente WhatsApp'}`,
        fechaHora,
        duracion: service.duracionMinutos,
        estado: 'confirmada',
        descripcion: 'Cita agendada vía chatbot WhatsApp',
      }
    });

    // Actualizar estadísticas
    await prisma.chatbotConfig.update({
      where: { tenantId },
      data: {
        totalCitasAgendadas: { increment: 1 }
      }
    });

    // Confirmar al cliente
    const fechaFormateada = fechaHora.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    await sendWhatsAppMessage(
      phoneNumber,
      `✅ *¡Cita confirmada!*\n\n📌 *Servicio:* ${service.nombre}\n📅 *Fecha:* ${fechaFormateada}\n⏱ *Duración:* ${service.duracionMinutos} minutos\n💰 *Precio:* $${service.precio} ${service.moneda}\n\n¡Te esperamos! Si necesitas cambiar la cita, solo escríbenos.`,
      tenantId
    );

    console.log('✅ Cita creada:', cita.id);

  } catch (error) {
    console.error('Error creando cita:', error);
  }
}

/**
 * Maneja solicitud de transferencia a humano
 */
async function handleTransferRequest(context: ChatbotContext): Promise<void> {
  const { tenantId, leadId, conversationId, phoneNumber, config } = context;

  // Marcar conversación como "requiere atención"
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      estado: 'abierta', // Mantener abierta para atención humana
    }
  });

  // Actualizar estadísticas
  await prisma.chatbotConfig.update({
    where: { tenantId },
    data: {
      totalTransferencias: { increment: 1 }
    }
  });

  // Notificar al cliente
  await sendWhatsAppMessage(
    phoneNumber,
    'Entendido, te transfiero con un asesor humano. En breve alguien se pondrá en contacto contigo. 👋',
    tenantId
  );

  // Notificar al equipo creando una tarea urgente
  await prisma.task.create({
    data: {
      tenantId,
      titulo: `📢 Cliente solicita atención humana`,
      descripcion: `El cliente ${context.lead?.nombre || phoneNumber} solicitó hablar con un humano desde WhatsApp.`,
      tipo: 'llamada',
      fechaVencimiento: new Date(), // Urgente - para hoy
      completada: false,
      leadId,
    }
  });

  console.log('👤 Transferencia solicitada para:', phoneNumber);
}

/**
 * Verifica si está dentro del horario de atención
 * Soporta tanto horarios legacy como personalizados con múltiples rangos por día
 */
function isWithinBusinessHours(config: any): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay().toString();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  
  // Usar horarios personalizados si existen
  if (config.horariosPersonalizados && typeof config.horariosPersonalizados === 'object') {
    const daySchedule = config.horariosPersonalizados[dayOfWeek];
    
    // Si no hay horarios para este día, está cerrado
    if (!daySchedule || !Array.isArray(daySchedule) || daySchedule.length === 0) {
      return false;
    }
    
    // Verificar si la hora actual está dentro de algún rango
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
  const diasActivos = config.diasActivos.split(',');
  
  if (!diasActivos.includes(dayOfWeek)) {
    return false;
  }
  
  if (currentHour < config.horarioInicio || currentHour >= config.horarioFin) {
    return false;
  }
  
  return true;
}

/**
 * Parsea fecha y hora en lenguaje natural
 */
function parseFechaHora(fecha: string, hora: string): Date | null {
  try {
    const now = new Date();
    let targetDate = new Date();

    // Parsear fecha
    const fechaLower = fecha.toLowerCase();
    if (fechaLower.includes('hoy')) {
      // Ya está en targetDate
    } else if (fechaLower.includes('mañana')) {
      targetDate.setDate(now.getDate() + 1);
    } else if (fechaLower.includes('pasado')) {
      targetDate.setDate(now.getDate() + 2);
    } else {
      // Intentar parsear fecha específica
      const dateMatch = fecha.match(/(\d{1,2})\s*(de)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)?/i);
      if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        targetDate.setDate(day);
        // Si el día ya pasó, ir al próximo mes
        if (targetDate < now) {
          targetDate.setMonth(targetDate.getMonth() + 1);
        }
      }
    }

    // Parsear hora
    const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (horaMatch) {
      let hours = parseInt(horaMatch[1]);
      const minutes = horaMatch[2] ? parseInt(horaMatch[2]) : 0;
      const meridiem = horaMatch[3]?.toLowerCase();

      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;

      targetDate.setHours(hours, minutes, 0, 0);
    }

    return targetDate;
  } catch (error) {
    console.error('Error parseando fecha/hora:', error);
    return null;
  }
}

/**
 * Verifica disponibilidad para una fecha/hora
 */
async function checkAvailability(
  tenantId: string,
  fechaHora: Date,
  duracion: number
): Promise<boolean> {
  const fechaFin = new Date(fechaHora.getTime() + duracion * 60000);

  // Buscar citas que se solapan
  const citasConflicto = await prisma.cita.findMany({
    where: {
      tenantId,
      estado: { not: 'cancelada' },
      OR: [
        {
          fechaHora: {
            gte: fechaHora,
            lt: fechaFin
          }
        },
        {
          AND: [
            { fechaHora: { lte: fechaHora } },
            // La cita existente termina después del inicio solicitado
          ]
        }
      ]
    }
  });

  return citasConflicto.length === 0;
}

/**
 * Obtiene horarios alternativos disponibles
 */
async function getAlternativeSlots(
  tenantId: string,
  fechaDeseada: Date,
  duracion: number
): Promise<string[]> {
  const slots: string[] = [];
  const baseDate = new Date(fechaDeseada);
  baseDate.setHours(9, 0, 0, 0);

  // Buscar slots disponibles en los próximos 3 días
  for (let day = 0; day < 3 && slots.length < 5; day++) {
    const checkDate = new Date(baseDate);
    checkDate.setDate(baseDate.getDate() + day);

    for (let hour = 9; hour < 18 && slots.length < 5; hour++) {
      checkDate.setHours(hour, 0, 0, 0);
      
      const available = await checkAvailability(tenantId, checkDate, duracion);
      if (available) {
        slots.push(checkDate.toLocaleDateString('es-MX', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        }));
      }
    }
  }

  return slots.length > 0 ? slots : ['No hay horarios disponibles próximamente'];
}

/**
 * Obtiene la configuración del chatbot para un tenant
 */
export async function getChatbotConfig(tenantId: string) {
  return prisma.chatbotConfig.findUnique({
    where: { tenantId }
  });
}

/**
 * Actualiza la configuración del chatbot
 */
export async function updateChatbotConfig(tenantId: string, data: any) {
  return prisma.chatbotConfig.upsert({
    where: { tenantId },
    update: data,
    create: {
      tenantId,
      ...data
    }
  });
}
