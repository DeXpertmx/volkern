import { prisma } from '@/lib/db'
import { DESTRUCTIVE_INTENT_LABELS } from '@/lib/agents/destructive-labels'
import { KnowledgeService } from '@/lib/knowledge/knowledge-service'
import { callAssistantWithFallback, callAssistantWithToolLoop, OpenRouterMessage, OpenRouterTool } from '@/lib/assistant/openrouter-client'
import { ChatMemoryService, filterClickedQuickReplies, isQuickReplyMatch } from '@/lib/chat/chat-memory'
import { extractFacts, formatFacts } from '@/lib/agents/fact-extractor'
import type { ExtractedFact } from '@/lib/agents/fact-extractor'
import { rerankResults, buildKbBlock } from '@/lib/knowledge/reranker'
import { needsSummarization, generateSummary, buildSummaryBlock } from '@/lib/chat/conversation-summarizer'
import { analyzeConversation } from '@/lib/chat/conversation-analyzer'
import { detectPatterns } from '@/lib/chat/pattern-detector'
import { generateSuggestions } from '@/lib/chat/improvement-engine'

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
  quickReplies?: string[]
  /** Acciones inline de tareas (Telegram): completar/reprogramar por tarea */
  taskButtons?: { taskId: string; titulo: string }[]
}

const DEFAULTS = {
  MAX_HISTORY: 20,
  AGENT_TIMEOUT_MS: 8000,
  RATE_LIMIT_MS: 2000,
}

const MISSING_ENTITY_PROMPTS: Record<string, string> = {
  date: '📅 ¿Para qué fecha? (puedes decir "mañana", "hoy", o una fecha específica)',
  time: '⏰ ¿A qué hora? (ej: 10:00, 14:30)',
  service: '📋 ¿Qué servicio o producto necesitas?',
  customer_name: '👤 ¿Cuál es tu nombre?',
  nombre: '👤 ¿Cuál es el nombre?',
  email: '📧 ¿Cuál es el correo electrónico?',
  phone: '📱 ¿Cuál es el número de teléfono?',
  telefono: '📱 ¿Cuál es el número de teléfono?',
  empresa: '🏢 ¿Cuál es su empresa?',
  cargo: '💼 ¿Cuál es su cargo o puesto?',
  linkedin: '🔗 ¿Cuál es su perfil de LinkedIn?',
  ubicacion: '📍 ¿Cuál es su ubicación?',
  tags: '🏷️ ¿Algunas etiquetas? (separadas por coma)',
  monto: '💰 ¿Cuál es el monto?',
  concepto: '📝 ¿Cuál es el concepto?',

  // Facturación
  factura: '🧾 ¿Cuál es el número de la factura? (ej: FAC-001 o #123)',
  razon: '❓ ¿Cuál es el motivo de la rectificación?',
  cliente: '👤 ¿Para quién es? (nombre o email del cliente)',
  titulo: '📝 ¿Cuál es el título?',
  contexto: '📋 ¿Puedes darme más contexto?',
  appointment_id: '🔖 ¿Cuál es el ID de la cita?',
  leadId: '🔖 ¿Cuál es el ID del lead?',
  producto: '🛒 ¿Qué producto?',
  cantidad: '🔢 ¿Cuántos?',
  contenido: '📝 ¿Cuál es el contenido?',
  tipo: '📋 ¿De qué tipo es?',
  motivo: '📋 ¿Cuál es el motivo?',

  // Insurance
  numeroPoliza: '🔖 ¿Cuál es el número de póliza?',
  fechaVencimiento: '📅 ¿Cuándo vence la póliza? (ej: 2026-12-31)',
  fechaInicio: '📅 ¿Cuándo inicia la cobertura? (si no lo indicas, se usa hoy)',
  aseguradora: '🏢 ¿Con qué aseguradora? (ej: AXA, MAPFRE, Qualitas)',
  ramo: '📋 ¿Qué ramo de seguro? (auto, vida, hogar, salud…)',
  primaAnual: '💰 ¿Cuál es la prima anual?',
  sumaAsegurada: '🛡️ ¿Cuál es la suma asegurada?',
  formaPago: '💳 ¿Cuál es la forma de pago? (ANUAL, SEMESTRAL, TRIMESTRAL, MENSUAL)',

  dias: '📅 ¿En cuántos días? (ej: 30, 60, 90)',
  riesgo: '⚠️ ¿Incluir solo renovaciones en riesgo? (true/false)',
  estado: '📋 ¿A qué estado? (en trámite, abierto, pagado, rechazado, cerrado…)',

  // Siniestros
  siniestro: '🔖 ¿A qué siniestro te refieres? (ej: SIN-001)',
  numeroSiniestro: '🔖 ¿Quieres asignar un número al siniestro? (ej: SIN-101)',
  poliza: '🔖 ¿Contra qué póliza es? Dame el número de póliza.',
  descripcion: '📝 ¿Qué pasó? Describe brevemente el siniestro.',
  montoReclamado: '💰 ¿Cuál es el monto reclamado?',
  montoIndemnizado: '💰 ¿Cuánto se va a indemnizar?',
  motivoRechazo: '📋 ¿Cuál es el motivo del rechazo?',

  // Logística
  tracking: '🔢 ¿Cuál es el número de tracking? (ej: TRK-12345)',
  pedidoId: '🧾 ¿Cuál es el número o referencia del pedido? (ej: #ORD-456)',
  vehiculoId: '🚛 ¿De qué vehículo? (ej: VEH-001 o la matrícula)',
  almacenId: '🏭 ¿De qué almacén? (ej: principal, central)',

  // RRHH
  solicitudId: '🔖 ¿Qué solicitud de vacaciones? (ej: #123 o el nombre del empleado)',
  nota: '📝 ¿Quieres agregar una nota? (ej: nota: "Disfruta tus días")',
  empleadoId: '👤 ¿De qué empleado? (ej: nombre del colaborador)',

  // Marketing
  tema: '🎯 ¿Sobre qué tema? (ej: nuestro nuevo producto)',
  formato: '📮 ¿En qué formato? (email, LinkedIn, YouTube, TikTok)',
  tono: '🎨 ¿Qué tono prefieres? (profesional, amigable, agresivo, educativo)',
  texto: '💬 ¿Qué texto o comentarios quieres analizar?',
  tipoBloque: '🧱 ¿Qué tipo de bloque? (hero, features, testimonials, cta, pricing…)',
  tituloPagina: '📄 ¿Para qué página? (ej: servicios, ventas, contacto)',

  // ADS
  campania: '📣 ¿De qué campaña? (ej: verano, Meta, Google Ads)',
  test: '🧪 ¿De qué test A/B? (ej: el de la campaña de verano)',
  programacion: '⏰ ¿Qué programación quieres eliminar? (ej: la de la campaña de Meta)',
  variante: '🔀 ¿Qué variante declaras ganadora? (A, B, C…)',

  // Proyecciones financieras
  pais: '🌎 ¿De qué país o jurisdicción? (ej: España, México, USA/LLC)',
  region: '🌎 ¿De qué país o jurisdicción? (ej: España, México, USA/LLC)',

  // ERP Industrial (producción, calidad, proyectos)
  ordenProduccionId: '🏭 ¿De qué orden de producción es la merma? (ej: #OP-001 o el batch)',
  resultado: '✅ ¿Cuál es el resultado de la inspección? (aprobado o rechazado)',
  proyectoId: '📐 ¿De qué proyecto? (ej: su nombre)',
  proyecto: '📐 ¿De qué proyecto? (ej: su nombre)',

  // Real Estate
  propiedad: '🏠 ¿De qué propiedad? (ej: #PROP-001, la casa del centro, el departamento en la playa)',
  propiedadId: '🏠 ¿De qué propiedad? (ej: #PROP-001, la casa del centro)',
  tipo_operacion: '🏷️ ¿En venta o en alquiler?',
  tipo_inmueble: '🏗️ ¿Qué tipo? (casa, departamento, oficina, terreno)',
  zona: '📍 ¿En qué zona o ciudad?',
  habitaciones: '🔢 ¿Cuántas habitaciones mínimo?',
  presupuesto: '💰 ¿Cuál es el presupuesto? (ej: 500k, 300 mil)',
}

