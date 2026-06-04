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
  'agendar_cita': ['nombre', 'tipo'],
  'cancelar_cita': ['nombre'],
  'crear_tarea': ['titulo'],
  'registrar_interaccion': ['tipo', 'contenido'],
  'obtener_telefono': ['nombre'],
}

const PARAM_QUESTIONS: Record<string, string> = {
  email: '📧 ¿Cuál es el correo electrónico del contacto?',
  nombre: '👤 ¿Cuál es el nombre completo del contacto?',
  fecha: '📅 ¿Para qué fecha? (ej: mañana, viernes, 15/06)',
  hora: '⏰ ¿A qué hora? (ej: 10:00, 2pm, 3:30pm)',
  titulo: '📋 ¿Cuál es el motivo o título de la cita?',
  telefono: '📱 ¿Cuál es el teléfono del contacto?',
  contexto: '📝 ¿Alguna nota adicional?',
  duracion: '⏱️ ¿Cuántos minutos durará la reunión?',
  tipo: '📍 ¿La cita será presencial o por videollamada?',
  contenido: '📝 ¿Qué ocurrió en la interacción?',
  ubicacion: '📍 Si es presencial, ¿dónde será la cita?',
  motivo: '📝 ¿Por qué motivo deseas cancelar la cita?',
}

// ─── System prompt optimizado ──────────────────────────────────────────────

