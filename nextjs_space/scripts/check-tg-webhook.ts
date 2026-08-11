/**
 * Diagnóstico: ¿está registrado el webhook del bot de Telegram?
 * Resuelve el token del tenant (Integration legacy → Channel cifrado → env)
 * y llama getWebhookInfo para ver si apunta a la URL de producción.
 */
import { prisma } from '../lib/db'
import { decrypt } from '../lib/core/crypto'

async function resolveBotToken(tenantId: string): Promise<string | null> {
  const integration = await prisma.integration.findFirst({
    where: { tenantId, tipo: 'telegram', activo: true },
    select: { credenciales: true },
  })
  const creds = (integration?.credenciales as any) || {}
  if (creds?.bot_token) return creds.bot_token

  const channel = await prisma.channel.findFirst({
    where: { tenantId, type: 'telegram', isActive: true },
    select: { config: true },
  })
  const cfg = (channel?.config as any) || {}
  if (cfg?.botToken) {
    try {
      const t = decrypt(cfg.botToken)
      if (t.includes(':')) return t
    } catch { /* noop */ }
  }
  return process.env.TELEGRAM_BOT_TOKEN || null
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'bruno.hess@dimensionexpert.com' },
    select: { tenantId: true },
  })
  if (!user?.tenantId) { console.log('❌ Bruno sin tenant'); return }

  const token = await resolveBotToken(user.tenantId)
  if (!token) { console.log('❌ Sin token de bot'); return }

  console.log('=== getWebhookInfo ===')
  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
    signal: AbortSignal.timeout(8000),
  }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }))
  console.log(JSON.stringify(info, null, 2))

  const url = info?.result?.url || ''
  console.log('\n=== ANÁLISIS ===')
  if (!url) {
    console.log('❌ NO hay webhook registrado. El bot usa polling o nada.')
    console.log('   → El /start del QR NUNCA llega al servidor. Por eso el QR no vincula.')
  } else if (url.includes('/api/webhooks/telegram')) {
    console.log(`✅ Webhook registrado → ${url}`)
    console.log('   El /start del QR debería llegar. Revisa errores (last_error_message).')
  } else {
    console.log(`⚠️ Webhook apunta a OTRA URL → ${url}`)
    console.log('   El /start del QR llega a otro servidor, no al de Volkern.')
  }
  if (info?.result?.last_error_message) {
    console.log('\n⚠️ last_error_message:', info.result.last_error_message)
  }
  if (typeof info?.result?.pending_update_count === 'number') {
    console.log('pending_update_count:', info.result.pending_update_count)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