// ─── Confirmación de registro de contacto (agendar_cita multi-turno) ───────
// Cuando la persona del agendado NO está en el CRM, el bot pregunta antes de
// registrarla. Estas funciones reconocen la respuesta del usuario (sí/no).
const RE_CONFIRMA_SI = /^(?:s[ií]|claro|ok|oka?y|dale|adelante|confirmo|confirmar|de acuerdo|registra|registrarla|reg[ií]strala|agr[eé]gala|agr[eé]galo|hazlo|hazla|por supuesto|venga|v[aá]|bueno|listo|exacto|correcto|adelante,? s[ií])[\s.,!?]*$/i
const RE_CONFIRMA_NO = /^(?:no|nop|nope|no gracias|mejor no|cancelar|cancela|detente|para|quita|no registres|no lo registres|no,? gracias)[\s.,!?]*$/i

function esConfirmacionPositiva(message: string): boolean {
  return RE_CONFIRMA_SI.test(message.trim())
}

function esConfirmacionNegativa(message: string): boolean {
  return RE_CONFIRMA_NO.test(message.trim())
}

function extraerDatosContacto(message: string): { email?: string; telefono?: string; empresa?: string } {
  const email = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
  const telefono = message.match(/(?:tel(?:éfono)?|móvil|movil|phone)?\s*[:\-]?\s*(\+?\d[\d\s().-]{7,}\d)/i)?.[1]?.trim()
  // Empresa: primero con la palabra clave ("empresa X"), luego el segmento que
  // queda tras email y teléfono en "email, teléfono, empresa" (sin necesidad de
  // escribir la palabra empresa), y por último cualquier texto suelto al final.
  let empresa = message.match(/\b(?:empresa|compañ[ií]a|compania)\s*(?:es|:)?\s*([^,;\n]+?)(?=\s*(?:,|;|tel(?:éfono)?|móvil|movil|$))/i)?.[1]?.trim()
  if (!empresa) {
    // Dividir por comas y tomar el primer segmento que no sea email ni teléfono
    // y que no contenga palabras de relleno de la frase original.
    const partes = message.split(',').map((p) => p.trim()).filter(Boolean)
    const noEsEmail = (s: string) => !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(s)
    const noEsTelefono = (s: string) => !/^\+?\d[\d\s().-]{7,}\d$/.test(s.replace(/^(?:tel(?:éfono)?|móvil|movil|phone)\s*[:\-]?\s*/i, ''))
    const candidata = partes.find((p) => noEsEmail(p) && noEsTelefono(p))
    if (candidata && !/^(?:si|sí|no|email|tel(?:éfono)?|móvil|movil|empresa)$/i.test(candidata)) {
      empresa = candidata
    }
  }
  return { email, telefono, empresa }
}

function mensajeSolicitarDatosContacto(nombre: string): string {
  return `📇 Para registrar a *${nombre || 'esta persona'}* necesito su **email real**. No inventaré ningún dato ni enviaré correos a direcciones ficticias.\n\nEnvíame el email y, si los tienes, también teléfono y empresa (por ejemplo: *persona@empresa.com, teléfono +34..., empresa ...*).`
}

// ─── Confirmación de acciones destructivas (regla de seguridad) ─────────────
// Reglas claras del bot:
//   • NUNCA se borra información. Las acciones marcadas como destructivas
//     (borrar, eliminar, finalizar irreversiblemente) requieren confirmación
//     explícita sí/no ANTES de ejecutarse.
//   • CANCELAR ≠ BORRAR: cancelar una cita/factura deja rastro y es un flujo
//     permitido sin la puerta de confirmación destructiva.
//   • Toda orden queda auditada: quién (chat/usuario), cuándo (timestamp),
//     motivo y desde dónde se dio la orden.

function mensajeConfirmarDestructivo(intent: string): string {
  const descripcion = DESTRUCTIVE_INTENT_LABELS[intent] || `ejecutar la acción *${intent}*`
  return `⚠️ *Esta acción es sensible*: vas a ${descripcion}.\n\nNo se puede deshacer y quedará registrada con tu usuario, fecha y motivo.\n\n¿Confirmas que quiero ejecutarla? Responde *sí* o *no*.`
}

