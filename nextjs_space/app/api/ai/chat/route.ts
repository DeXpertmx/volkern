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
  'buscar_inmuebles': 'search_properties_by_filters',
  'recomendar_inmuebles': 'recommend_properties',
}

// ─── Descripciones completas de skills para la IA ──────────────────────────

const SKILL_DESCRIPTIONS = `
== SKILLS DISPONIBLES ==

[CREAR LEAD]
  intent: "crear_lead"
  desc: Crear un nuevo contacto/lead en el sistema.
  params requeridos: nombre (string), email (string)
  params opcionales: telefono (string), contexto (string), empresa (string)
  ejemplo: {"intent":"crear_lead","params":{"nombre":"Juan Pérez","email":"juan@email.com","telefono":"612345678"}}

[ACTUALIZAR LEAD]
  intent: "actualizar_lead"
  desc: Actualizar datos de un lead existente.
  params requeridos: nombre o email (para identificar)
  params opcionales: telefono, empresa, contexto

[CONVERTIR LEAD]
  intent: "convertir_lead"
  desc: Convertir un lead en contacto.

[AGENDAR CITA]
  intent: "agendar_cita"
  desc: Crear una cita/reunión para un contacto.
  params requeridos: nombre (string)
  params opcionales: fecha ("YYYY-MM-DD" o día relativo), hora ("HH:MM" o "10am"), email, titulo, tipo ("videollamada"|"presencial"), ubicacion
  NOTA: Siempre pregunta tipo si no lo mencionó. Si es videollamada el sistema genera Meet.
  NOTA2: Si el contacto no existe en la BD, el sistema pedirá el email.
  ejemplo: {"intent":"agendar_cita","params":{"nombre":"María García","fecha":"2026-06-12","hora":"10:00","titulo":"Revisión","tipo":"videollamada"}}

[MIS CITAS]
  intent: "mis_citas"
  desc: Consultar las próximas citas del usuario.
  params: ninguno

[CANCELAR CITA]
  intent: "cancelar_cita"
  desc: Cancelar una cita existente.
  params requeridos: nombre (string) — el nombre del contacto
  params opcionales: email, fecha ("YYYY-MM-DD"), motivo
  NOTA: Si no encuentra la cita exacta, te dirá qué citas activas encontró para que el usuario elija.
  ejemplo: {"intent":"cancelar_cita","params":{"nombre":"Juan Pérez","fecha":"2026-06-12"}}

[CONFIRMAR CITA]
  intent: "confirmar_cita"
  desc: Confirmar una cita pendiente.

[CREAR TAREA]
  intent: "crear_tarea"
  desc: Crear una tarea de seguimiento.
  params requeridos: titulo (string)
  params opcionales: descripcion, fechaVencimiento, email, prioridad

[COMPLETAR TAREA]
  intent: "completar_tarea"
  desc: Marcar tarea como completada.

[MIS TAREAS]
  intent: "mis_tareas"
  desc: Consultar tareas pendientes.

[CREAR NOTA]
  intent: "crear_nota"
  desc: Agregar una nota a un lead.

[CREAR NEGOCIO]
  intent: "crear_negocio"
  desc: Crear una oportunidad/deal en el pipeline de ventas.

[ACTUALIZAR NEGOCIO]
  intent: "actualizar_negocio"
  desc: Actualizar etapa o datos de un deal.

[MIS NEGOCIOS]
  intent: "mis_negocios"
  desc: Listar oportunidades/deals activos.

[REGISTRAR INTERACCIÓN]
  intent: "registrar_interaccion"
  desc: Registrar una interacción con un contacto (llamada, WhatsApp, email, reunión).
  params requeridos: tipo ("llamada"|"whatsapp"|"email"|"reunion"), contenido (string - resumen)
  params opcionales: nombre, email, resultado

[OBTENER TELÉFONO]
  intent: "obtener_telefono"
  desc: Buscar el número de teléfono de un contacto.
  params requeridos: nombre (string)

[CONSULTA GENERAL]
  intent: "consulta_general"
  desc: Para preguntas, dudas, conversación casual, saludos, o cuando no aplica ninguna acción anterior.

== IMPORTANTE ==
- TÚ controlas el flujo. Si falta un parámetro, pon needsMoreInfo:true y pregunta naturalmente.
- NO inventes valores. Si el usuario no dijo fecha, no pongas una por defecto.
- Si el usuario da todo en un mensaje, ejecuta directo con needsMoreInfo:false.
- Para fechas relativas ("viernes", "mañana"), usa la referencia de FECHA ACTUAL.
- El nombre del contacto es solo el nombre real, sin "cita con" ni "reunión con".
- Si un skill falla (ej: no encuentra el contacto), el sistema lo manejará. Tú solo indica en message lo que pasó.

== ACCIONES DESTRUCTIVAS (REQUIEREN CONFIRMACIÓN) ==
Las siguientes acciones requieresConfirmation=true:
- cancelar_cita: Cancelar una cita
Pon requiresConfirmation:true en tu JSON, y en message pregunta "¿Estás seguro de cancelar la cita?"
El usuario responderá "Sí" o "No". Si dice que sí, el sistema ejecutará la acción.

== VOLKERN PLATFORM OVERVIEW ==
Volkern es un Sistema Operativo Empresarial (ERP + CRM) con estos módulos:

1. CRM (Ventas y Marketing): Gestión de leads, contactos, oportunidades (deals), pipeline Kanban,
   cotizaciones, campañas de marketing, seguimiento de interacciones (llamadas, WhatsApp, email, reuniones).

2. Inmobiliario: Gestión de propiedades (venta/renta), catálogo con campos personalizados JSONB,
   portal público embebible con filtros, dashboard con KPIs y gráficos, franquicias multi-tenant,
   cálculo de comisiones con splits (agente/agencia/franquicia), búsqueda por lenguaje natural con IA.

3. ERP (Operaciones): Proyectos, inventario con alertas de stock, producción (MRP) con cálculos
   de costos y materias primas, control de calidad (QC) con hash SHA-256, logística con tracking de envíos.

4. Financiero y Fiscal: Facturación Veri*Factu (cumplimiento legal España/México), contabilidad,
   cobranza, conciliación bancaria vía Plaid/Nordigen, proyección de flujo de caja (cash flow),
   análisis de rentabilidad, cálculo de EBITDA.

5. RRHH (Recursos Humanos): Expedientes de empleados, control de asistencia, nóminas con payroll
   sealing (The Vault 2.0), gestión de vacaciones, autorización de gastos, activos de personal.

6. Omnicanal: WhatsApp vía Evolution API, email vía AWS SES, web chat, Telegram, integración con
   Chatwoot para helpdesk multicanal.

7. Academia (LMS): Cursos, lecciones, evaluaciones, certificaciones, portal de alumnos.

8. Gemma AI: Asistente nativo de IA con skills contextuales, auto-diagnóstico (AIOps) cada 5 minutos,
   generación de contenido, análisis predictivo.

9. Web Creator: CMS basado en Puck para crear landing pages arrastrando componentes.

10. Hub Social: Integración con Meta (Facebook/Instagram) para gestión de redes sociales.

Nota: El usuario puede no tener acceso a todos los módulos. Pero si pregunta por cualquier módulo,
     debes conocerlo y explicarlo. Si no tienes acceso a los datos de un módulo, dilo claramente.
``

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

    // ── 5. Ejecutar skill si aplica ──────────────────────────────
    let skillResult: any = null
    let skillErrorMsg: string | null = null
    const skillName = INTENT_SKILL_MAP[aiResult.intent]

    if (skillName && !aiResult.needsMoreInfo && !aiResult.requiresConfirmation && aiResult.intent !== 'consulta_general') {
      try {
        skillResult = await executeSkill(skillName as any, {
          ...params,
          tenantId,
          userId: userId || undefined,
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
