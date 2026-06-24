export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  buildQuickReplyMarkup,
  clearReplyMarkup,
  parseQuickReplyCallback,
  sendBotMessage,
} from '@/lib/telegram/quick-replies'

/**
 * Webhook directo de Telegram — pipeline unificado
 *
 * Flujos soportados:
 * 1. /start → vincula el chat_id como admin_chat_id de una integración del tenant
 * 2. callback_query (admin_buy:|reject_buy:) → flujo watchdog de aprobación de compras (no usa chatbot)
 * 3. callback_query (qr:...) → quick reply del chatbot (re-envía el texto al pipeline unificado)
 * 4. Mensajes normales → chatbot-service unificado (tool calling + quick replies como inline_keyboard)
 */

// Timeout para la pipeline unificada (Telegram cierra el webhook a los 30s)
const PIPELINE_TIMEOUT_MS = 25000

// Ventana para rate-limit por chat (evita abuso si una integración queda expuesta)
const RATE_LIMIT_WINDOW_MS = 1500

// TTL anti-duplicado para update_id (Telegram puede reenviar el mismo webhook)
const UPDATE_DEDUPE_TTL_MS = 30000

// Umbral bajo para limpieza de caches in-memory en instancias warm
const LRU_CLEANUP_THRESHOLD = 1000

// ─── Rate-limit LRU simple (en memoria, por instancia serverless) ─────────
const lastCallByChat = new Map<string, number>()

function isRateLimited(chatId: string): boolean {
  const now = Date.now()
  const last = lastCallByChat.get(chatId)
  if (last !== undefined && now - last < RATE_LIMIT_WINDOW_MS) {
    return true
  }
  lastCallByChat.set(chatId, now)
  if (lastCallByChat.size > LRU_CLEANUP_THRESHOLD) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS * 10
    for (const [k, v] of lastCallByChat) {
      if (v < cutoff) lastCallByChat.delete(k)
    }
  }
  return false
}

// ─── Anti-duplicado de update_id (TTL corto, protege contra retries) ─────
const processedUpdateIds = new Map<string, number>()

function isUpdateProcessed(updateId: string | number | undefined): boolean {
  if (updateId === undefined) return false
  const key = String(updateId)
  const now = Date.now()
  const last = processedUpdateIds.get(key)
  if (last !== undefined && now - last < UPDATE_DEDUPE_TTL_MS) {
    return true
  }
  processedUpdateIds.set(key, now)
  if (processedUpdateIds.size > LRU_CLEANUP_THRESHOLD) {
    const cutoff = now - UPDATE_DEDUPE_TTL_MS
    for (const [k, v] of processedUpdateIds) {
      if (v < cutoff) processedUpdateIds.delete(k)
    }
  }
  return false
}

// ─── Helpers ──────────────────────────────────────────────────────────────

interface TelegramContext {
  tenantId: string
  botToken: string
}

/**
 * Encuentra el tenant y el bot_token para responder a un chat_id.
 *
 * 1) Primero busca si el chatId coincide con algún admin_chat_id configurado
 *    (caso típico: admin usando el bot desde Telegram).
 * 2) Si no, hace fallback a la primera integración activa de Telegram con bot_token
 *    (casos legacy: un único bot activo en el sistema).
 */
async function findTelegramContext(chatId: string): Promise<TelegramContext | null> {
  const integrations = await prisma.integration.findMany({
    where: { tipo: 'telegram', activo: true },
    select: { id: true, tenantId: true, credenciales: true, nombre: true },
  })

  // 1. Match exacto por admin_chat_id
  for (const integration of integrations) {
    const creds = integration.credenciales as any
    if (creds?.admin_chat_id === chatId && creds?.bot_token) {
      return { tenantId: integration.tenantId, botToken: creds.bot_token }
    }
  }

  // 2. Fallback: primera integración con bot_token
  for (const integration of integrations) {
    const creds = integration.credenciales as any
    if (creds?.bot_token) {
      return { tenantId: integration.tenantId, botToken: creds.bot_token }
    }
  }

  return null
}



/**
 * Procesa un mensaje (texto del usuario o callback_data de quick reply)
 * a través del pipeline unificado y envía la respuesta al chat.
 * Envuelto en timeout para no superar los 30s que Telegram permite.
 */
