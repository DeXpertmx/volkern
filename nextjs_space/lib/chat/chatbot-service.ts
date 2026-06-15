import { prisma } from '@/lib/db'
import { KnowledgeService } from '@/lib/knowledge/knowledge-service'
import { callAssistantWithFallback, OpenRouterMessage } from '@/lib/assistant/openrouter-client'
import { ChatMemoryService } from '@/lib/chat/chat-memory'

export interface ChatbotInput {
  tenantId: string
  conversationId?: string
  message: string
  channel: 'whatsapp' | 'telegram' | 'web' | 'api'
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  leadId?: string
  userId?: string
  metadata?: Record<string, unknown>
}

export interface ChatbotOutput {
  success: boolean
  response: string
  action?: 'agendar' | 'transferir' | 'ninguna'
  actionData?: Record<string, string>
  error?: string
  fueraHorario?: boolean
}

const DEFAULTS = {
  MAX_HISTORY: 10,
  AGENT_TIMEOUT_MS: 8000,
  RATE_LIMIT_MS: 2000,
}

export async function processMessage(input: ChatbotInput): Promise<ChatbotOutput> {
  const { tenantId, message, channel } = input
  const startTime = Date.now()

  try {
    const config = await getOrCreateConfig(tenantId)
    if (!config.activo) {
      return { success: false, response: '', error: 'Chatbot desactivado' }
    }

    if (input.metadata?.isTest === true) {
    } else if (!isWithinBusinessHours(config)) {
      if (config.mensajeFueraHorario) {
        return { success: true, response: config.mensajeFueraHorario, fueraHorario: true }
      }
    }

    const [tenant, services] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, nombre: true, plan: true } }),
      prisma.servicio.findMany({ where: { tenantId, activo: true } }),
    ])

    const memory = new ChatMemoryService(tenantId)

    const extRef = input.conversationId || `${channel}:${input.contactPhone || input.contactName || input.userId || 'anon'}`
    const conv = await memory.getOrCreateConversation({
      channel,
      externalRef: extRef,
      contactName: input.contactName || 'Cliente',
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      leadId: input.leadId,
    })

    if (channel === 'whatsapp') {
      const lastBotMsg = await prisma.message.findFirst({
        where: { conversationId: conv.id, direccion: 'saliente' },
        orderBy: { fechaCreacion: 'desc' },
        select: { fechaCreacion: true },
      })
      if (lastBotMsg?.fechaCreacion) {
        const msSince = Date.now() - new Date(lastBotMsg.fechaCreacion).getTime()
        if (msSince < DEFAULTS.RATE_LIMIT_MS) {
          return { success: false, response: '', error: 'rate_limit' }
        }
      }
    }

    await memory.addMessage({
      conversationId: conv.id,
      content: message,
      direction: 'entrante',
      channel,
    })

    const context = await memory.getContext(conv.id)
    const recentMessages = await memory.getMessages(conv.id, DEFAULTS.MAX_HISTORY)

    const kbArticles = await KnowledgeService.searchSemantic(tenantId, message).catch(err => {
      console.warn('[ChatbotService] Error en búsqueda semántica de KB:', err)
      return []
    })

    let kbSection = ''
    if (kbArticles.length > 0) {
      kbSection = '\n\nINFORMACIÓN DE REFERENCIA:\n' + kbArticles.map(a =>
        `[${a.category}] ${a.title}: ${a.content.substring(0, 400)}`
      ).join('\n')
    }

    const systemPrompt = buildSystemPrompt({
      config,
      tenant,
      services,
      context,
      kbSection,
      channel,
      contactName: input.contactName,
    })

    const historyMessages: OpenRouterMessage[] = recentMessages.map(m => ({
      role: m.role,
      content: m.content,
    }))

    const llmMessages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message },
    ]

    const llmResponse = await callAssistantWithFallback(llmMessages)
    const rawResponse = llmResponse.choices?.[0]?.message?.content || 'Lo siento, no pude procesar tu mensaje.'

    let finalMessage = rawResponse
    let action: ChatbotOutput['action']
    let actionData: Record<string, string> | undefined

    const agendarMatch = rawResponse.match(/\[AGENDAR:([^|]+)\|([^|]+)\|([^\]]+)\]/)
    if (agendarMatch) {
      action = 'agendar'
      actionData = {
        servicio: agendarMatch[1].trim(),
        fecha: agendarMatch[2].trim(),
        hora: agendarMatch[3].trim(),
      }
      finalMessage = rawResponse.replace(/\[AGENDAR:[^\]]+\]/, '').trim()
    }

    if (rawResponse.includes('[TRANSFERIR]')) {
      action = 'transferir'
      finalMessage = rawResponse.replace('[TRANSFERIR]', '').trim()
    }

    if (!action) {
      action = 'ninguna'
    }

    await memory.addMessage({
      conversationId: conv.id,
      content: finalMessage,
      direction: 'saliente',
      channel,
      metadata: { action, source: 'chatbot' },
    })

    if (action === 'agendar' && actionData && input.leadId) {
      await handleBooking(tenantId, conv.id, input.leadId, services, actionData)
    } else if (action === 'transferir' && input.leadId) {
      await handleTransfer(tenantId, conv.id, input.leadId, input.contactName || input.contactPhone || 'Cliente')
    }

    await prisma.chatbotConfig.update({
      where: { tenantId },
      data: { totalConversaciones: { increment: 1 } },
    }).catch(() => {})

    const elapsed = Date.now() - startTime
    console.log(`[ChatbotService] ${channel} OK en ${elapsed}ms`)

    return {
      success: true,
      response: finalMessage,
      action,
      actionData,
    }
  } catch (error) {
    console.error('[ChatbotService] Error:', error)
    return {
      success: false,
      response: 'Lo siento, ocurrió un error. Intenta de nuevo.',
      error: error instanceof Error ? error.message : 'Unknown',
    }
  }
}

