/**
 * Telegram Quick-Replies — helpers compartidos para el Bot API oficial de Telegram.
 *
 * Este módulo centraliza la lógica que antes vivía inline en `app/api/webhooks/telegram/route.ts`:
 *  - `buildQuickReplyMarkup` — convierte `quickReplies: string[]` al `inline_keyboard` nativo
 *     de Telegram (max 8 botones, truncado a 56 chars + `...` para garantizar que
 *     `callback_data` ≤ 64 bytes como exige la API).
 *  - `sendBotMessage` — envía un mensaje al Bot API con `parse_mode = 'Markdown'` y
 *     fallback automático a texto plano cuando Telegram rechaza el parseo.
 *  - `clearReplyMarkup` — limpia el `reply_markup` de un mensaje ya enviado tras un
 *     click en un quick reply (evita clicks duplicados sobre el mismo teclado).
 *  - `parseQuickReplyCallback` — extrae el texto del chip del `callback_data`
 *     (`qr:<texto>`); encapsula el prefijo para que el resto del código no manipule strings.
 *
 * El flujo del webhook de Telegram **no** comparte estos helpers con el flujo vía
 * Chatwoot (`lib/agents/chatwoot-chatbot-handler.ts`): Chatwoot recibe los chips en
 * formato `content_attributes.interactive.action.buttons` y los traduce al canal
 * nativo (WhatsApp interactive buttons, Telegram inline_keyboard, etc.), con límites
 * distintos (3 botones en WhatsApp vs 8 en Telegram directo).
 */

// Prefijo para callback_data de quick replies generadas por el chatbot.
// (No se exporta para forzar a los consumers a usar `parseQuickReplyCallback` en
//  su lugar — evita que el prefijo "qr:" se filtre al resto del código.)
const QUICK_REPLY_PREFIX = 'qr:'

// Límite seguro para el texto de cada botón + callback_data en Telegram.
//   • Texto del botón: máximo 56 chars (recortamos a 53 + "..." si excede).
//   • callback_data: 3 bytes del prefijo "qr:" + 53 chars de texto + 3 bytes "..." = 59 < 64.
const TEXT_LIMIT = 56

// Límite máximo de botones por `inline_keyboard` (recomendación Telegram).
const MAX_INLINE_BUTTONS = 8

// Límite real de Telegram para mensajes de texto (cortamos ligeramente por seguridad).
const TELEGRAM_MAX_TEXT_LENGTH = 4000

/**
 * Parsea el `callback_data` de un callback_query y devuelve el texto del chip si
 * empieza por `qr:`, o `null` si no es un quick reply. Encapsula el prefijo para
 * que el interceptor del webhook no tenga que manipular strings a mano.
 */
export function parseQuickReplyCallback(callbackData: string | undefined | null): string | null {
  if (!callbackData || !callbackData.startsWith(QUICK_REPLY_PREFIX)) return null
  return callbackData.substring(QUICK_REPLY_PREFIX.length)
}

/**
 * Convierte los quickReplies del chatbot al formato `inline_keyboard` de Telegram.
 *
 *  - Max 8 botones por inline_keyboard.
 *  - Texto del botón y callback_data máx 64 bytes (límite Telegram); recortamos
 *    ambos al MISMO límite para que el callback round-trippee exactamente el
 *    texto visible.
 *  - Filtra entradas vacías (Telegram rechaza `callback_data` vacío).
 */
export function buildQuickReplyMarkup(quickReplies: string[]): Record<string, unknown> {
  const buttons = quickReplies
    .slice(0, MAX_INLINE_BUTTONS)
    .filter((reply) => reply && reply.trim().length > 0)
    .map((reply) => {
      const safeText =
        reply.length > TEXT_LIMIT ? reply.substring(0, TEXT_LIMIT - 3) + '...' : reply
      return [
        {
          text: safeText,
          callback_data: (QUICK_REPLY_PREFIX + safeText).substring(0, 64),
        },
      ]
    })
  return { inline_keyboard: buttons }
}

/**
 * Envía un mensaje a un chat vía la API oficial de Telegram Bot.
 *
 * Comportamiento:
 *  - Trunca el texto a `TELEGRAM_MAX_TEXT_LENGTH` (4000 chars) para evitar recortes
 *    silenciosos.
 *  - Intenta primero con `parse_mode = 'Markdown'`; si Telegram rechaza el mensaje
 *    por el modo de parseo (`can't parse`, `parse_mode`, `Markdown`), reintenta en
 *    texto plano preservando `reply_markup` y demás campos.
 */
export async function sendBotMessage(
  chatId: string,
  text: string,
  botToken: string,
  replyMarkup?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`

  const safeText =
    text.length > TELEGRAM_MAX_TEXT_LENGTH
      ? text.substring(0, TELEGRAM_MAX_TEXT_LENGTH - 3) + '...'
      : text

  const buildBody = (withMarkdown: boolean): Record<string, unknown> =>
    withMarkdown
      ? {
          chat_id: chatId,
          text: safeText,
          parse_mode: 'Markdown',
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }
      : {
          chat_id: chatId,
          text: safeText,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }

  // Primer intento: con Markdown
  const first = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildBody(true)),
  })

  if (first.ok) return { success: true }

  // Si falló por el modo de parseo, reintentamos en texto plano
  const data = await first.json().catch(() => null)
  const description = data?.description || ''
  const isParseError =
    typeof description === 'string' &&
    (description.includes("can't parse") ||
      description.includes('parse_mode') ||
      description.includes('Markdown'))

  if (isParseError) {
    const second = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBody(false)),
    })
    if (second.ok) return { success: true }
    const err2 = await second.json().catch(() => null)
    console.error('[TelegramWebhook] Error enviando mensaje (plain):', err2?.description || second.statusText)
    return { success: false, error: err2?.description || 'sendMessage failed' }
  }

  console.error('[TelegramWebhook] Error enviando mensaje:', description || first.statusText)
  return { success: false, error: description || 'sendMessage failed' }
}

/**
 * Limpia el `reply_markup` de un mensaje (útil tras hacer click en un quick reply
 * para evitar clicks duplicados sobre el mismo teclado inline).
 *
 * Fire-and-forget en la práctica: si falla, el teclado simplemente se queda en
 * pantalla pero no afecta la respuesta.
 */
export async function clearReplyMarkup(
  chatId: string,
  messageId: number,
  botToken: string
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      }),
    })
  } catch (err) {
    console.warn('[TelegramWebhook] No se pudo limpiar reply_markup:', err)
  }
}
