/**
 * Diagnóstico del vínculo QR de Telegram + envío de notificación de prueba.
 *
 * 1. Localiza al usuario (por email o por chat_id presente en metadata).
 * 2. Verifica si el QR quedó vinculado (metadata.telegram_chat_id / metadata.telegram.chat_id).
 * 3. Resuelve el token del bot del tenant (Channel moderno cifrado → Integration legacy plano).
 * 4. Envía una notificación de prueba al chat_id vinculado.
 *
 * Uso:
 *   npx tsx scripts/diagnose-telegram-link.ts [email] [mensajeOpcional]
 */
import { prisma } from '../lib/db'
import { decrypt } from '../lib/core/crypto'

const EMAIL_ARG = process.argv[2]
const MESSAGE_ARG = process.argv[3]

const DEFAULT_MESSAGE =
  '🔔 *Notificación de Prueba* 🔔\n\n¡Conexión de Telegram exitosa! 🎉\n\nTu cuenta quedó vinculada correctamente al bot de Volkern y ya recibirás tus notificaciones aquí.\n\n— Sistema Volkern'

async function resolveBotToken(tenantId: string): Promise<{
  token: string | null
  source: string
  adminChatId: string | null
}> {
  // 1) Channel moderno (botToken cifrado con AES)
  const channel = await prisma.channel.findFirst({
    where: { tenantId, type: 'telegram', isActive: true },
    select: { config: true },
  })
  const channelConfig = (channel?.config as any) || {}
  if (channelConfig?.botToken) {
    try {
      const token = decrypt(channelConfig.botToken)
      if (token && token.includes(':')) {
        return {
          token,
          source: 'channel_decrypted',
          adminChatId: channelConfig.adminChatId || channelConfig.admin_chat_id || null,
        }
      }
    } catch (e) {
      console.error('[diagnose] Error descifrando botToken del Channel:', e)
    }
  }

  // 2) Integration legacy (credenciales.bot_token en texto plano)
  const integration = await prisma.integration.findFirst({
    where: { tenantId, tipo: 'telegram', activo: true },
    select: { credenciales: true },
  })
  const creds = (integration?.credenciales as any) || {}
  if (creds?.bot_token) {
    return {
      token: creds.bot_token,
      source: 'integration_legacy',
      adminChatId: creds.admin_chat_id || creds.adminChatId || null,
    }
  }

  // 3) Variables de entorno (último recurso)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    return {
      token: process.env.TELEGRAM_BOT_TOKEN,
      source: 'env',
      adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || null,
    }
  }

  return { token: null, source: 'none', adminChatId: null }
}

async function main() {
  const email = EMAIL_ARG || 'bruno.hess@dimensionexpert.com'

  // ── 1. Localizar usuario ─────────────────────────────────────────────
  let user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      tenantId: true,
      metadata: true,
      tenant: { select: { nombre: true, subdomain: true } },
    },
  })

  if (!user && email === 'bruno.hess@dimensionexpert.com') {
    // Fallback: buscar cualquier usuario con chat_id de Telegram vinculado
    const candidates = await prisma.user.findMany({
      where: { tenantId: { not: null } },
      select: { id: true, name: true, email: true, tenantId: true, metadata: true },
      take: 500,
    })
    const linked = candidates.filter(
      (c: any) => (c.metadata as any)?.telegram_chat_id || (c.metadata as any)?.telegram?.chat_id
    )
    if (linked.length > 0) {
      user = linked[0] as any
      console.log(`\n[diagnose] Bruno no encontrado; usando usuario con chat vinculado: ${user.email}`)
    }
  }

  if (!user) {
    console.error(JSON.stringify({ status: 'error', message: `Usuario ${email} no encontrado` }))
    process.exit(1)
  }

  const metadata = (user.metadata as any) || {}
  const chatId = metadata.telegram_chat_id || metadata.telegram?.chat_id || null
  const linkedAt = metadata.telegram?.linkedAt || null

  console.log('\n══════════ DIAGNÓSTICO VÍNCULO TELEGRAM ══════════')
  console.log(`Usuario : ${user.name} <${user.email}>`)
  console.log(`Tenant  : ${user.tenant?.nombre} (${user.tenant?.subdomain || user.tenantId})`)
  console.log('───────────────────────────────────────────────────')
  console.log(`Chat ID vinculado : ${chatId ? chatId : '❌ NO VINCULADO'}`)
  console.log(`Fecha vinculación : ${linkedAt || '—'}`)
  console.log(`Token QR consumido: ${metadata.telegram_link_token === null || metadata.telegram_link_token === undefined ? 'sí (consumido)' : 'NO (pendiente)'}`)

  if (!chatId || !user.tenantId) {
    console.log('\n❌ El QR aún NO quedó vinculado. El chat_id no está en tu metadata.')
    console.log('   Pasos: 1) recarga el perfil, 2) escanea el QR con tu teléfono,')
    console.log('   3) pulsa INICIAR en el bot de Telegram, 4) vuelve al perfil y pulsa "Verificar".')
    process.exit(1)
  }

  // ── 2. Resolver token del bot del tenant ─────────────────────────────
  const { token, source, adminChatId } = await resolveBotToken(user.tenantId)
  console.log('───────────────────────────────────────────────────')
  console.log(`Token bot   : ${token ? '✅ resuelto (' + source + ')' : '❌ NO resuelto'}`)
  console.log(`AdminChatID : ${adminChatId || '—'}`)

  if (!token) {
    console.log('\n❌ No se encontró el token del bot para el tenant.')
    console.log('   Configúralo en Perfil → sección Telegram, o revisa el Channel/Integration del tenant.')
    process.exit(1)
  }

  // ── 3. Enviar notificación de prueba ────────────────────────────────
  const message = MESSAGE_ARG || DEFAULT_MESSAGE
  console.log('───────────────────────────────────────────────────')
  console.log('📤 Enviando notificación de prueba a Telegram...')

  const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
    }),
    signal: AbortSignal.timeout(8000),
  })
  const sendData = await sendRes.json().catch(() => ({}))
  console.log(`HTTP ${sendRes.status}: ${JSON.stringify(sendData)}`)

  if (sendData?.ok) {
    console.log('\n✅ ✅ ✅ NOTIFICACIÓN ENVIADA CORRECTAMENTE ✅ ✅ ✅')
    console.log('Revisa tu Telegram: deberías haber recibido el mensaje de prueba.')
  } else {
    console.log(`\n❌ El envío falló: ${sendData?.description || 'respuesta inesperada'}`)
    console.log('   Causas comunes:')
    console.log('   - "chat not found": el chat_id guardado no coincide con el que inició el bot.')
    console.log('   - "Forbidden: bot was blocked": bloqueaste al bot. Desbloquéalo y re-vincula.')
    console.log('   - Token inválido: revisa la configuración del bot en Perfil.')
  }
}

main()
  .catch((e: any) => {
    console.error(JSON.stringify({ status: 'error', message: e?.message ?? 'unknown', code: e?.code ?? null }, null, 2))
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
