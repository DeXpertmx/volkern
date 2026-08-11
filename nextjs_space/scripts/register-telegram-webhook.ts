/**
 * Registra el webhook del bot de Telegram del tenant de Bruno.
 *
 * Causa raíz detectada: el bot NO tiene webhook registrado (getWebhookInfo
 * devuelve url="" con updates pendientes), así que los /start del QR quedan
 * en cola en Telegram y el chat_id nunca se guarda.
 *
 * Este script registra el webhook apuntando al pipeline unificado de Volkern
 * (`/api/webhooks/telegram`), que procesa los payloads `/start u_<userId>_<token>`
 * del QR de vinculación del perfil.
 *
 * Uso:
 *   npx tsx scripts/register-telegram-webhook.ts [webhookUrlOpcional]
 */
import { prisma } from '../lib/db'
import { decrypt } from '../lib/core/crypto'

const DEFAULT_WEBHOOK_URL = 'https://volkern.app/api/webhooks/telegram'
const WEBHOOK_URL_ARG = process.argv[2]
const FORCE = process.argv.includes('--force')

// Mismo orden de cascada que loadTelegramCredentials (lib/telegram.ts):
// 1) Channel moderno (botToken cifrado AES) → 2) Integration legacy (plano) → 3) env
async function resolveBotToken(tenantId: string): Promise<{ token: string | null; source: string }> {
  const channel = await prisma.channel.findFirst({
    where: { tenantId, type: 'telegram', isActive: true },
    select: { config: true },
  })
  const channelConfig = (channel?.config as any) || {}
  if (channelConfig?.botToken) {
    try {
      const t = decrypt(channelConfig.botToken)
      if (t.includes(':')) return { token: t, source: 'channel_decrypted' }
    } catch { /* noop */ }
  }

  const integration = await prisma.integration.findFirst({
    where: { tenantId, tipo: 'telegram', activo: true },
    select: { credenciales: true },
  })
  const creds = (integration?.credenciales as any) || {}
  if (creds?.bot_token) return { token: creds.bot_token, source: 'integration_legacy' }

  if (process.env.TELEGRAM_BOT_TOKEN) return { token: process.env.TELEGRAM_BOT_TOKEN, source: 'env' }
  return { token: null, source: 'none' }
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'bruno.hess@dimensionexpert.com' },
    select: { id: true, tenantId: true, metadata: true },
  })
  if (!user?.tenantId) {
    console.error('❌ Bruno sin tenant')
    process.exit(1)
  }

  const webhookUrl = WEBHOOK_URL_ARG || DEFAULT_WEBHOOK_URL
  const { token, source } = await resolveBotToken(user.tenantId)

  console.log(`Tenant    : ${user.tenantId}`)
  console.log(`Bot token : ${token ? '✅ resuelto (' + source + ')' : '❌ NO resuelto'}`)
  console.log(`Webhook   : ${webhookUrl}`)

  if (!token) {
    console.error('\n❌ No hay token de bot. No se puede registrar el webhook.')
    process.exit(1)
  }

  // Estado ANTES
  const before = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
    signal: AbortSignal.timeout(8000),
  }).then(r => r.json()).catch(() => ({}))
  const beforeUrl = before?.result?.url || ''
  console.log('\n=== ESTADO ANTES ===')
  console.log('url:', beforeUrl || '(vacía)', '| pending:', before?.result?.pending_update_count ?? '?')

  // GUARDIA: si el bot ya apunta a OTRA url, puede ser un bot compartido por
  // otros flujos (chatbot, watchdog, quick-replies). No sobrescribir a ciegas.
  if (!FORCE && beforeUrl && beforeUrl !== webhookUrl) {
    console.error(`\n⛔ El webhook del bot ya apunta a OTRA url:`)
    console.error(`   Actual : ${beforeUrl}`)
    console.error(`   Destino: ${webhookUrl}`)
    console.error(`   Esto sugiere un bot compartido por otros flujos.`)
    console.error(`   Para sobrescribirlo pásale la URL como argumento con --force:`)
    console.error(`   npx tsx scripts/register-telegram-webhook.ts ${webhookUrl} --force`)
    process.exit(1)
  }

  // Registrar webhook
  console.log('\n📤 Registrando webhook...')
  const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
    }),
    signal: AbortSignal.timeout(8000),
  })
  const setData = await setRes.json().catch(() => ({}))
  console.log(`setWebhook HTTP ${setRes.status}:`, JSON.stringify(setData))

  if (!setData?.ok) {
    console.error(`\n❌ setWebhook falló: ${setData?.description || 'respuesta inesperada'}`)
    process.exit(1)
  }

  // Estado DESPUÉS (dar 2s para que Telegram propague)
  await new Promise(r => setTimeout(r, 2000))
  const after = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
    signal: AbortSignal.timeout(8000),
  }).then(r => r.json()).catch(() => ({}))
  console.log('\n=== ESTADO DESPUÉS ===')
  console.log('url:', after?.result?.url || '(vacía)', '| pending:', after?.result?.pending_update_count ?? '?')
  console.log('last_error:', after?.result?.last_error_message || '(ninguno)')

  if (after?.result?.url === webhookUrl) {
    console.log('\n✅ ✅ ✅ WEBHOOK REGISTRADO CORRECTAMENTE ✅ ✅ ✅')
    console.log('Telegram ya está entregando los /start pendientes al servidor.')
    console.log('Espera unos segundos y re-ejecuta: npx tsx scripts/diagnose-telegram-link.ts')
    console.log('para confirmar que el chat_id quedó vinculado, y luego envía la notificación de prueba.')
  } else {
    console.log('\n⚠️ La URL registrada no coincide. Revisa el resultado de setWebhook.')
  }
}

main()
  .catch((e: any) => {
    console.error(JSON.stringify({ status: 'error', message: e?.message ?? 'unknown', code: e?.code ?? null }, null, 2))
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