function mensajeParaClasificarCita(params: Record<string, any>): string {
  const tipo = params.tipo ? ` por ${params.tipo}` : ''
  const email = params.email ? ` con email ${params.email}` : ''
  const telefono = params.telefono ? ` teléfono ${params.telefono}` : ''
  const empresa = params.empresa ? ` empresa ${params.empresa}` : ''
  return `Agendar una cita con ${params.nombre || params.email} el ${params.fecha} a las ${params.hora}${tipo}${email}${telefono}${empresa}`
}

/**
 * Reconstruye la orden de envío tras completar los datos del contacto en el
 * flujo de autoregistro, para que el clasificador vuelva a extraer
 * email/nombre/mensaje y el wrapper reciba registrarContacto=true por contexto.
 */
function mensajeParaClasificarEnvio(params: Record<string, any>): string {
  const destinatario = params.email || params.nombre || ''
  const canal = params.canal ? ` por ${params.canal}` : ''
  const contenido = params.mensaje || params.contenido || ''
  return `Enviar mensaje a ${destinatario}${canal}${contenido ? `: ${contenido}` : ''}`
}

/**
 * ¿La persona indicada para agendar ya está en el CRM del tenant?
 * Espejo de la búsqueda del wrapper (lead → contacto, por nombre o email).
 */
async function personaExisteEnCrm(tenantId: string, params: Record<string, any>): Promise<boolean> {
  const nombre = params.nombre
  const email = params.email
  if (!nombre && !email) return true // sin identidad → el wrapper pedirá los datos
  if (email) {
    const emailNorm = String(email).trim().toLowerCase()
    const [lead, contact] = await Promise.all([
      prisma.lead.findFirst({ where: { tenantId, email: emailNorm } }),
      prisma.contact.findFirst({ where: { tenantId, email: emailNorm } }),
    ])
    if (lead || contact) return true
  }
  if (nombre) {
    const [lead, contact] = await Promise.all([
      prisma.lead.findFirst({ where: { tenantId, nombre: { contains: String(nombre), mode: 'insensitive' } } }),
      prisma.contact.findFirst({ where: { tenantId, nombre: { contains: String(nombre), mode: 'insensitive' } } }),
    ])
    if (lead || contact) return true
  }
  return false
}

function mensajeConfirmarRegistro(nombre: string): string {
  const nombreLimpio = nombre && nombre.trim().length > 0 ? nombre : 'esa persona'
  return `👤 *${nombreLimpio}* no está registrado(a) en tu CRM.\n¿Quieres registrarlo(a) como lead y agendar la cita? Responde *sí* o *no*.`
}

function mensajeConfirmarRegistroEnvio(nombre: string): string {
  const nombreLimpio = nombre && nombre.trim().length > 0 ? nombre : 'esa persona'
  return `👤 *${nombreLimpio}* no está registrado(a) en tu CRM.\n¿Quieres registrarlo(a) como lead y enviar el mensaje? Responde *sí* o *no*.`
}

function mensajeConfirmarRegistroPorIntent(intent: string, nombre: string): string {
  return intent === 'enviar_mensaje'
    ? mensajeConfirmarRegistroEnvio(nombre)
    : mensajeConfirmarRegistro(nombre)
}

function mensajeParaClasificarPorIntent(intent: string, params: Record<string, any>): string {
  return intent === 'enviar_mensaje'
    ? mensajeParaClasificarEnvio(params)
    : mensajeParaClasificarCita(params)
}

function mensajeRegistroCancelado(intent: string, nombre: string): string {
  const nombreLimpio = nombre && nombre.trim().length > 0 ? nombre : 'esa persona'
  if (intent === 'enviar_mensaje') {
    return `❌ Entendido, no registré a *${nombreLimpio}* ni envié el mensaje.\nSi quieres enviar a otra persona, dímelo.`
  }
  return `❌ Entendido, no registré a *${nombreLimpio}* ni agendé la cita.\nSi quieres agendar con otra persona, dímelo.`
}

