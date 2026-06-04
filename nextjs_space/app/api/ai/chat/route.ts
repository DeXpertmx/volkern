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
import { withPiiFilter } from '@/lib/ai/pii-filter'
import { executeSkill } from '@/lib/skills'
import { prisma } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'
import { intentClassifier } from '@/lib/agents/intent-classifier'
import { entityExtractor } from '@/lib/agents/entity-extractor'

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

// ─── Parámetros requeridos por intención ───────────────────────────────────

const INTENT_REQUIRED_PARAMS: Record<string, string[]> = {
  'crear_lead': ['nombre', 'email'],
  'agendar_cita': ['fecha', 'hora', 'nombre', 'email', 'titulo', 'tipo'],
  'crear_tarea': ['titulo'],
  'registrar_interaccion': ['tipo', 'contenido'],
  'obtener_telefono': ['nombre'],
}

const PARAM_QUESTIONS: Record<string, string> = {
  email: '📧 ¿Cuál es el correo electrónico del contacto?',
  nombre: '👤 ¿Cuál es el nombre del contacto?',
  fecha: '📅 ¿Para qué fecha? (ej: mañana, viernes, 15/06)',
  hora: '⏰ ¿A qué hora? (ej: 10:00, 2pm, 3:30pm)',
  titulo: '📋 ¿Cuál es el motivo o título de la cita?',
  telefono: '📱 ¿Cuál es el teléfono del contacto?',
  contexto: '📝 ¿Alguna nota adicional?',
  duracion: '⏱️ ¿Cuántos minutos durará la reunión?',
  tipo: '📍 ¿La cita será presencial o por videollamada?',
  contenido: '📝 ¿Qué ocurrió en la interacción?',
  ubicacion: '📍 ¿Dónde será la cita o prefieres que genere un link de Google Meet?',
}

// ─── System prompt optimizado ──────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `Eres Gemma, la asistente inteligente de Volkern.

PERSONALIDAD:
- Amable, profesional, hablas español natural
- Usas emojis con moderación  
- Resuelves dudas y ejecutas acciones del sistema

CAPACIDADES:
Puedes crear leads, contactos, citas, tareas, deals.
Puedes registrar interacciones y notas.
Puedes consultar información del sistema.

REGLAS IMPORTANTES:
1. Cuando el usuario te pida UNA ACCIÓN (crear, agendar, registrar, etc.), debes devolver el JSON estructurado con la intención.
2. NUNCA finjas que ejecutaste una acción. Debes devolver los datos estructurados para que el sistema la ejecute.
3. Si falta información, marca needsMoreInfo=true y proporciona SOLO los parámetros que el usuario mencionó explícitamente.
4. NUNCA inventes ni asignes valores por defecto. Si el usuario no dijo una fecha, NO pongas la fecha de hoy en params.
5. El mensaje de respuesta (message) debe ser natural y amigable.

INTENCIONES DISPONIBLES:
- crear_lead: Crear un nuevo lead. Parámetros requeridos: nombre, email. Opcionales: telefono, contexto.
- agendar_cita: Agendar una cita. Parámetros requeridos: fecha, hora, nombre. Opcionales: email, titulo, telefono.
- mis_citas: Consultar próximas citas. Sin parámetros.
- cancelar_cita: Cancelar una cita. Parámetros requeridos: citaId.
- crear_tarea: Crear tarea. Parámetros requeridos: titulo. Opcionales: descripcion, fechaVencimiento, email.
- completar_tarea: Completar tarea. Parámetros: taskId.
- registrar_interaccion: Registrar interacción. Parámetros requeridos: tipo, contenido.
- obtener_telefono: Buscar teléfono. Parámetros requeridos: nombre.
- consulta_general: Para preguntas, dudas, conversación casual. Sin parámetros.

CRÍTICO — NUNCA hagas esto:
❌ NO pongas "fecha": "$(date +%Y-%m-%d)" si el usuario no la mencionó
❌ NO pongas "hora": "10:00" si el usuario no la mencionó
❌ NO pongas "nombre": "Cliente" o valores inventados
❌ NO completes parámetros que el usuario no haya dicho explícitamente

En lugar de eso:
✅ Deja el parámetro FUERA de params
✅ Marca needsMoreInfo=true
✅ El sistema preguntará por cada parámetro faltante automáticamente

FORMATO DE RESPUESTA (SIEMPRE JSON):
{
  "intent": "agendar_cita",
  "confidence": 0.95,
  "needsMoreInfo": true,
  "requiresConfirmation": false,
  "params": { "nombre": "Alejandra Velázquez" },
  "message": "¿A qué hora?"
}