async function processAndReply(
  chatId: string,
  senderName: string,
  messageText: string,
  ctx: TelegramContext
): Promise<void> {
  try {
    const { processMessage: unifiedProcessMessage } = await import('@/lib/chat/chatbot-service')

    const pipelineCall = unifiedProcessMessage({
      tenantId: ctx.tenantId,
      conversationId: `telegram:${chatId}`,
      message: messageText,
      channel: 'telegram',
      contactName: senderName,
      contactPhone: chatId,
    })

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PIPELINE_TIMEOUT')), PIPELINE_TIMEOUT_MS)
    )

    const result = await Promise.race([pipelineCall, timeout])

    // Rate limit interno del chatbot → no enviar respuesta
    if (!result.success && result.error === 'rate_limit') {
      return
    }

    const replyText = result.response || 'Lo siento, no pude procesar tu mensaje.'

    const replyMarkup =
      result.quickReplies && result.quickReplies.length > 0
        ? buildQuickReplyMarkup(result.quickReplies)
        : undefined

    await sendBotMessage(chatId, replyText, ctx.botToken, replyMarkup)
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === 'PIPELINE_TIMEOUT'
    console.error('[TelegramWebhook] Error en processAndReply:', error)

    try {
      await sendBotMessage(
        chatId,
        isTimeout
          ? '⏳ Estoy tardando más de lo normal. Por favor, intenta de nuevo en unos segundos.'
          : '❌ Ocurrió un error procesando tu mensaje. Intenta de nuevo en unos segundos.',
        ctx.botToken
      )
    } catch (sendErr) {
      console.error('[TelegramWebhook] Error enviando fallback:', sendErr)
    }
  }
}