function buildSystemPrompt(params: {
  config: any
  tenant: { nombre: string } | null
  services: any[]
  context: any
  kbSection: string
  channel: string
  contactName?: string
}): string {
  const { config, tenant, services, context, kbSection, channel, contactName } = params

  const servicesInfo = services.map(s =>
    `- ${s.nombre}: ${s.descripcion || 'Sin descripción'} | ${s.duracionMinutos || '?'} min | $${s.precio} ${s.moneda || 'EUR'}`
  ).join('\n')

  const isTextOnly = channel === 'whatsapp'
  const formatGuide = isTextOnly
    ? 'Usa *texto* para negritas, emojis con moderación. Máximo 3 párrafos.'
    : 'Usa formato markdown simple. Responde en 2-3 párrafos.'

  let memorySection = ''
  if (context.facts?.length > 0) {
    memorySection = '\n\nINFORMACIÓN DEL CLIENTE:\n' + context.facts.map((f: string) => `- ${f}`).join('\n')
  }
  if (context.pendingIntent && context.missingEntities?.length > 0) {
    memorySection += `\n\nACCIÓN PENDIENTE: ${context.pendingIntent}. Falta: ${context.missingEntities.join(', ')}.`
  }

  return `Eres ${config.nombreAsistente || 'Asistente Virtual'}, el asistente inteligente de ${tenant?.nombre || 'la empresa'}.

${config.contextoNegocio || 'Ayudas a clientes con información y gestión de servicios.'}
${config.personalidad || 'Eres cordial, profesional, conciso y resolutivo.'}${kbSection}

CLIENTE: ${contactName || 'Cliente'}${memorySection}

SERVICIOS DISPONIBLES:
${servicesInfo || 'No hay servicios configurados.'}

INSTRUCCIONES:
1. Responde SIEMPRE en español, sé directo y útil.
2. ${formatGuide}
3. Si el cliente pregunta por servicios, preséntalos con precio y duración.
4. Si quiere agendar, responde con: [AGENDAR:nombre_servicio|fecha|hora]
5. Si quiere hablar con un humano, responde con: [TRANSFERIR]
6. Si preguntan sobre contabilidad, IVA, IRPF, impuestos o fiscales:
   - Explica tipos de IVA: 4% (superreducido), 10% (reducido), 21% (general), 0% (exento).
   - Modelo 303: declaración trimestral de IVA.
   - Modelo 130: pago fraccionado IRPF para autónomos.
   - Modelo 390: resumen anual de IVA.
   - Modelo 111: retenciones IRPF (alquileres, profesionales).
   - Verifactu: normativa española de facturación electrónica con hash SHA-256.
7. Si preguntan sobre contabilidad general: PGC (Plan General Contable), balance de situación, cuenta de resultados (PyG), libro diario, asientos contables.
8. Si preguntan sobre la plataforma Volkern, describe sus módulos (CRM, Contabilidad, Facturación Verifactu, Web Creator, etc.).
9. NO inventes información. Si no sabes, di que lo consultarás con un asesor.
10. NO recomiendes competidores. Solo habla de Volkern.
11. Sé natural, no uses jerga técnica a menos que el cliente la use.

FECHA: ${new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
}

export function isWithinBusinessHours(config: any): boolean {
  const now = new Date()
  const dayOfWeek = now.getDay().toString()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentTimeMinutes = currentHour * 60 + currentMinute

  if (config.horariosPersonalizados && typeof config.horariosPersonalizados === 'object') {
    const daySchedule = config.horariosPersonalizados[dayOfWeek]
    if (!daySchedule || !Array.isArray(daySchedule) || daySchedule.length === 0) return false
    for (const range of daySchedule) {
      if (!range.inicio || !range.fin) continue
      const [startHour, startMin] = range.inicio.split(':').map(Number)
      const [endHour, endMin] = range.fin.split(':').map(Number)
      const startMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin
      if (currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes) return true
    }
    return false
  }

  const diasActivos = (config.diasActivos || '1,2,3,4,5').split(',')
  if (!diasActivos.includes(dayOfWeek)) return false
  if (currentHour < (config.horarioInicio || 9) || currentHour >= (config.horarioFin || 18)) return false
  return true
}

export function parseFechaHora(fecha: string, hora: string): Date | null {
  try {
    const now = new Date()
    const targetDate = new Date()
    const fechaLower = fecha.toLowerCase()

    if (fechaLower.includes('hoy')) {
    } else if (fechaLower.includes('mañana')) {
      targetDate.setDate(now.getDate() + 1)
    } else if (fechaLower.includes('pasado')) {
      targetDate.setDate(now.getDate() + 2)
    } else {
      const dateMatch = fecha.match(/(\d{1,2})\s*(?:de)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)?/i)
      if (dateMatch) {
        const day = parseInt(dateMatch[1])
        targetDate.setDate(day)
        if (targetDate < now) targetDate.setMonth(targetDate.getMonth() + 1)
      }
    }

    const horaMatch = hora.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
    if (horaMatch) {
      let hours = parseInt(horaMatch[1])
      const minutes = horaMatch[2] ? parseInt(horaMatch[2]) : 0
      const meridiem = horaMatch[3]?.toLowerCase()
      if (meridiem === 'pm' && hours < 12) hours += 12
      if (meridiem === 'am' && hours === 12) hours = 0
      targetDate.setHours(hours, minutes, 0, 0)
    }

    return targetDate
  } catch {
    return null
  }
}

async function getOrCreateConfig(tenantId: string) {
  let config = await prisma.chatbotConfig.findUnique({ where: { tenantId } })
  if (!config) {
    config = await prisma.chatbotConfig.create({
      data: { tenantId, activo: true, nombreAsistente: 'Asistente Virtual' },
    })
  }
  return config
}

async function handleBooking(
  tenantId: string,
  conversationId: string,
  leadId: string,
  services: any[],
  data: { servicio: string; fecha: string; hora: string }
): Promise<void> {
  const service = services.find(s => s.nombre.toLowerCase().includes(data.servicio.toLowerCase()))
  if (!service) return

  const fechaHora = parseFechaHora(data.fecha, data.hora)
  if (!fechaHora) return

  const cita = await prisma.cita.create({
    data: {
      tenantId,
      leadId,
      servicioId: service.id,
      tipo: 'servicio',
      titulo: `${service.nombre} - Chatbot ${data.servicio}`,
      fechaHora,
      duracion: service.duracionMinutos,
      estado: 'confirmada',
      descripcion: 'Cita agendada vía chatbot',
      origenCita: 'whatsapp',
    },
  })

  await prisma.chatbotConfig.update({
    where: { tenantId },
    data: { totalCitasAgendadas: { increment: 1 } },
  }).catch(() => {})

  console.log('[ChatbotService] Cita creada:', cita.id)
}

async function handleTransfer(
  tenantId: string,
  conversationId: string,
  leadId: string,
  contactName: string
): Promise<void> {
  await prisma.task.create({
    data: {
      tenantId,
      titulo: 'Cliente solicita atención humana',
      descripcion: `El cliente ${contactName} solicitó hablar con un asesor desde el chatbot.`,
      tipo: 'llamada',
      fechaVencimiento: new Date(),
      completada: false,
      leadId,
    },
  })

  await prisma.chatbotConfig.update({
    where: { tenantId },
    data: { totalTransferencias: { increment: 1 } },
  }).catch(() => {})

  console.log('[ChatbotService] Transferencia creada para:', contactName)
}

export async function getChatbotConfig(tenantId: string) {
  return prisma.chatbotConfig.findUnique({ where: { tenantId } })
}

export async function updateChatbotConfig(tenantId: string, data: any) {
  return prisma.chatbotConfig.upsert({
    where: { tenantId },
    update: data,
    create: { tenantId, ...data },
  })
}