SOLO responde con el JSON. NADA de texto adicional fuera del JSON.`

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

    // ── 1. Construir mensaje para la IA (con contexto pendiente) ─
    let pendingContextStr = ''
    if (pendingCtx) {
      const hasActionVerb = /\b(crea|busca|agenda|cancela|registra|envía|muestra|lista|dame|nuev[oa]|convierte|genera|analiza|sugiere|aprueba|ajusta|completa|cierra|califica|rectifica)\b/i.test(message)
      
      if (!hasActionVerb && pendingCtx.missingParams.length > 0) {
        // El usuario está respondiendo a la pregunta anterior
        const nextMissing = pendingCtx.missingParams[0]
        pendingCtx.params[nextMissing] = message
        pendingCtx.missingParams = pendingCtx.missingParams.slice(1)
        
        // Guardar progreso
        await savePendingContext(userKey, tenantId, pendingCtx)
      } else {
        // El usuario inició una nueva acción - descartar contexto anterior
        await clearPendingContext(userKey)
        pendingCtx = null
      }
    }

    // Si aún faltan parámetros, preguntar directamente (sin IA)
    if (pendingCtx && pendingCtx.missingParams.length > 0) {
      const nextMissing = pendingCtx.missingParams[0]
      await savePendingContext(userKey, tenantId, pendingCtx)

      const response: ChatResponse = {
        reply: PARAM_QUESTIONS[nextMissing] || `❓ ¿Podrías proporcionarme ${nextMissing}?`,
        type: 'question',
        richData: null,
        quickReplies: [],
        chatId: responseChatId,
        action: pendingCtx.intent,
      }
      return NextResponse.json(response)
    }

    // Si todos los parámetros están completos, ejecutar skill
    if (pendingCtx && pendingCtx.missingParams.length === 0) {
      const skillName = INTENT_SKILL_MAP[pendingCtx.intent]
      if (skillName) {
        try {
          const skillResult = await executeSkill(skillName as any, {
            ...pendingCtx.params,
            tenantId,
            userId: userId || undefined,
          })

          await clearPendingContext(userKey)

          const response: ChatResponse = {
            reply: formatSuccessMessage(pendingCtx.intent, skillResult),
            type: 'rich',
            richData: { type: 'summary', ...skillResult },
            quickReplies: ['Si, gracias', 'Que mas puedes hacer?', 'Ayuda'],
            chatId: responseChatId,
            action: pendingCtx.intent,
          }
          return NextResponse.json(response)
        } catch (skillError: any) {
          await clearPendingContext(userKey)
          return NextResponse.json({
            reply: `❌ Error: ${skillError.message || 'No se pudo completar la acción'}`,
            type: 'error',
            richData: null,
            quickReplies: ['Intentar de nuevo', 'Ayuda'],
            chatId: responseChatId,
          })
        }
      }
    }

    // ── 2. Sanitizar PII y llamar a la IA ───────────────────────
    const { result: aiResult, filter, sanitizedMessage } = await withPiiFilter(message, async (sanitized) => {
      // Construir prompt con contexto pendiente si existe
      let systemPrompt = CHAT_SYSTEM_PROMPT
      if (pendingCtx) {
        systemPrompt += `\n\nCONTEXTO DE LA CONVERSACIÓN:
El usuario está en medio de la acción: "${pendingCtx.intent}"
Parámetros ya recolectados: ${JSON.stringify(pendingCtx.params)}
Parámetros faltantes: ${JSON.stringify(pendingCtx.missingParams)}

