export const dynamic = 'force-dynamic'

/**
 * POST /api/ai/chat
 * Endpoint para la nueva app Gemma (React Native).
 * 
 * Arquitectura:
 * 1. Recibe mensaje del usuario
 * 2. Si hay contexto pendiente (intención en progreso), lo fusiona
 * 3. Sanitiza PII y envía a DeepSeek V4 Flash
 * 4. La IA responde con JSON estructurado (intent, params, message)
 * 5. Si faltan parámetros → guarda contexto pendiente y pregunta
 * 6. Si todo completo → ejecuta skill contra la BD
 * 7. Restaura placeholders y devuelve respuesta
 * 
 * Autenticación: Bearer JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { callAssistantWithFallback } from '@/lib/assistant/openrouter-client'
import { PiiFilter } from '@/lib/ai/pii-filter'
import { executeSkill } from '@/lib/skills'
import { prisma } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'
import { intentClassifier } from '@/lib/agents/intent-classifier'

// ─── Tipos ─────────────────────────────────────────────────────────────────

type ResponseType = 'text' | 'question' | 'rich' | 'confirmation' | 'error'

interface RichData {
  type: 'phone' | 'contact' | 'booking' | 'inventory' | 'summary' | 'list'
  [key: string]: any
}

interface ChatResponse {
  reply: string
  type: ResponseType
  richData: RichData | null
  quickReplies: string[]
  chatId: string
  action?: string
}

// ─── Mapa de intenciones a skills ─────────────────────────────────────────

// ─── Roles y permisos ─────────────────────────────────────────────────────

const ADMIN_ROLES = ['Superadmin', 'Administrador', 'Admin', 'Owner']
const ADMIN_ONLY_SKILLS = ['ajustar_stock', 'completar_tarea', 'convertir_lead', 'actualizar_negocio']

// ─── Mapa de intenciones a skills ─────────────────────────────────────────

const INTENT_SKILL_MAP: Record<string, string> = {
  'crear_lead': 'create_lead',
  'actualizar_lead': 'update_lead',
  'convertir_lead': 'convert_lead',
  'obtener_telefono': 'obtener_telefono',
  'registrar_interaccion': 'registrar_interaccion',
  'agendar_cita': 'create_booking',
  'mis_citas': 'get_upcoming_bookings',
  'cancelar_cita': 'cancel_booking',
  'confirmar_cita': 'confirm_booking',
  'crear_tarea': 'create_task',
  'completar_tarea': 'complete_task',
  'mis_tareas': 'get_pending_tasks',
  'crear_nota': 'create_note',
  'crear_negocio': 'create_deal',
  'actualizar_negocio': 'update_deal',
  'mis_negocios': 'list_deals',
  'buscar_producto': 'search_catalog',
  'salud_inventario': 'get_inventory_health',
  'ajustar_stock': 'adjust_stock',
  'registrar_gasto': 'create_expense',
  'registrar_gasto_vision': 'register_expense_vision',
  'buscar_inmuebles': 'search_properties_by_filters',
  'recomendar_inmuebles': 'recommend_properties',
}

// ─── Descripciones completas de skills para la IA ──────────────────────────

// ─── SKILLS organizados por módulo ────────────────────────────────────────

const SKILL_DESCRIPTIONS = `
== SKILLS DISPONIBLES (organizados por módulo) ==

=== CRM (Ventas y Marketing) ===

[CREAR LEAD] intent:"crear_lead"
  Crear un nuevo contacto/lead. Req: nombre, email. Opc: telefono, contexto, empresa.

[ACTUALIZAR LEAD] intent:"actualizar_lead"
  Actualizar datos de un lead existente.

[CONVERTIR LEAD] intent:"convertir_lead" (solo admin)
  Convertir un lead en contacto formal.

[CREAR NEGOCIO] intent:"crear_negocio"
  Crear una oportunidad/deal en el pipeline de ventas.

[ACTUALIZAR NEGOCIO] intent:"actualizar_negocio" (solo admin)
  Cambiar etapa o modificar un deal existente.

[MIS NEGOCIOS] intent:"mis_negocios"
  Listar oportunidades/deals activos.

[REGISTRAR INTERACCIÓN / ENVIAR EMAIL] intent:"registrar_interaccion"
  Registrar interacciones (llamada, WhatsApp, reunión) o ENVIAR un email real.
  Cuando tipo="email": ENVÍA el email por SES al contacto (no solo lo registra).
  Req: tipo (email|llamada|whatsapp|reunion), contenido (cuerpo del mensaje o resumen).
  Opc: email (correo del destinatario), nombre (alternativa para buscar el contacto).
  NOTA: Puedes usar este skill para enviar correos a cualquier contacto del sistema.

[OBTENER TELÉFONO] intent:"obtener_telefono"
  Buscar teléfono de un contacto. Req: nombre.

=== AGENDAMIENTO (Citas y Calendario) ===

[AGENDAR CITA] intent:"agendar_cita"
  Crear cita/reunión. Req: nombre. Opc: fecha, hora, email, titulo, tipo(videollamada|presencial), ubicacion.
  NOTA: Pregunta tipo si no lo mencionó. Videollamada genera Meet automático.

[MIS CITAS] intent:"mis_citas"
  Consultar próximas citas.

[CANCELAR CITA] intent:"cancelar_cita"
  Cancelar cita existente. Req: nombre. Opc: email, fecha, motivo.
  NOTA: requiereConfirmacion=true. Pregunta "¿Estás seguro?"

[CONFIRMAR CITA] intent:"confirmar_cita"
  Confirmar una cita pendiente.

=== TAREAS Y NOTAS ===

[CREAR TAREA] intent:"crear_tarea"
  Crear tarea de seguimiento. Req: titulo. Opc: descripcion, fechaVencimiento, email, prioridad.

[COMPLETAR TAREA] intent:"completar_tarea" (solo admin)
  Marcar tarea como completada.

[MIS TAREAS] intent:"mis_tareas"
  Consultar tareas pendientes.

[CREAR NOTA] intent:"crear_nota"
  Agregar nota a un lead/contacto.

=== FINANZAS ===

[REGISTRAR GASTO] intent:"registrar_gasto"
  Registrar un gasto o egreso. Req: monto, concepto. Opc: proveedor, categoria, fecha.
  NOTA: Si el usuario adjunta foto de factura/ticket, usa registrar_gasto_vision (procesa la imagen automáticamente).

[REGISTRAR GASTO VISIÓN] intent:"registrar_gasto_vision"
  Registrar un gasto procesando automáticamente la imagen de una factura o ticket.
  Extrae proveedor, monto, fecha e IVA de la imagen.

=== INVENTARIO ===

[AJUSTAR STOCK] intent:"ajustar_stock" (solo admin)
  Ajustar niveles de stock (entrada/salida/transferencia).

[SALUD INVENTARIO] intent:"salud_inventario"
  Analizar salud del inventario y predecir rupturas.

=== CATÁLOGO ===

[BUSCAR PRODUCTO] intent:"buscar_producto"
  Buscar en el catálogo con filtros.

=== INMOBILIARIO ===

[BUSCAR INMUEBLES] intent:"buscar_inmuebles"
  Buscar propiedades por filtros en lenguaje natural.

[RECOMENDAR INMUEBLES] intent:"recomendar_inmuebles"
  Recomendar propiedades según preferencias.

=== CONSULTA GENERAL ===

[CONSULTA GENERAL] intent:"consulta_general"
  Para preguntas, dudas, saludos, conversación casual, o cuando no aplica ninguna acción.

== IMPORTANTE ==
- TÚ controlas el flujo. Si falta un parámetro, pon needsMoreInfo:true y pregunta naturalmente.
- NO inventes valores. Si el usuario no dijo fecha, no pongas una por defecto.
- Si el usuario da todo en un mensaje, ejecuta directo con needsMoreInfo:false.
- Para fechas relativas ("viernes", "mañana"), usa la referencia de FECHA ACTUAL.
- El nombre del contacto es solo el nombre real, sin "cita con" ni "reunión con".
- Si un skill falla (ej: no encuentra el contacto), el sistema lo manejará.

== ACCIONES DESTRUCTIVAS ==
Estas requieren requiresConfirmation=true siempre:
- cancelar_cita
- ajustar_stock
- completar_tarea

Pon requiresConfirmation:true y pregunta "¿Estás seguro?" antes de que se ejecute.

== VOLKERN PLATFORM OVERVIEW ==
Volkern: Sistema Operativo Empresarial (ERP + CRM). 10 módulos:

1. CRM: Leads, contactos, deals (pipeline Kanban), cotizaciones, campañas, interacciones.
2. Inmobiliario: Propiedades venta/renta, portal público, franquicias, comisiones.
3. ERP: Proyectos, inventario, producción (MRP), calidad (QC), logística.
4. Financiero: Facturación Veri*Factu, contabilidad, conciliación, cash flow, EBITDA.
5. RRHH: Expedientes, asistencia, nóminas (The Vault 2.0), vacaciones.
6. Omnicanal: WhatsApp, email, web chat, Telegram, Chatwoot.
7. Academia (LMS): Cursos, lecciones, evaluaciones, certificaciones.
8. Gemma AI: Asistente IA con skills, auto-diagnóstico, generación de contenido.
9. Web Creator: Landing pages con Puck CMS.
10. Hub Social: Meta (Facebook/Instagram).

Nota: El usuario puede NO tener acceso a todos los módulos. Si pregunta sobre un módulo,
     explícale de qué se trata. Si no tiene acceso a los datos, indícalo claramente.
`

// ─── System prompt ──────────────────────────────────────────────────────────

function buildChatSystemPrompt(): string {
  const today = new Date()
  const todayStr = today.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const todayFormatted = todayStr.charAt(0).toUpperCase() + todayStr.slice(1)
  const todayISO = today.toISOString().split('T')[0]
  const weekDay = today.getDay()
  const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const dayName = dayNames[weekDay]

  return `Eres Gemma, la asistente inteligente de Volkern.

PERSONALIDAD:
- Asistente ejecutiva profesional, amable y eficiente
- Hablas español natural y fluido
- Usas emojis con moderación
- ERES INTELIGENTE y tienes criterio propio

FECHA ACTUAL:
Hoy es ${dayName}, ${todayFormatted} (${todayISO}).

${SKILL_DESCRIPTIONS}

LÍMITES ABSOLUTOS:
🚫 Solo hablas de Volkern — no recomiendas ni mencionas otros CRM, ERP, softwares ni herramientas
🚫 Si preguntan por competidores: "No conozco otras herramientas. Mi especialidad es Volkern. ¿Qué necesitas hacer en Volkern?"
🚫 NUNCA des información de OTROS usuarios, contactos, empresas o datos que no pertenezcan al usuario que está hablando
🚫 NUNCA inventes datos. Si no está en la base de datos, no lo digas como si existiera. Di "No encontré información sobre eso"
🚫 No puedes eliminar nada permanentemente. Las cancelaciones y eliminaciones siempre requieren confirmación del usuario
🚫 Solo puedes acceder y mostrar datos a los que el usuario tenga permiso según su perfil/rol
🚫 Si el usuario pregunta por datos de un módulo al que no tiene acceso, dilo claramente
🚫 No des consejos financieros, legales, fiscales ni médicos externos
🚫 No finjas tener emociones humanas. Sé profesional y cálida
🚫 Si preguntan por el mejor CRM o herramienta, responde: "Volkern es la plataforma que conozco. ¿Qué necesitas hacer?"

FORMATO DE RESPUESTA (SIEMPRE JSON):
{
  "intent": "nombre_del_intent",
  "confidence": 0.0-1.0,
  "needsMoreInfo": true|false,
  "requiresConfirmation": false,
  "params": { "param1": "valor1", "param2": "valor2" },
  "message": "Tu mensaje natural al usuario aquí"
}

SOLO responde con el JSON. NADA más.`
}

// ─── Historial de conversación (memoria de últimos N mensajes) ──────────

const HISTORY_PREFIX = 'gemma_history_' // Para diferenciar de pending context
const MAX_HISTORY = 10 // Últimos 10 mensajes

async function getConversationHistory(userId: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  try {
    const records = await prisma.chatbotAuditLog.findMany({
      where: {
        userId,
        id: { not: { startsWith: PENDING_PREFIX } }, // Excluir contexto pendiente
        NOT: { status: 'PENDING_CONTEXT' },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY,
      select: { inputRaw: true, gemmaOutput: true },
    })

    // Ordenar cronológicamente (más antiguo primero)
    const history: { role: 'user' | 'assistant'; content: string }[] = []
    for (let i = records.length - 1; i >= 0; i--) {
      const record = records[i]
      if (record.inputRaw) {
        history.push({ role: 'user', content: record.inputRaw })
      }
      if (record.gemmaOutput) {
        history.push({ role: 'assistant', content: record.gemmaOutput })
      }
    }
    return history
  } catch {
    return []
  }
}

async function saveMessageToHistory(
  userId: string,
  tenantId: string,
  userMessage: string,
  aiResponse: string,
  intent: string,
  status: string
): Promise<void> {
  try {
    await prisma.chatbotAuditLog.create({
      data: {
        id: `${HISTORY_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId,
        tenantId,
        intent,
        status,
        inputRaw: userMessage.substring(0, 500),
        gemmaOutput: aiResponse.substring(0, 1000),
        createdAt: new Date(),
      },
    })
  } catch {
    // Non-critical
  }
}

// ─── Manejo de contexto pendiente (persistente en DB) ─────────────────────

const PENDING_PREFIX = 'gemma_pending_'

async function getPendingContext(userId: string): Promise<{
  intent: string
  params: Record<string, any>
  missingParams: string[]
} | null> {
  try {
    const record = await prisma.chatbotAuditLog.findUnique({
      where: { id: `${PENDING_PREFIX}${userId}` },
    })
    if (!record?.detectedEntities) return null
    
    const ctx = record.detectedEntities as any
    // Expirar después de 5 minutos
    if (Date.now() - new Date(record.createdAt).getTime() > 5 * 60 * 1000) {
      await clearPendingContext(userId)
      return null
    }
    return ctx
  } catch {
    return null
  }
}

async function savePendingContext(
  userId: string,
  tenantId: string,
  ctx: { intent: string; params: Record<string, any>; missingParams: string[] }
): Promise<void> {
  try {
    await prisma.chatbotAuditLog.upsert({
      where: { id: `${PENDING_PREFIX}${userId}` },
      update: {
        detectedEntities: ctx,
        status: 'PENDING_CONTEXT',
        tenantId,
        createdAt: new Date(),
      },
      create: {
        id: `${PENDING_PREFIX}${userId}`,
        userId,
        tenantId,
        status: 'PENDING_CONTEXT',
        detectedEntities: ctx,
        createdAt: new Date(),
      },
    })
  } catch (e) {
    console.error('[Chat] Error saving pending context:', e)
  }
}

async function clearPendingContext(userId: string): Promise<void> {
  try {
    await prisma.chatbotAuditLog.delete({ where: { id: `${PENDING_PREFIX}${userId}` } }).catch(() => {})
  } catch {}
}

// ─── POST ─────────────────────────────────────────────────────────────────

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const body = await req.json()
    const { message, chatId } = body
    const tenantId = auth.tenant!.id
    const userId = auth.user?.id

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    }

    const responseChatId = chatId || uuidv4()
    const userKey = userId || 'anonymous'

    // ── 0. Verificar contexto pendiente ──────────────────────────
    let pendingCtx = await getPendingContext(userKey)

    if (pendingCtx) {
      // Si el contexto está esperando CONFIRMACIÓN y el usuario confirma, ejecutar directo
      if (pendingCtx.missingParams[0] === 'pending_confirmation') {
        const isConfirm = /\b(s[ií]|confirm[ao]|adelante|dale|ok|sim|sip|yes|proced[ae])\b/i.test(message)
        const isCancel = /\b(no|cancel[ao]|cancelar|para|detente|mejor no|quita)\b/i.test(message)

        if (isCancel) {
          const cancelReply = 'Entendido, cancelo la operación. ¿Algo más? 🌟'
          saveMessageToHistory(userKey, tenantId, message, cancelReply, pendingCtx.intent, 'CANCELLED').catch(() => {})
          await clearPendingContext(userKey)
          return NextResponse.json({
            reply: cancelReply,
            type: 'text',
            richData: null,
            quickReplies: ['Crear un lead', 'Agendar una cita', 'Ayuda'],
            chatId: responseChatId,
          } as ChatResponse)
        }

        if (isConfirm) {
          // Verificar permisos antes de ejecutar
          const isAdmin = ADMIN_ROLES.includes(auth.user?.role?.nombre || '')
          if (ADMIN_ONLY_SKILLS.includes(pendingCtx.intent) && !isAdmin) {
            const errorReply = `⚠️ No tienes permisos para realizar esta acción. Se requiere rol de administrador.`
            saveMessageToHistory(userKey, tenantId, message, errorReply, pendingCtx.intent, 'ERROR').catch(() => {})
            await clearPendingContext(userKey)
            return NextResponse.json({
              reply: errorReply,
              type: 'text',
              richData: null,
              quickReplies: ['¿Qué puedo hacer?', 'Ayuda'],
              chatId: responseChatId,
            } as ChatResponse)
          }

          // Ejecutar el skill directamente
          try {
            const skillName = INTENT_SKILL_MAP[pendingCtx.intent]
            if (skillName) {
              const result = await executeSkill(skillName as any, {
                ...pendingCtx.params,
                tenantId,
                userId: userId || undefined,
              })
              await clearPendingContext(userKey)

              const replyText = formatSuccessMessage(pendingCtx.intent, result)
              saveMessageToHistory(userKey, tenantId, message, replyText, pendingCtx.intent, 'SUCCESS').catch(() => {})
              return NextResponse.json({
                reply: replyText,
                type: 'rich',
                richData: { type: 'summary', ...result },
                quickReplies: ['Sí, gracias', '¿Qué más puedes hacer?', 'Ayuda'],
                chatId: responseChatId,
                action: pendingCtx.intent,
              } as ChatResponse)
            }
          } catch (skillError: any) {
            const errorReply = skillError.message || 'Error al ejecutar la acción'
            saveMessageToHistory(userKey, tenantId, message, errorReply, pendingCtx.intent, 'ERROR').catch(() => {})
            await clearPendingContext(userKey)
            return NextResponse.json({
              reply: errorReply,
              type: 'text',
              richData: null,
              quickReplies: ['Intentar de nuevo', 'Ayuda'],
              chatId: responseChatId,
            } as ChatResponse)
          }
        }

        // Si no es ni confirmación ni cancelación, dejar que la IA procese
      }

      // Si el usuario inicia una nueva acción (verbo de acción), descartar contexto anterior
      const hasActionVerb = /\b(crea|busca|agenda|cancela|registra|envía|muestra|lista|dame|nuev[oa]|convierte|genera|analiza|sugiere|aprueba|ajusta|completa|cierra|califica|rectifica)\b/i.test(message)
      if (hasActionVerb) {
        await clearPendingContext(userKey)
        pendingCtx = null
      }
      // Si no hay verbo de acción y no es confirmación, es respuesta a pregunta — la IA lo procesará con contexto
    }

    // ── 2. Llamar a la IA con el mensaje ORIGINAL (sin sanitizar) ───
    // Construir prompt con contexto pendiente si existe
    let systemPrompt = buildChatSystemPrompt()
    if (pendingCtx) {
      systemPrompt += `\n\nCONTEXTO DE LA CONVERSACIÓN:
El usuario está en medio de la acción: "${pendingCtx.intent}"
Parámetros ya recolectados: ${JSON.stringify(pendingCtx.params)}
Parámetros faltantes: ${JSON.stringify(pendingCtx.missingParams)}

El mensaje actual del usuario es una RESPUESTA a la pregunta anterior.
Continúa con la misma intención (${pendingCtx.intent}) y completa los parámetros faltantes si el usuario los proporciona.`
    }

    // Incluir historial de conversación (últimos 10 mensajes)
    const conversationHistory = await getConversationHistory(userKey)

    const openAiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }, // Mensaje ORIGINAL sin filtrar
    ]

    const openAiResponse = await callAssistantWithFallback(openAiMessages)
    const rawContent = openAiResponse.choices[0].message.content

    // Intentar parsear JSON de la respuesta
    const safeMessage = (rawContent || '').substring(0, 500)

    let aiResult = { intent: 'consulta_general' as const, confidence: 0.5, needsMoreInfo: false, requiresConfirmation: false, params: {} as Record<string, any>, message: safeMessage }

    const jsonMatch = rawContent?.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        aiResult = { ...aiResult, ...parsed, message: (parsed.message || '').substring(0, 500) }
      } catch {
        // Si falla el parseo, usar el fallback
      }
    }

    // Fallback: si no se pudo parsear JSON o es consulta_general sin mensaje, usar intent classifier
    if (!jsonMatch || (aiResult.intent === 'consulta_general' && !aiResult.message)) {
      try {
        const classification = await intentClassifier.classify({
          message,
          userId: userKey,
          tenantId,
        })

        if (classification.intent !== 'consulta_general' && classification.confidence >= 0.5) {
          aiResult = {
            intent: classification.intent,
            confidence: classification.confidence,
            needsMoreInfo: classification.needsMoreInfo,
            requiresConfirmation: false,
            params: classification.extractedParams,
            message: 'Entendido, voy a procesar tu solicitud.',
          }
        }
      } catch {
        // Conservar el aiResult actual
      }
    }

    const params = aiResult.params || {}
    const aiMessage = aiResult.message || ''

    // ── 3. Si la IA necesita más información: dejar que ella pregunte ─
    if (aiResult.needsMoreInfo && aiResult.intent !== 'consulta_general') {
      await savePendingContext(userKey, tenantId, {
        intent: aiResult.intent,
        params,
        missingParams: ['next'],
      })

      // Guardar en historial
      saveMessageToHistory(userKey, tenantId, message, aiMessage, aiResult.intent, 'PENDING').catch(() => {})

      return NextResponse.json({
        reply: aiMessage || '¿Qué más necesito saber?',
        type: 'question',
        richData: null,
        quickReplies: [],
        chatId: responseChatId,
        action: aiResult.intent,
      } as ChatResponse)
    }

    // ── 4. Si la IA requiere confirmación (acción destructiva) ──
    if (aiResult.requiresConfirmation && aiResult.intent !== 'consulta_general') {
      // Guardar contexto con la acción pendiente de confirmación
      await savePendingContext(userKey, tenantId, {
        intent: aiResult.intent,
        params,
        missingParams: ['pending_confirmation'],
      })

      saveMessageToHistory(userKey, tenantId, message, aiMessage, aiResult.intent, 'PENDING').catch(() => {})

      return NextResponse.json({
        reply: aiMessage || '¿Estás seguro de realizar esta acción?',
        type: 'confirmation',
        richData: null,
        quickReplies: ['Sí, confirmar', 'No, cancelar'],
        chatId: responseChatId,
        action: aiResult.intent,
      } as ChatResponse)
    }

    // ── 5. Verificar permisos del usuario antes de ejecutar ────
    const roleName = auth.user?.role?.nombre || ''
    const isAdmin = ADMIN_ROLES.includes(roleName)

    // ── 6. Ejecutar skill si aplica ──────────────────────────────
    let skillResult: any = null
    let skillErrorMsg: string | null = null
    const skillName = INTENT_SKILL_MAP[aiResult.intent]

    if (skillName && !aiResult.needsMoreInfo && !aiResult.requiresConfirmation && aiResult.intent !== 'consulta_general') {
      // Verificar permisos
      if (ADMIN_ONLY_SKILLS.includes(aiResult.intent) && !isAdmin) {
        skillErrorMsg = `⚠️ No tienes permisos para realizar esta acción. Se requiere rol de administrador. Tu rol actual es: ${roleName || 'Usuario'}`
      } else {
        // Obtener timezone del usuario
        let userTimezone = 'America/Mexico_City'
        try {
          if (auth.user?.id) {
            const user = await prisma.user.findUnique({
              where: { id: auth.user.id },
              select: { timezone: true }
            })
            if (user?.timezone) userTimezone = user.timezone
          }
        } catch {}

        try {
          skillResult = await executeSkill(skillName as any, {
            ...params,
            tenantId,
            userId: userId || undefined,
            timezone: userTimezone,
          })
          await clearPendingContext(userKey)
        } catch (skillError: any) {
          console.error('[Chat] Skill error:', skillError)
          const msg = skillError.message || 'Error al ejecutar la acción'

          // Si el skill pide email, guardar contexto para que continúe naturalmente
          if (msg.startsWith('EMAIL_REQUIRED:')) {
            skillErrorMsg = msg.replace(/^EMAIL_REQUIRED:\s*/, '')
            await savePendingContext(userKey, tenantId, {
              intent: aiResult.intent,
              params,
              missingParams: ['next'],
            })
          } else {
            // Para otros errores, usar el mensaje de la IA o el error
            skillErrorMsg = aiMessage || msg
          }
        }
      }
    }

    // ── 5. Construir respuesta ────────────────────────────────────

    // Log de auditoría (sanitizado para privacidad)
    try {
      const auditFilter = new PiiFilter()
      const sanitizedForLog = auditFilter.sanitize(message)
      await prisma.chatbotAuditLog.create({
        data: {
          userId: userId || 'system',
          tenantId,
          intent: aiResult.intent,
          status: skillResult ? 'SUCCESS' : 'PENDING',
          inputRaw: sanitizedForLog.substring(0, 500),
          createdAt: new Date(),
        },
      })
    } catch {
      // Non-critical
    }

    // Determinar tipo de respuesta
    let responseType: ResponseType = 'text'
    let richData: RichData | null = null
    let quickReplies: string[] = []
    let replyText: string

    if (skillResult) {
      replyText = formatSuccessMessage(aiResult.intent, skillResult)
      responseType = 'rich'
      richData = { type: 'summary', ...skillResult }
    } else if (aiResult.intent === 'consulta_general') {
      replyText = aiMessage || 'Entendido. ¿Algo más? 🌟'
      quickReplies = ['Crear un lead', 'Agendar una cita', '¿Qué puedes hacer?']
    } else {
      replyText = skillErrorMsg || aiMessage || 'Entendido. ¿Algo más? 🌟'
      quickReplies = ['Sí, gracias', 'Ayuda']
    }

    const response: ChatResponse = {
      reply: replyText,
      type: responseType,
      richData,
      quickReplies: quickReplies.length > 0 ? quickReplies : ['Sí, gracias', '¿Qué más puedes hacer?', 'Ayuda'],
      chatId: responseChatId,
      action: aiResult.intent,
    }

    // Guardar en historial de conversación
    saveMessageToHistory(
      userKey,
      tenantId,
      message,
      replyText,
      aiResult.intent,
      skillResult ? 'SUCCESS' : (aiResult.needsMoreInfo ? 'PENDING' : 'COMPLETED')
    ).catch(() => {})

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('[Chat] Error:', error)
    return NextResponse.json(
      {
        reply: 'Lo siento, ocurrió un error al procesar tu mensaje. Intenta de nuevo.',
        type: 'error',
        richData: null,
        quickReplies: ['Intentar de nuevo', 'Ayuda'],
        chatId: '',
      },
      { status: 500 },
    )
  }
})