// ─── Handler principal ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  console.log(`[AlternativeTelegramWebhook] Received POST request at ${new Date().toISOString()}`)
  try {
    const body = await request.json()

    // ════════════════════════════════════════════════════════════════════
    // 1. CALLBACK QUERY HANDLERS
    // ════════════════════════════════════════════════════════════════════

  if (body.callback_query) {
    const { callback_query } = body

    // Filtro: ignorar callbacks de otros bots + duplicados por update_id
    if (callback_query.from?.is_bot || isUpdateProcessed(callback_query.id)) {
      return NextResponse.json({ ok: true })
    }

      // 1a. Quick reply del chatbot (callback_data "qr:<texto>")
      const messageText = parseQuickReplyCallback(callback_query.data)
      if (messageText !== null) {
        const chatId = callback_query.message.chat.id.toString()
        const senderName =
          callback_query.from.first_name +
          (callback_query.from.last_name ? ` ${callback_query.from.last_name}` : '')

        const ctx = await findTelegramContext(chatId)
        if (ctx) {
          // Limpiamos el teclado del mensaje original para evitar clicks duplicados
          clearReplyMarkup(chatId, callback_query.message.message_id, ctx.botToken).catch(() => {})

          // Fire-and-forget (Telegram requiere <30s) — processAndReply envía
          // un fallback al usuario ante cualquier error, no necesitamos catch.
          processAndReply(chatId, senderName, messageText, ctx)
        }

        return NextResponse.json({
          method: 'answerCallbackQuery',
          callback_query_id: callback_query.id,
        })
      }

      // 1b. Flujo watchdog: admin authorize / reject buy (no es chatbot)
      const chatId = callback_query.message.chat.id.toString()
      const data = callback_query.data // Formato: "accion:itemId:tenantId"
      const [action, itemId, tenantId] = data.split(':')

      // Seguridad: verificar admin legítimo
      // (Prisma JSON `contains` sin `path` no compara anidados correctamente;
      // filtramos en app code para soportar `metadata.telegram.chat_id` o `metadata.telegram_chat_id`)
      const adminCandidates = await prisma.user.findMany({
        where: { tenantId, role: { nombre: 'ADMIN' } },
        select: { id: true, name: true, metadata: true },
        take: 50,
      })
      const admin =
        adminCandidates.find((u) => {
          const meta = (u.metadata as any) || {}
          const legacy = meta?.telegram_chat_id
          const nested = meta?.telegram?.chat_id
          return legacy === chatId || String(nested) === chatId
        }) || null

      if (!admin) {
        return NextResponse.json({
          method: 'answerCallbackQuery',
          callback_query_id: callback_query.id,
          text: '❌ ERROR: No tienes permisos para autorizar acciones en este Tenant.',
          show_alert: true,
        })
      }

      if (action === 'reject_buy') {
        return NextResponse.json({
          method: 'editMessageText',
          chat_id: chatId,
          message_id: callback_query.message.message_id,
          text: `${callback_query.message.text}\n\n❌ <b>COMPRA RECHAZADA</b> por ${admin.name}.`,
        })
      }

      if (action === 'auth_buy') {
        const { skills } = await import('@/lib/skills')

        const item = await prisma.catalogoItem.findUnique({
          where: { id: itemId },
          select: { nombre: true, sku: true, precio: true } as any,
        })

        const expense = await (skills.create_expense as any)({
          tenantId,
          createdById: admin.id,
          description: `COMPRA PROACTIVA (Watchdog): ${item?.nombre || 'Item'} - SKU: ${item?.sku}`,
          amount: (item as any)?.precio || 0,
          category: 'Proactivo',
          status: 'PENDING_RECEIPT' as any,
          supplierId: 'watchdog-system',
        })

        return NextResponse.json({
          method: 'editMessageText',
          chat_id: chatId,
          message_id: callback_query.message.message_id,
          text: `${callback_query.message.text}\n\n✅ <b>COMPRA AUTORIZADA</b> por ${admin.name}.\nGasto: <b>€${expense.amount}</b> registrado como <i>PENDIENTE DE RECIBO</i>.`,
        })
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // 2. MENSAJES DIRECTOS
    // ════════════════════════════════════════════════════════════════════

    // Anti-duplicado a nivel de update (Telegram puede reenviar el mismo webhook)
    if (isUpdateProcessed(body.update_id)) {
      return NextResponse.json({ ok: true })
    }

    if (body.message) {
      const { message } = body

      // Filtro: ignorar mensajes de otros bots (evita gastos de LLM y ruido en historial)
      if (message.from?.is_bot) {
        return NextResponse.json({ ok: true })
      }

      const chatId = message.chat.id.toString()
      const senderName =
        message.from.first_name + (message.from.last_name ? ` ${message.from.last_name}` : '')
      const messageText = message.text || ''

      // Ignorar mensajes sin texto (stickers, fotos, audios): el chatbot no
      // procesa contenido multimedia y gastaríamos una llamada inútil al LLM.
      if (!messageText.trim()) {
        return NextResponse.json({ ok: true })
      }

      // ─────────────────────────────────────────────────────────────────
      // 2a. Comando /start → configura notificaciones (config flow)
      // ─────────────────────────────────────────────────────────────────
      if (messageText.startsWith('/start')) {
        const parts = messageText.split(' ')
        const tenantIdParam = parts.length > 1 ? parts[1] : null

        let integration = null

        if (tenantIdParam) {
          integration = await prisma.integration.findFirst({
            where: { tenantId: tenantIdParam, tipo: 'telegram', activo: true },
            select: { id: true, credenciales: true, nombre: true, tenantId: true },
          })
        }

        if (!integration) {
          const tenants = await prisma.tenant.findMany({
            where: { estado: 'activo' },
            select: { id: true },
          })

          for (const tenant of tenants) {
            const found = await prisma.integration.findFirst({
              where: { tenantId: tenant.id, tipo: 'telegram', activo: true },
              select: { id: true, credenciales: true, nombre: true, tenantId: true },
            })
            if (found) {
              integration = found
              break
            }
          }
        }

        if (integration?.credenciales) {
          const creds = integration.credenciales as any
          await prisma.integration.update({
            where: { id: integration.id },
            data: {
              credenciales: {
                ...creds,
                admin_chat_id: chatId,
              },
            },
          })

          console.log(`[Telegram] Admin chat_id configurado: ${chatId} para tenant ${integration.tenantId}`)

          const botToken = creds.bot_token
          if (botToken) {
            try {
              await sendBotMessage(
                chatId,
                `✅ *¡Configuración completa!*\n\nAhora recibirás notificaciones de Volkern en este chat.\n\n📱 *Tu Chat ID:* \`${chatId}\``,
                botToken
              )
            } catch (sendErr) {
              console.error('[TelegramWebhook] Error enviando confirmación de /start:', sendErr)
            }
          }

          return NextResponse.json({ ok: true })
        }

        const ctx = await findTelegramContext(chatId)
        if (ctx) {
          try {
            await sendBotMessage(
              chatId,
              `⚠️ No se encontró una integración de Telegram activa para vincular tu cuenta.`,
              ctx.botToken
            )
          } catch (sendErr) {
            console.error('[TelegramWebhook] Error enviando aviso /start sin integración:', sendErr)
          }
        }
        return NextResponse.json({ ok: true })
      }

      // ─────────────────────────────────────────────────────────────────
      // 2b. Mensaje regular → pipeline unificado (tool calling + quick replies)
      // ─────────────────────────────────────────────────────────────────

      const ctx = await findTelegramContext(chatId)
      if (!ctx) {
        console.warn(`[TelegramWebhook] No se encontró tenant para chat ${chatId}, ignorando mensaje`)
        return NextResponse.json({ ok: true })
      }

      // Rate-limit por chat para evitar abuso si una integración queda expuesta
      if (isRateLimited(chatId)) {
        return NextResponse.json({ ok: true })
      }

      await processAndReply(chatId, senderName, messageText, ctx)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error en webhook de Telegram:', error)
    return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 })
  }
}
