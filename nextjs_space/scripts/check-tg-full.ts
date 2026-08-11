/**
 * Diagnóstico completo del bot de Telegram del tenant de Bruno.
 * Busca el token en Channel moderno (cifrado) y Integration legacy (plano),
 * resuelve el botUsername real con getMe, y simula el GET del QR.
 */
import { prisma } from '../lib/db'
import { decrypt } from '../lib/core/crypto'

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'bruno.hess@dimensionexpert.com' },
    select: { id: true, tenantId: true, metadata: true },
  })
  const tenantId = user?.tenantId
  if (!tenantId) { console.log('❌ Bruno sin tenant'); return }

  console.log(`Tenant: ${tenantId}`)

  // 1. Channel moderno (todos, con y sin isActive)
  const channels = await prisma.channel.findMany({
    where: { tenantId, type: 'telegram' },
    select: { id: true, name: true, isActive: true, config: true },
  })
  console.log('\n=== CHANNELS (type=telegram) ===')
  if (channels.length === 0) console.log('(ninguno)')
  for (const c of channels) {
    const cfg = (c.config as any) || {}
    let token = null
    if (cfg?.botToken) { try { token = decrypt(cfg.botToken) } catch { token = null } }
    console.log(`- ${c.name || '(sin nombre)'} | isActive=${c.isActive} | botUsername=${cfg?.botUsername} | botName=${cfg?.botName} | token=${token && token.includes(':') ? '✅' : token ? '⚠️(no formato cifrado)' : '❌'}`)
  }

  // 2. Integration legacy
  const integrations = await prisma.integration.findMany({
    where: { tenantId, tipo: 'telegram' },
    select: { id: true, nombre: true, activo: true, credenciales: true },
  })
  console.log('\n=== INTEGRATIONS (tipo=telegram) ===')
  if (integrations.length === 0) console.log('(ninguna)')
  for (const i of integrations) {
    const creds = (i.credenciales as any) || {}
    console.log(`- ${i.nombre || '(sin nombre)'} | activo=${i.activo} | bot_token=${creds?.bot_token ? '✅' : '❌'} | bot_username=${creds?.bot_username || creds?.botName || '—'} | admin_chat_id=${creds?.admin_chat_id || '—'}`)
  }

  // 3. Resolver token real (Channel → legacy → env)
  const ch = channels.find(c => ((c.config as any)?.botToken && ((c as any).isActive !== false)))
  let token: string | null = null
  let source = 'none'
  if (ch?.config) {
    const cfg = ch.config as any
    try {
      const t = decrypt(cfg.botToken)
      if (t && t.includes(':')) { token = t; source = 'channel' }
    } catch { /* noop */ }
  }
  if (!token && integrations.length > 0) {
    const creds = (integrations.find(i => i.activo)?.credenciales as any) || (integrations[0]?.credenciales as any) || {}
    if (creds?.bot_token) { token = creds.bot_token; source = 'integration' }
  }
  if (!token && process.env.TELEGRAM_BOT_TOKEN) { token = process.env.TELEGRAM_BOT_TOKEN; source = 'env' }
  console.log(`\n=== TOKEN RESUELTO ===`)
  console.log(`source: ${source} | token: ${token ? '✅ presente (no se muestra)' : '❌ NO HAY TOKEN'}`)

  if (token) {
    const me = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }))
    console.log('\n=== getMe ===')
    console.log('ok:', me.ok, '| username:', me.result?.username, '| name:', me.result?.first_name)
    if (me.ok) {
      console.log(`\n✅ El QR del perfil debería apuntar a: https://t.me/${me.result.username}?start=u_${user.id}_<token>`)
    } else {
      console.log('❌ getMe falló:', me.description || me.error)
    }
  } else {
    console.log('\n❌❌ NO HAY BOT CONFIGURADO EN EL TENANT')
    console.log('El QR que viste se generó con un username de fallback (sin token),')
    console.log('así que el bot NO existe y al escanearlo Telegram no puede procesar el /start.')
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