El mensaje actual del usuario es una RESPUESTA a la pregunta anterior.
Continúa con la misma intención (${pendingCtx.intent}) y completa los parámetros faltantes si el usuario los proporciona.`
      }

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: sanitized },
      ]

      const response = await callAssistantWithFallback(messages)
      const content = response.choices[0].message.content

      // Intentar parsear JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0])
        } catch {
          // Si falla el parseo, tratar como consulta_general
        }
      }

      // Fallback: si la IA no devolvió JSON, usar intent classifier
      try {
        const classification = await intentClassifier.classify({
          message: sanitized,
          userId: userKey,
          tenantId,
        })

        if (classification.intent !== 'consulta_general' && classification.confidence >= 0.5) {
          // Extraer entidades
          const extraction = await entityExtractor.extract({
            message: sanitized,
            intent: classification.intent,
          })

          return {
            intent: classification.intent,
            confidence: classification.confidence,
            needsMoreInfo: extraction.missingParams.length > 0,
            requiresConfirmation: false,
            params: extraction.entities,
            message: extraction.missingParams.length > 0
              ? (PARAM_QUESTIONS[extraction.missingParams[0]] || `❓ ¿Podrías proporcionarme ${extraction.missingParams[0]}?`)
              : `Entendido, voy a procesar tu solicitud.`,
          }
        }
      } catch {
        // Si todo falla, tratar como consulta general
      }

      // Devolver el texto de la IA como consulta general
      return {
        intent: 'consulta_general',
        confidence: 0.5,
        needsMoreInfo: false,
        requiresConfirmation: false,
        params: {},
        message: content,
      }
    })

    // ── 3. Restaurar placeholders en parámetros y mensaje ────────
    const realParams = aiResult.params ? filter.restoreParams(aiResult.params) : {}
    const realMessage = aiResult.message ? filter.restore(aiResult.message) : ''

    // ── 4. Si necesita más información: preguntar UN parámetro a la vez ─
    if (aiResult.needsMoreInfo && aiResult.intent !== 'consulta_general') {
      const requiredParams = INTENT_REQUIRED_PARAMS[aiResult.intent] || []
      const missingParams = requiredParams.filter(p => !realParams[p])

      if (missingParams.length > 0) {
        await savePendingContext(userKey, tenantId, {
          intent: aiResult.intent,
          params: realParams,
          missingParams,
        })

        // Siempre preguntar UN parámetro a la vez usando PARAM_QUESTIONS,
        // ignorando el message de la IA (que podría pedir varios a la vez)
        return NextResponse.json({
          reply: PARAM_QUESTIONS[missingParams[0]] || `❓ ¿Podrías proporcionarme ${missingParams[0]}?`,
          type: 'question',
          richData: null,
          quickReplies: [],
          chatId: responseChatId,
          action: aiResult.intent,
        } as ChatResponse)
      }
    }

    // ── 5. Ejecutar skill si aplica ──────────────────────────────
    let skillResult: any = null
    const skillName = INTENT_SKILL_MAP[aiResult.intent]

    if (skillName && !aiResult.needsMoreInfo && !aiResult.requiresConfirmation && aiResult.intent !== 'consulta_general') {
      try {
        skillResult = await executeSkill(skillName as any, {
          ...realParams,
          tenantId,
          userId: userId || undefined,
        })
        await clearPendingContext(userKey)
      } catch (skillError: any) {
        console.error('[Chat] Skill error:', skillError)
        aiResult.message = skillError.message || 'Error al ejecutar la acción'
      }
    }

    // ── 6. Construir respuesta ────────────────────────────────────

    // Log de auditoría (con mensaje SANITIZADO, sin PII)
    try {
      await prisma.chatbotAuditLog.create({
        data: {
          userId: userId || 'system',
          tenantId,
          intent: aiResult.intent,
          status: skillResult ? 'SUCCESS' : 'PENDING',
          inputRaw: sanitizedMessage.substring(0, 500),
          detectedEntities: { piiCount: filter.getMatches().length, params: realParams },
          createdAt: new Date(),
        },
      })
    } catch {
      // Non-critical
    }

    // Determinar tipo de respuesta y rich data
    let responseType: ResponseType = 'text'
    let richData: RichData | null = null
    let quickReplies: string[] = []

    if (aiResult.needsMoreInfo) {
      responseType = 'question'
    } else if (aiResult.requiresConfirmation) {
      responseType = 'confirmation'
      quickReplies = ['Sí, confirmar', 'No, cancelar']
    } else if (skillResult) {
      responseType = 'rich'
      richData = { type: 'summary', ...skillResult }
    }

    // Si es consulta general o no hay skill, texto plano
    if (aiResult.intent === 'consulta_general' || !skillResult) {
      quickReplies = [
        'Crear un lead',
        'Agendar una cita',
        '¿Qué puedes hacer?',
      ]
    }

    const response: ChatResponse = {
      reply: skillResult
        ? formatSuccessMessage(aiResult.intent, skillResult)
        : (realMessage || 'Entendido. ¿Algo más en lo que pueda ayudarte? 🌟'),
      type: responseType,
      richData,
      quickReplies: quickReplies.length > 0 ? quickReplies : [
        'Sí, gracias',
        '¿Qué más puedes hacer?',
        'Ayuda',
      ],
      chatId: responseChatId,
      action: aiResult.intent,
    }

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