function buildChatSystemPrompt(): string {
  const today = new Date()
  const todayStr = today.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  // Capitalizar primera letra
  const todayFormatted = todayStr.charAt(0).toUpperCase() + todayStr.slice(1)
  const todayISO = today.toISOString().split('T')[0]
  const weekDay = today.getDay() // 0=domingo, 1=lunes, ..., 6=sábado
  
  const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const dayName = dayNames[weekDay]

  return `Eres Gemma, la asistente inteligente de Volkern.

PERSONALIDAD:
- Eres una asistente ejecutiva profesional, amable y eficiente
- Hablas español natural y fluido, como una persona real conversando
- Usas emojis con moderación
- ERES INTELIGENTE — confiamos en tu criterio para entender el contexto

CÓMO TRABAJAS:
1. Cuando el usuario te pida una acción (crear, agendar, registrar, etc.), extrae TODOS los datos que puedas de SU MENSAJE
2. Si el usuario te dio todo en un solo mensaje, ejecuta la acción directamente. ¡No preguntes de más!
3. Si falta algo, pregunta UNA SOLA COSA a la vez, de forma NATURAL (no uses plantillas)
4. Si el usuario ya te está respondiendo a una pregunta anterior, completa el parámetro que falta
5. NUNCA inventes fechas, horas ni valores que el usuario no mencionó explícitamente
6. Cuando extraigas el NOMBRE del contacto: busca cualquier nombre propio (nombre y apellido) en el mensaje. El nombre está después de palabras como "con", "para", "de" seguidas de un nombre con mayúscula. Ej: de "Agenda una reunión con Alejandra Velázquez" el nombre es "Alejandra Velázquez". De "cita con Juan Pérez" el nombre es "Juan Pérez". Ignora palabras como "agenda", "cita", "reunión", "con" — solo deja el nombre real.

INTENCIONES DISPONIBLES:
- crear_lead: Crear un nuevo lead. Necesita: nombre, email. También: telefono, contexto.
- agendar_cita: Agendar una cita. Necesita: nombre, tipo. También: fecha, hora, email, titulo, ubicacion.
  El tipo debe ser "videollamada" o "presencial".
  - Si el usuario dice "videollamada", pon tipo:"videollamada". El sistema generará un link de Google Meet.
  - Si el usuario dice "presencial" o no especifica, pon tipo:"presencial" y también pide la ubicación.
- mis_citas: Consultar próximas citas.
- cancelar_cita: Cancelar una cita. Necesita: nombre. También: email, fecha.
- crear_tarea: Crear tarea. Necesita: titulo. También: descripcion, fechaVencimiento, email.
- completar_tarea: Completar tarea.
- registrar_interaccion: Registrar interacción. Necesita: tipo, contenido.
- obtener_telefono: Buscar teléfono. Necesita: nombre.
- consulta_general: Para preguntas, dudas, conversación casual.

FECHA ACTUAL:
Hoy es ${dayName}, ${todayFormatted} (${todayISO}).
Usa esta referencia para calcular fechas relativas como "viernes", "mañana", "próximo lunes", etc.

LÍMITES ABSOLUTOS (NO LOS ROMPAS NUNCA):
🚫 Solo hablas de Volkern. No conoces ni recomiendas otros CRM, ERP, softwares, herramientas ni competidores.
🚫 Si el usuario pregunta por otros productos ("mejor CRM", "qué opinas de Salesforce", "alternativas a Volkern"), responde: "No conozco otras herramientas. Mi especialidad es Volkern. ¿Qué necesitas hacer en Volkern?"
🚫 NUNCA menciones datos, contactos, citas, leads ni información de OTROS usuarios o empresas. Solo ves los datos del usuario que está hablando.
🚫 No des consejos financieros, legales, fiscales ni médicos externos. Sí puedes explicar cómo funcionan los módulos de Volkern (facturación, contabilidad, RRHH, etc.) pero no asesores sobre qué hacer fuera del sistema.
🚫 No inventes información. Si no sabes algo, di que no lo sabes.
🚫 No finjas tener emociones humanas. Sé profesional y cálida, pero no digas "estoy feliz" o "me siento triste".

ALCANCE:
✅ Puedes responder preguntas sobre cómo usar Volkern, sus módulos y funciones
✅ Puedes consultar y modificar los datos del usuario (citas, leads, tareas, contactos, etc.)
✅ Si no sabes cómo hacer algo en Volkern, di que lo consultes con soporte

CRÍTICO:
❌ NO inventes fechas, horas, nombres ni ningún valor
❌ Si el usuario dice "el viernes", calcula la fecha correcta usando la referencia de hoy
❌ Si el usuario no mencionó la hora, NO pongas una hora por defecto

✅ Cuando el usuario da toda la información en un mensaje, extrae todo y ejecuta
✅ Cuando falte algo, pregunta UNA COSA a la vez
✅ Tu mensaje es lo que el usuario verá — sé natural y cálido
✅ Si te preguntan "¿qué puedes hacer?", enumera las intenciones disponibles


FORMATO DE RESPUESTA (SIEMPRE JSON):
{
  "intent": "agendar_cita",
  "confidence": 0.95,
  "needsMoreInfo": false,
  "requiresConfirmation": false,
  "params": { "nombre": "Alejandra Velázquez", "fecha": "2026-06-12", "hora": "11:00", "titulo": "Revisar IA" },
  "message": "¡Perfecto! Voy a agendar la cita con Alejandra Velázquez para el viernes a las 11:00 con el motivo Revisar IA. Dame un momento..."
}

SOLO responde con el JSON. NADA de texto adicional fuera del JSON.`
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
      // Si el usuario inicia una nueva acción (verbo de acción), descartar contexto anterior
      const hasActionVerb = /\b(crea|busca|agenda|cancela|registra|envía|muestra|lista|dame|nuev[oa]|convierte|genera|analiza|sugiere|aprueba|ajusta|completa|cierra|califica|rectifica)\b/i.test(message)
      if (hasActionVerb) {
        await clearPendingContext(userKey)
        pendingCtx = null
      }
      // Si no hay verbo de acción, es una respuesta a la pregunta anterior — la IA lo procesará con contexto
    }

    // ── 2. Sanitizar PII y llamar a la IA ───────────────────────
    const { result: aiResult, filter, sanitizedMessage } = await withPiiFilter(message, async (sanitized) => {
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
    let realParams = aiResult.params ? filter.restoreParams(aiResult.params) : {}
    const realMessage = aiResult.message ? filter.restore(aiResult.message) : ''

    // ─── Validación: evitar que la IA invente fechas/horas ──
    // La IA tiende a inferir fechas (hoy) si el usuario no las mencionó.
    // Si el usuario no mencionó fecha/hora en su mensaje, las borramos.
    if (aiResult.intent === 'agendar_cita') {
      const userMentionedDate = /\b(mañana|hoy|pasado|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}[\/\-]\d{1,2})\b/i.test(message)
      const userMentionedTime = /\b(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|a\.m\.|p\.m\.|horas?|h\b)?\b/i.test(message)
      
      if (!userMentionedDate && realParams.fecha) delete realParams.fecha
      if (!userMentionedTime && realParams.hora) delete realParams.hora
    }

    // ── 4. Si la IA necesita más información: dejar que ella pregunte ─
    if (aiResult.needsMoreInfo && aiResult.intent !== 'consulta_general') {
      // Calcular qué parámetros REQUERIDOS faltan realmente
      const required = INTENT_REQUIRED_PARAMS[aiResult.intent] || []
      const actualMissing = required.filter(p => !realParams[p] && p !== 'next')
      // Si tipo es videollamada, ubicacion no es necesaria
      const missing = realParams.tipo === 'videollamada'
        ? actualMissing.filter(p => p !== 'ubicacion')
        : actualMissing

      await savePendingContext(userKey, tenantId, {
        intent: aiResult.intent,
        params: realParams,
        missingParams: missing.length > 0 ? missing : ['next'],
      })

      // Usar el mensaje NATURAL de la IA, no plantillas
      return NextResponse.json({
        reply: realMessage || '¿Qué más necesito saber?',
        type: 'question',
        richData: null,
        quickReplies: [],
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
          ...realParams,
          tenantId,
          userId: userId || undefined,
        })
        await clearPendingContext(userKey)
      } catch (skillError: any) {
        console.error('[Chat] Skill error:', skillError)
        const msg = skillError.message || 'Error al ejecutar la acción'
        aiResult.message = msg

        // Si el skill necesita más datos (EMAIL_REQUIRED), guardar contexto pendiente
        // para que la conversación continúe naturalmente
        if (msg.startsWith('EMAIL_REQUIRED:')) {
          skillErrorMsg = msg.replace(/^EMAIL_REQUIRED:\s*/, '')
          aiResult.message = skillErrorMsg
          await savePendingContext(userKey, tenantId, {
            intent: aiResult.intent,
            params: realParams,
            missingParams: ['next'],
          })
        } else {
          skillErrorMsg = msg
        }
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
        : (skillErrorMsg || realMessage || 'Entendido. ¿Algo más en lo que pueda ayudarte? 🌟'),
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