export async function processMessage(input: ChatbotInput): Promise<ChatbotOutput> {
  const { tenantId, message, channel } = input
  const startTime = Date.now()

  try {
    // Imports dinámicos para romper dependencia circular con lib/skills
    const [{ intentClassifier }, { SkillOrchestratorAgent }, { ExecutionEngine }] = await Promise.all([
      import('@/lib/agents/intent-classifier'),
      import('@/lib/agents/skill-orchestrator'),
      import('@/lib/agents/execution-engine'),
    ])
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
    let classificationMessage = message

    // ═══ 0b. RESOLVER CONFIRMACIÓN DE CONTACTO (multi-turno) ═══
    // El bot preguntó "¿registro a X como lead?" y el usuario responde sí/no.
    // Se resuelve ANTES de clasificar para que el siguiente turno ejecute el
    // skill con registrarContacto=true (o cancele el flujo).
    // Aplica a agendar_cita y enviar_mensaje (ambos registran el contacto).
    if (
      (context.pendingIntent === 'agendar_cita' || context.pendingIntent === 'enviar_mensaje') &&
      context.missingEntities?.includes('confirmar_registro')
    ) {
      const nombrePendiente = String(context.collectedEntities?.nombre || context.collectedEntities?.email || '')

      if (esConfirmacionPositiva(message)) {
        const datosPrevios = context.collectedEntities || {}
        const datosContacto = extraerDatosContacto(message)
        const collected = {
          ...datosPrevios,
          ...datosContacto,
          registrarContacto: 'true',
        }
        context.collectedEntities = collected

        // El nombre/fecha/hora ya están en contexto. Si no hay email real,
        // detener el flujo y solicitarlo; nunca generar un email sintético.
        if (!collected.email) {
          context.missingEntities = ['datos_contacto']
          await memory.updateContext(conv.id, {
            missingEntities: context.missingEntities,
            collectedEntities: collected,
          })
          const finalMessage = mensajeSolicitarDatosContacto(nombrePendiente)
          await memory.addMessage({
            conversationId: conv.id,
            content: finalMessage,
            direction: 'saliente',
            channel,
            metadata: { source: 'chatbot', intent: 'agendar_cita', needsMoreInfo: true, missingEntity: 'datos_contacto' },
          })
          console.log('[ChatbotService] Registro confirmado pero faltan datos reales del contacto')
          return { success: true, response: finalMessage }
        }

        context.missingEntities = []
        await memory.updateContext(conv.id, {
          missingEntities: [],
          collectedEntities: collected,
        })
        classificationMessage = mensajeParaClasificarPorIntent(context.pendingIntent, collected)
        console.log('[ChatbotService] Contacto confirmado con email real: continuando ejecución')
      } else if (esConfirmacionNegativa(message)) {
        const finalMessage = mensajeRegistroCancelado(context.pendingIntent, nombrePendiente)
        await memory.updateContext(conv.id, { pendingIntent: undefined, missingEntities: [], collectedEntities: {} })
        await memory.addMessage({
          conversationId: conv.id,
          content: finalMessage,
          direction: 'saliente',
          channel,
          metadata: { source: 'chatbot', intent: context.pendingIntent, needsMoreInfo: false },
        })
        return { success: true, response: finalMessage }
      } else {
        // Respuesta ambigua → volver a preguntar (sin perder el estado pendiente)
        return { success: true, response: mensajeConfirmarRegistroPorIntent(context.pendingIntent, nombrePendiente) }
      }
    }

    // ═══ 0c. RECIBIR DATOS REALES DEL CONTACTO ═══
    // Segundo paso después de que el usuario confirmó el registro: el email es
    // obligatorio porque el modelo Lead lo exige y no se permite inventarlo.
    if (
      (context.pendingIntent === 'agendar_cita' || context.pendingIntent === 'enviar_mensaje') &&
      context.missingEntities?.includes('datos_contacto')
    ) {
      const nombreDatosPendientes = String(context.collectedEntities?.nombre || context.collectedEntities?.email || 'esta persona')
      const datosContacto = extraerDatosContacto(message)
      if (!datosContacto.email) {
        const finalMessage = mensajeSolicitarDatosContacto(nombreDatosPendientes)
        await memory.addMessage({
          conversationId: conv.id,
          content: finalMessage,
          direction: 'saliente',
          channel,
          metadata: { source: 'chatbot', intent: 'agendar_cita', needsMoreInfo: true, missingEntity: 'datos_contacto' },
        })
        return { success: true, response: finalMessage }
      }

      const collected = {
        ...(context.collectedEntities || {}),
        ...datosContacto,
        registrarContacto: 'true',
      }
      context.collectedEntities = collected
      context.missingEntities = []
      await memory.updateContext(conv.id, {
        missingEntities: [],
        collectedEntities: collected,
      })
      classificationMessage = mensajeParaClasificarPorIntent(context.pendingIntent, collected)
      console.log('[ChatbotService] Datos reales recibidos para el contacto: continuando ejecución')
    }

    // ═══ 0d. RESOLVER CONFIRMACIÓN DE ACCIÓN DESTRUCTIVA (sí/no) ═══
    // El bot preguntó "¿Confirmas ejecutar X?" (acción destructiva/sensible) y
    // el usuario responde sí/no. Si confirma, se ejecuta el intent pendiente
    // con sus entidades guardadas; si no, se aborta y queda auditado como
    // BLOCKED_SECURITY (quién rechazó qué, cuándo).
    let overrideClassification: any = undefined
    if (context.pendingIntent && context.missingEntities?.includes('confirmar_destructivo')) {
      const intentPendiente = context.pendingIntent
      const entitiesPendientes = { ...(context.collectedEntities || {}) }
      if (esConfirmacionPositiva(message)) {
        context.missingEntities = []
        await memory.updateContext(conv.id, {
          missingEntities: [],
          collectedEntities: entitiesPendientes,
        })
        // Clasificación sintética: ejecutar el intent pendiente ya confirmado
        overrideClassification = {
          intent: intentPendiente,
          extractedParams: entitiesPendientes,
          confidence: 1,
          needsMoreInfo: false,
          missingParams: [],
        }
        console.log(`[ChatbotService] Acción destructiva CONFIRMADA: ${intentPendiente}`)
      } else if (esConfirmacionNegativa(message)) {
        await memory.updateContext(conv.id, { pendingIntent: undefined, missingEntities: [], collectedEntities: {} })
        const finalMessage = `✅ Entendido, *NO ejecuté* ${DESTRUCTIVE_INTENT_LABELS[intentPendiente] || intentPendiente}. No se modificó nada.`
        await memory.addMessage({
          conversationId: conv.id,
          content: finalMessage,
          direction: 'saliente',
          channel,
          metadata: { source: 'chatbot', intent: intentPendiente, needsMoreInfo: false, blockedSecurity: true },
        })
        // Auditoría: quién rechazó qué acción destructiva y cuándo
        try {
          await (prisma as any).chatbotAuditLog.create({
            data: {
              tenantId,
              sessionId: conv.id,
              telegramUserId: String(input.userId || conv.id),
              intent: intentPendiente,
              skillParams: entitiesPendientes,
              inputRaw: message,
              status: 'BLOCKED_SECURITY',
              errorMessage: 'Usuario rechazó la confirmación de acción destructiva',
            },
          })
        } catch (err) {
          console.warn('[ChatbotService] No se pudo auditar el rechazo destructivo:', err)
        }
        console.log(`[ChatbotService] Acción destructiva RECHAZADA: ${intentPendiente}`)
        return { success: true, response: finalMessage }
      } else {
        // Respuesta ambigua → volver a preguntar (sin perder el estado pendiente)
        return { success: true, response: mensajeConfirmarDestructivo(intentPendiente) }
      }
    }

    // ═══ Click vs free-text tracking ═══
    // Detect if the user's message resolves to one of the chips we last offered.
    // If yes: mark it as clicked (so we can dedupe it on the next offer).
    // If no (free text): clear the clicked list so each new search can re-explore.
    const lastOffered = context.lastOfferedQuickReplies ?? []
    const isClick =
      lastOffered.length > 0 &&
      lastOffered.some(offered => isQuickReplyMatch(offered, message))

    if (isClick) {
      await memory.markClickedQuickReply(conv.id, message)
      context.clickedQuickReplies = [...context.clickedQuickReplies, message]
      context.lastOfferedQuickReplies = undefined
    } else if (message.trim().length > 0 && context.clickedQuickReplies.length > 0) {
      // Free-text — reset the session so subsequent offers are not artificially constrained
      await memory.clearClickedQuickReplies(conv.id)
      context.clickedQuickReplies = []
    }

    // ═══ 1. CLASIFICAR INTENCIÓN ═══
    // Si el usuario acaba de confirmar una acción destructiva (bloque 0d), se
    // ejecuta el intent pendiente directamente sin re-clasificar el "sí".
    const classification = overrideClassification ?? (await intentClassifier.classify({
      message: classificationMessage,
      userId: input.userId || input.leadId || conv.id,
      tenantId,
      context: context.facts?.length > 0
        ? 'Hechos conocidos: ' + context.facts.join(', ')
        : undefined,
      // Contexto multi-turno: el clasificador continúa la acción pendiente
      pendingIntent: context.pendingIntent,
      collectedEntities: context.collectedEntities,
      missingEntities: context.missingEntities,
    }))

    // ═══ 1b. ¿ES ACCIÓN EJECUTABLE? ═══
    // Se calcula ANTES del RAG: para acciones (crear contacto, agendar, etc.)
    // no se necesitan embeddings ni reranker (solo sirven a consultas generales),
    // y omitirlos evita que el pipeline exceda el timeout de 25s de Telegram.
    const isActionable = classification.intent !== 'consulta_general'
      && classification.intent !== 'unknown'
      && classification.confidence >= 0.5

    // ═══ FASE 2: EXTRAER FACTS DEL CLIENTE ═══
    // Para acciones: fire-and-forget (los facts se persisten para turnos futuros
    // sin bloquear la ejecución del skill — una llamada LLM menos en el camino crítico).
    // Para consultas: se espera porque los facts nuevos enriquecen la respuesta del LLM.
    let newFacts: ExtractedFact[] = []
    if (isActionable) {
      extractFacts(message, context.facts, {
        intent: classification.intent,
        tenantName: tenant?.nombre,
      }).then(facts => {
        if (facts.length > 0) {
          const factStrings = formatFacts(facts)
          return Promise.all(factStrings.map(f => memory.addFact(conv.id, f)))
        }
      }).catch(err => console.warn('[ChatbotService] Error extrayendo facts (fire-and-forget):', err))
    } else {
      newFacts = await extractFacts(message, context.facts, {
        intent: classification.intent,
        tenantName: tenant?.nombre,
      })

      if (newFacts.length > 0) {
        const factStrings = formatFacts(newFacts)
        for (const fact of factStrings) {
          await memory.addFact(conv.id, fact)
        }
        // Recargar contexto con los nuevos facts
        context.facts = [...context.facts, ...factStrings]
      }
    }

    // ═══ FASE 2: RAG CON RE-RANKING (solo para consultas, no para acciones) ═══
    let kbSection = ''
    let catalogSection = ''
    if (!isActionable) {
      // Solo buscar en KB si el RAG está activo en la configuración
      const kbArticles = config.ragActivo !== false
        ? await KnowledgeService.searchSemantic(tenantId, message).catch(err => {
            console.warn('[ChatbotService] Error en búsqueda semántica de KB:', err)
            return []
          })
        : []

      // ═══ FASE 2b: CATÁLOGO VISIBLE PARA CHATBOT ═══
      const catalogItems = config.ragActivo !== false
        ? await KnowledgeService.searchCatalogItems(tenantId, message).catch(err => {
            console.warn('[ChatbotService] Error en búsqueda de catálogo:', err)
            return []
          })
        : []

      if (kbArticles.length > 0) {
        // Pasar por el reranker para mejorar relevancia
        const conversationContext = context.facts.length > 0
          ? context.facts.slice(-5).join('. ')
          : undefined

        const rankedResults = await rerankResults(
          message,
          kbArticles.map(a => ({
            ...a,
            similarity: (a as any).similarity,
          })),
          conversationContext
        ).catch(err => {
          console.warn('[ChatbotService] Error en reranker, usando resultados originales:', err)
          return null
        })

        if (rankedResults && rankedResults.length > 0) {
          kbSection = buildKbBlock(rankedResults)
        } else {
          // Fallback: estructura original
          kbSection = '\n\nINFORMACIÓN DE REFERENCIA:\n' + kbArticles.slice(0, 3).map(a =>
            `[${a.category}] ${a.title}: ${a.content.substring(0, 400)}`
          ).join('\n')
        }
      }

      // ═══ Inyectar resultados del catálogo ═══
      if (catalogItems.length > 0) {
        catalogSection = '\n\nCATÁLOGO DE PRODUCTOS/SERVICIOS DISPONIBLES:\n' + catalogItems.map(item =>
          `[${item.category}] ${item.title}: ${(item.content || '').substring(0, 400)}`
        ).join('\n')
      }
    }

    // ═══ FASE 2: RESUMEN AUTOMÁTICO ═══
    let summaryBlock = ''
    if (context.summary?.text) {
      summaryBlock = buildSummaryBlock(context.summary as any)
    }

    // Verificar si necesitamos generar/actualizar resumen
    const shouldSummarize = needsSummarization(
      recentMessages.length,
      (context.summary as any)?.version
    )

    // ═══ HELPER: Generar resumen si es necesario (fire-and-forget) ═══
    const triggerSummary = () => {
      if (shouldSummarize) {
        generateSummary(
          recentMessages.map(m => ({ role: m.role, content: m.content })),
          context.summary as any
        ).then(async (newSummary) => {
          await memory.updateContext(conv.id, { summary: newSummary })
          console.log(`[ChatbotService] ✅ Resumen generado (${newSummary.summarizedMessages} mensajes resumidos)`)
        }).catch(err => {
          console.warn('[ChatbotService] Error generando resumen:', err)
        })
      }
    }

    // ═══ HELPER FASE 3: Análisis post-conversación y detección de patrones (fire-and-forget) ═══
    const triggerPostAnalysis = () => {
      // Ejecutar en background sin bloquear la respuesta
      Promise.resolve().then(async () => {
        try {
          const allMessages = await memory.getMessages(conv.id, 50)
          if (allMessages.length < 4) return // Muy pocos mensajes para analizar

          const auditLogs = await prisma.chatbotAuditLog.findMany({
            where: {
              tenantId,
              sessionId: conv.id,
              createdAt: { gte: new Date(Date.now() - 3600000) },
            },
            select: { intent: true, skillExecuted: true, status: true, errorMessage: true },
            take: 50,
          })

          // 1. Analizar conversación
          const analysis = await analyzeConversation(
            conv.id,
            tenantId,
            allMessages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })),
            auditLogs as any
          )

          // 2. Detectar patrones (cada ~10 conversaciones)
          const totalAnalyses = await prisma.chatbotAuditLog.count({
            where: { tenantId, intent: 'conversation_analysis', createdAt: { gte: new Date(Date.now() - 86400000) } } as any,
          })

          if (totalAnalyses % 10 === 0 && totalAnalyses > 0) {
            const patterns = await detectPatterns(tenantId) as any
            if (patterns.length > 0) {
              await generateSuggestions(tenantId, patterns as any)
            }
          }

          // 3. Si la conversación terminó (estado cerrada), cerrar análisis
          if (analysis.resolved || analysis.sentiment === 'frustrated') {
            await memory.closeConversation(conv.id)
          }
        } catch (err) {
          console.warn('[ChatbotService] Error en post-analysis:', err)
        }
      })
    }

    // ═══ 1c. AGENDAR CITA: CONTACTO NO REGISTRADO → PEDIR CONFIRMACIÓN ═══
    // Antes de ejecutar create_booking, si la persona no está en el CRM (ni
    // como lead ni como contacto) y el usuario aún no confirmó el registro,
    // se pregunta en vez de auto-registrar silenciosamente (lo que el usuario
    // reportó como "no se agendó" con datos inventados).
    // Red de seguridad: aunque el clasificador pierda el flag por alguna ruta
    // no fusionada, si el usuario YA confirmó el registro en un turno previo
    // (está en el contexto persistido), no se vuelve a preguntar.
    const yaConfirmadoRegistro =
      String(classification.extractedParams?.registrarContacto || '') === 'true' ||
      String(context.collectedEntities?.registrarContacto || '') === 'true'
    if (
      isActionable &&
      !classification.needsMoreInfo &&
      (classification.intent === 'agendar_cita' || classification.intent === 'enviar_mensaje') &&
      !yaConfirmadoRegistro
    ) {
      const yaRegistrado = await personaExisteEnCrm(tenantId, classification.extractedParams || {})
      if (!yaRegistrado) {
        const nombrePendiente = String(
          classification.extractedParams?.nombre || classification.extractedParams?.email || ''
        )
        const pregunta = mensajeConfirmarRegistroPorIntent(classification.intent, nombrePendiente)

        // Guardar el intent pendiente para el siguiente turno (sí/no)
        await memory.updateContext(conv.id, {
          pendingIntent: classification.intent,
          missingEntities: ['confirmar_registro'],
          collectedEntities: { ...(classification.extractedParams || {}) },
        })
        await memory.addMessage({
          conversationId: conv.id,
          content: pregunta,
          direction: 'saliente',
          channel,
          metadata: { source: 'chatbot', intent: classification.intent, needsMoreInfo: true, missingEntity: 'confirmar_registro' },
        })
        console.log('[ChatbotService] Contacto no registrado — pidiendo confirmación para registrar')
        return { success: true, response: pregunta }
      }
    }

    // ═══ 1d. ACCIÓN DESTRUCTIVA → PEDIR CONFIRMACIÓN EXPLÍCITA ═══
    // Regla de seguridad: ningún intent marcado `destructive: true` se ejecuta
    // sin confirmación sí/no del usuario. La confirmación se resuelve en el
    // bloque 0d del turno siguiente (overrideClassification re-ejecuta el
    // intent pendiente con sus entidades guardadas). El rechazo queda auditado
    // como BLOCKED_SECURITY y el rechazo/confirmación incluyen quién/cuándo.
    if (
      isActionable &&
      !classification.needsMoreInfo &&
      !overrideClassification &&
      intentClassifier.isDestructive(classification.intent)
    ) {
      const pregunta = mensajeConfirmarDestructivo(classification.intent)

      await memory.updateContext(conv.id, {
        pendingIntent: classification.intent,
        missingEntities: ['confirmar_destructivo'],
        collectedEntities: { ...(classification.extractedParams || {}) },
      })
      await memory.addMessage({
        conversationId: conv.id,
        content: pregunta,
        direction: 'saliente',
        channel,
        metadata: { source: 'chatbot', intent: classification.intent, needsMoreInfo: true, missingEntity: 'confirmar_destructivo' },
      })
      console.log(`[ChatbotService] Acción destructiva (${classification.intent}) — pidiendo confirmación`)
      return { success: true, response: pregunta }
    }

    // ═══ 2. SI ES UNA ACCIÓN CON PARÁMETROS COMPLETOS → EJECUTAR SKILL ═══
    if (isActionable && !classification.needsMoreInfo) {
      const planResult = await SkillOrchestratorAgent.createPlan(
        {
          intent: classification.intent,
          entities: classification.extractedParams as Record<string, string>,
          missingEntities: classification.missingParams,
        },
        {
          collectedEntities: context.collectedEntities,
          missingEntities: context.missingEntities,
          tenantId,
          userId: input.userId || conv.id,
        },
        tenantId
      )

      // Caso 2a: El orquestador devolvió un plan de ejecución
      if (planResult.success && planResult.plan) {
        const executionResult = await ExecutionEngine.run({
          plan: planResult.plan,
          userId: input.userId || conv.id,
          tenantId,
          sessionId: conv.id,
          // Canales como WhatsApp pasan el leadId de la conversación: se
          // inyecta al skill para que la entidad creada (tarea, nota…) quede
          // ligada al lead del chat.
          leadId: input.leadId,
        })

        let finalMessage = executionResult.message
        if (!finalMessage && executionResult.data) {
          finalMessage = typeof executionResult.data === 'string'
            ? executionResult.data
            : JSON.stringify(executionResult.data)
        }

        // Limpiar estado multi-turno tras la ejecución (evita duplicados)
        await memory.updateContext(conv.id, {
          pendingIntent: undefined,
          missingEntities: [],
          collectedEntities: {},
        })

        const action: ChatbotOutput['action'] =
          classification.intent === 'agendar_cita' ? 'agendar' :
          classification.intent === 'contactar_humano' ? 'transferir' :
          'ninguna'

        await memory.addMessage({
          conversationId: conv.id,
          content: finalMessage,
          direction: 'saliente',
          channel,
          metadata: { action, source: 'chatbot', intent: classification.intent },
        })

        await incrementStats(tenantId)
        triggerSummary() // Resumen automático (fire-and-forget)
        triggerPostAnalysis() // Fase 3: Análisis post-conversación (fire-and-forget)

        const elapsed = Date.now() - startTime
        console.log(`[ChatbotService] ${channel} skill=${classification.intent} OK en ${elapsed}ms`)

        // Extraer quickReplies del resultado del skill (si existen)
        const orchestratorQuickReplies: string[] | undefined =
          executionResult.data?.quickReplies ||
          executionResult.data?.data?.quickReplies;

        // Dedup against chips the user has already clicked in this session
        const dedupedQuickReplies = filterClickedQuickReplies(
          orchestratorQuickReplies,
          context.clickedQuickReplies,
        )

        if (dedupedQuickReplies?.length) {
          await memory.recordOfferedQuickReplies(conv.id, dedupedQuickReplies)
        }

        // Botones inline de acciones de tareas (completar/reprogramar/snooze):
        //  · listados (vencidas, hoy, pendientes) → una fila por tarea;
        //  · crear_tarea → una fila con la tarea recién creada, para actuar
        //    sobre ella (completar/reprogramar/posponer) sin escribir.
        const taskButtons: { taskId: string; titulo: string }[] | undefined =
          ['tareas_vencidas', 'tareas_hoy', 'mis_tareas'].includes(classification.intent) &&
          Array.isArray(executionResult.data)
            ? (executionResult.data as any[])
                .filter((t) => t?.id)
                .map((t) => ({
                  taskId: String(t.id),
                  titulo: String(t?.titulo || 'Tarea'),
                }))
            : classification.intent === 'crear_tarea' && (executionResult.data as any)?.id
              ? [{
                  taskId: String((executionResult.data as any).id),
                  titulo: String((executionResult.data as any).titulo || 'Tarea'),
                }]
              : undefined

        return {
          success: true,
          response: finalMessage,
          action,
          quickReplies: dedupedQuickReplies,
          taskButtons,
        }
      }

      // Caso 2b: El orquestador devolvió una respuesta directa (falta de acceso, etc.)
      if (planResult.success && planResult.response) {
        const finalMessage = planResult.response

        // Limpiar estado multi-turno (respuesta sin ejecución)
        await memory.updateContext(conv.id, {
          pendingIntent: undefined,
          missingEntities: [],
          collectedEntities: {},
        })

        await memory.addMessage({
          conversationId: conv.id,
          content: finalMessage,
          direction: 'saliente',
          channel,
          metadata: { source: 'chatbot', intent: classification.intent },
        })

        await incrementStats(tenantId)
        triggerSummary() // Resumen automático (fire-and-forget)
        triggerPostAnalysis() // Fase 3: Análisis post-conversación (fire-and-forget)

        const elapsed = Date.now() - startTime
        console.log(`[ChatbotService] ${channel} response=${classification.intent} OK en ${elapsed}ms`)

        return {
          success: true,
          response: finalMessage,
        }
      }
    }

    // ═══ 3. SI ES UNA ACCIÓN CON PARÁMETROS FALTANTES → PREGUNTAR ═══
    if (isActionable && classification.needsMoreInfo) {
      // Guardar el intent pendiente en el contexto para multi-turno
      await memory.updateContext(conv.id, {
        pendingIntent: classification.intent,
        missingEntities: classification.missingParams,
        collectedEntities: classification.extractedParams,
      })

      const nextMissing = classification.missingParams[0]
      const question = MISSING_ENTITY_PROMPTS[nextMissing]
        || `❓ ¿Podrías proporcionarme ${nextMissing}?`
      const finalMessage = `Entendido. ${question}`

      await memory.addMessage({
        conversationId: conv.id,
        content: finalMessage,
        direction: 'saliente',
        channel,
        metadata: { source: 'chatbot', intent: classification.intent, needsMoreInfo: true, missingEntity: nextMissing },
      })

      triggerSummary() // Resumen automático (fire-and-forget)
      triggerPostAnalysis() // Fase 3: Análisis post-conversación (fire-and-forget)

      const elapsed = Date.now() - startTime
      console.log(`[ChatbotService] ${channel} necesitaInfo=${nextMissing} en ${elapsed}ms`)

      return {
        success: true,
        response: finalMessage,
      }
    }

    // ═══ 4. CONSULTA GENERAL / SIMPLE → USAR LLM CON TOOL CALLING ═══
    const systemPrompt = buildSystemPrompt({
      config,
      tenant,
      services,
      context,
      kbSection,
      catalogSection,
      summaryBlock,
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

    // Definir herramienta buscar_catalogo para el LLM
    const CATALOG_TOOLS: OpenRouterTool[] = [{
      type: 'function',
      function: {
        name: 'buscar_catalogo',
        description: 'Busca productos, servicios o propiedades en el catálogo de la empresa. Usa esta herramienta cuando el cliente pregunte por precios, disponibilidad, productos específicos, propiedades inmobiliarias, servicios ofrecidos, o quiera ver qué hay disponible. Soporta filtros por tipo, precio, ciudad, habitaciones, etc.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Texto libre de búsqueda (ej: "apartamentos en Madrid", "cafetera", "plan de marketing")'
            },
            tipo: {
              type: 'string',
              description: 'Tipo de ítem: inmueble, servicio, producto_terminado, materia_prima, insumo, cita, academia',
              enum: ['inmueble', 'servicio', 'producto_terminado', 'materia_prima', 'insumo', 'cita', 'academia']
            },
            precioMin: {
              type: 'number',
              description: 'Precio mínimo en la moneda del catálogo'
            },
            precioMax: {
              type: 'number',
              description: 'Precio máximo en la moneda del catálogo'
            },
            categoria: {
              type: 'string',
              description: 'Categoría del catálogo (ej: "venta", "alquiler", "marketing", "consultoría")'
            },
            ciudad: {
              type: 'string',
              description: 'Ciudad o ubicación para filtrar (ej: "Madrid", "Barcelona", "Ciudad de México")'
            },
            habitaciones: {
              type: 'string',
              description: 'Número de habitaciones (para inmuebles)'
            },
            etiqueta: {
              type: 'string',
              description: 'Etiqueta o tag del catálogo (ej: "destacado", "oferta", "nuevo")'
            }
          },
          required: []
        }
      }
    }]

    // Callback que ejecuta buscarCatalogo cuando el LLM lo solicita
    let catalogQuickReplies: string[] | undefined;

    const executeTool = async (toolName: string, toolArgs: Record<string, any>): Promise<string> => {
      if (toolName === 'buscar_catalogo') {
        try {
          // Mapear argumentos del LLM al formato de buscarCatalogo
          const filtrosCustom: Record<string, string> = {}
          if (toolArgs.ciudad) filtrosCustom.ciudad = toolArgs.ciudad
          if (toolArgs.habitaciones) filtrosCustom.habitaciones = toolArgs.habitaciones

          const { skills } = await import('@/lib/skills')
          const result = await skills.buscar_catalogo({
            tenantId,
            query: toolArgs.query,
            tipo: toolArgs.tipo,
            precioMin: toolArgs.precioMin,
            precioMax: toolArgs.precioMax,
            categoria: toolArgs.categoria,
            etiqueta: toolArgs.etiqueta,
            filtrosCustom: Object.keys(filtrosCustom).length > 0 ? filtrosCustom : undefined,
            limit: 8,
          })

          // Capturar quickReplies generados
          if (result.quickReplies && result.quickReplies.length > 0) {
            catalogQuickReplies = result.quickReplies
          }

          if (result.success && result.message) {
            return result.message
          }
          return result.message || `No se encontraron resultados en el catálogo. Responde al cliente indicando que no hay coincidencias y sugiere afinar la búsqueda.`
        } catch (err) {
          console.warn('[ChatbotService] Error ejecutando buscar_catalogo tool:', err)
          return `Error al consultar el catálogo. Responde al cliente que hubo un problema técnico y que lo intentará de nuevo en unos momentos, o que puede contactar a un asesor humano.`
        }
      }
      return JSON.stringify({ error: `Herramienta desconocida: ${toolName}` })
    }

    const llmResponse = await callAssistantWithToolLoop(llmMessages, CATALOG_TOOLS, executeTool)
    const finalMessage = llmResponse.choices?.[0]?.message?.content
      || 'Lo siento, no pude procesar tu mensaje.'

    await memory.addMessage({
      conversationId: conv.id,
      content: finalMessage,
      direction: 'saliente',
      channel,
      metadata: { source: 'chatbot', intent: classification.intent },
    })

    await incrementStats(tenantId)
    triggerSummary() // Resumen automático (fire-and-forget)
    triggerPostAnalysis() // Fase 3: Análisis post-conversación (fire-and-forget)

    const elapsed = Date.now() - startTime
    console.log(`[ChatbotService] ${channel} consulta OK en ${elapsed}ms (intent=${classification.intent})`)

    const dedupedQuickReplies = filterClickedQuickReplies(
      catalogQuickReplies,
      context.clickedQuickReplies,
    )

    if (dedupedQuickReplies?.length) {
      await memory.recordOfferedQuickReplies(conv.id, dedupedQuickReplies)
    }

    return {
      success: true,
      response: finalMessage,
      quickReplies: dedupedQuickReplies,
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
  catalogSection?: string
  summaryBlock?: string
  channel: string
  contactName?: string
}): string {
  const { config, tenant, services, context, kbSection, catalogSection, summaryBlock, channel, contactName } = params

  const servicesInfo = services.map(s =>
    `- ${s.nombre}: ${s.descripcion || 'Sin descripción'} | ${s.duracionMinutos || '?'} min | $${s.precio} ${s.moneda || 'EUR'}`
  ).join('\n')

  const isTextOnly = channel === 'whatsapp'
  const formatGuide = isTextOnly
    ? 'Usa *texto* para negritas, emojis con moderación. Máximo 3 párrafos.'
    : 'Usa formato markdown simple. Responde en 2-3 párrafos.'

  let memorySection = ''
  if (summaryBlock) {
    memorySection += `\n\n${summaryBlock}`
  }
  if (context.facts?.length > 0) {
    memorySection += '\n\nINFORMACIÓN DEL CLIENTE:\n' + context.facts.map((f: string) => `- ${f}`).join('\n')
  }
  if (context.pendingIntent && context.missingEntities?.length > 0) {
    memorySection += `\n\nACCIÓN PENDIENTE: ${context.pendingIntent}. Falta: ${context.missingEntities.join(', ')}.`
  }

  return `Eres ${config.nombreAsistente || 'Asistente Virtual'}, el asistente inteligente de ${tenant?.nombre || 'la empresa'}.

${config.contextoNegocio || 'Ayudas a clientes con información y gestión de servicios.'}
${config.personalidad || 'Eres cordial, profesional, conciso y resolutivo.'}${kbSection}${catalogSection || ''}

CLIENTE: ${contactName || 'Cliente'}${memorySection}

SERVICIOS DISPONIBLES:
${servicesInfo || 'No hay servicios configurados.'}

INSTRUCCIONES:
1. Responde SIEMPRE en español, sé directo y útil.
2. ${formatGuide}
3. Si el cliente pregunta por servicios, preséntalos con precio y duración.
4. Si preguntan sobre contabilidad, IVA, IRPF, impuestos o fiscales:
   - Explica tipos de IVA: 4% (superreducido), 10% (reducido), 21% (general), 0% (exento).
   - Modelo 303: declaración trimestral de IVA.
   - Modelo 130: pago fraccionado IRPF para autónomos.
   - Modelo 390: resumen anual de IVA.
   - Modelo 111: retenciones IRPF (profesionales, actividades económicas).
   - Modelo 115: retención trimestral IRPF por arrendamiento de inmuebles urbanos (19%).
   - Modelo 180: resumen anual de retenciones sobre arrendamientos (consolida el 115).
   - Verifactu: normativa española de facturación electrónica con hash SHA-256.
5. Si preguntan sobre contabilidad general: PGC (Plan General Contable), balance de situación, cuenta de resultados (PyG), libro diario, asientos contables.
6. Si preguntan sobre la plataforma Volkern, describe sus módulos (CRM, Contabilidad, Facturación Verifactu, Web Creator, etc.).
7. NO inventes información. Si no sabes, di que lo consultarás con un asesor.
8. NO recomiendes competidores. Solo habla de Volkern.
9. Sé natural, no uses jerga técnica a menos que el cliente la use.

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

async function incrementStats(tenantId: string) {
  await prisma.chatbotConfig.update({
    where: { tenantId },
    data: { totalConversaciones: { increment: 1 } },
  }).catch(() => {})
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