// ─── Helper: formatear fecha de forma segura ──────────────────────────────

function safeFormatDate(dateValue: any, long = false): string {
  if (!dateValue) return 'Fecha por definir'
  try {
    const d = new Date(dateValue)
    if (isNaN(d.getTime())) return 'Fecha por definir'
    return d.toLocaleString('es-MX', {
      weekday: long ? 'long' : 'short',
      year: long ? 'numeric' : undefined,
      day: 'numeric',
      month: long ? 'long' : 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'Fecha por definir'
  }
}

// ─── Helper: formatear mensaje de éxito ────────────────────────────────────

function formatSuccessMessage(intent: string, result: any): string {
  if (intent === 'cancelar_cita' && result) {
    const fecha = safeFormatDate(result.fechaHora, true)
    return `❌ Cita cancelada: **${result.titulo || 'Sin título'}**\n📅 ${fecha}\n✅ La cita ha sido cancelada exitosamente.\n\n¿Necesitas algo más? 🌟`
  }

  if (intent === 'agendar_cita' && result?.cita) {
    const fecha = safeFormatDate(result.cita.fechaHoraLocal || result.cita.fechaHora, true)
    const tipoCita = result.cita.ubicacion ? `📍 ${result.cita.ubicacion}` : ''
    const emailContacto = result.lead?.email ? `📧 ${result.lead.email}` : ''
    return `✅ ¡Cita agendada con éxito!\n\n📅 **${fecha}**\n📋 ${result.cita.titulo}\n👤 ${result.lead?.nombre || 'Cliente'} ${emailContacto}\n${tipoCita ? `${tipoCita}\n` : ''}\nSe creó un recordatorio automático. ¿Necesitas algo más? 🌟`
  }

  if (intent === 'crear_lead' && result) {
    return `✅ ¡Lead creado con éxito!\n\n👤 **${result.nombre}**\n📧 ${result.email || 'Sin email'}\n📱 ${result.telefono || 'Sin teléfono'}\n\n¿Qué más necesitas? 🌟`
  }

  if (intent === 'crear_tarea' && result) {
    return `✅ Tarea creada: **${result.titulo}**\n📅 Vence: ${safeFormatDate(result.fechaVencimiento)}\n\n¿Algo más? 🌟`
  }

  if (intent === 'registrar_gasto' && result) {
    const monto = result.amount ? `$${Number(result.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : ''
    const proveedor = result.supplier?.name || ''
    return `✅ Gasto registrado\n\n💰 **${monto}**\n📝 ${result.description || 'Sin concepto'}\n${proveedor ? `🏢 ${proveedor}\n` : ''}📂 ${result.category || 'General'}\n\n¿Algo más? 🌟`
  }

  if (intent === 'obtener_telefono' && result?.telefono) {
    return `📱 El teléfono de **${result.nombre}** es: **${result.telefono}**`
  }

  if (intent === 'mis_citas' && result?.citas) {
    if (result.citas.length === 0) return '📅 No tienes citas próximas.'
    const lista = result.citas.slice(0, 5).map((c: any) => {
      const fechaStr = safeFormatDate(c.fechaHoraLocal || c.fechaHora)
      return `• ${fechaStr} — ${c.titulo || 'Sin título'}`
    }).join('\n')
    return `📅 Tus próximas citas:\n\n${lista}`
  }

  return '✅ Listo, acción completada con éxito.'
}
