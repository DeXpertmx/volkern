/**
 * Registra el webhook de cada bot de tenant con su `secret_token`.
 *
 * Por qué: todos los bots apuntan al mismo endpoint
 * (`/api/webhooks/telegram`), así que el payload no dice qué bot lo entregó.
 * Al registrar cada webhook con un `secret_token` distinto, Telegram envía la
 * cabecera `X-Telegram-Bot-Api-Secret-Token` en cada update y el servidor sabe
 * con certeza qué tenant habló (ver `lib/telegram/webhook-secret.ts`).
 *
 * El secret se deriva del token del bot (SHA-256 determinista): re-ejecutar el
 * script no cambia nada y no hay que guardarlo en ningún sitio.
 *
 * Seguridad de la operación:
 *  - Sin `--apply` solo muestra el PLAN (no toca ningún bot).
 *  - Si el bot ya apunta a OTRA url (p. ej. un inbox de Chatwoot que gestiona su
 *    propio webhook), se OMITE: sobrescribirlo rompería ese flujo. Para
 *    forzarlo, `--force`.
 *
 * Uso:
 *   npx tsx scripts/register-telegram-webhooks.ts                        # plan de todos
 *   npx tsx scripts/register-telegram-webhooks.ts --tenant <id> --apply
 *   npx tsx scripts/register-telegram-webhooks.ts --all --apply
 *   npx tsx scripts/register-telegram-webhooks.ts --all --apply --force
 *   npx tsx scripts/register-telegram-webhooks.ts --url https://mi-host/api/webhooks/telegram
 */
import { prisma } from '../lib/db'
import { botsDeTenants, secretTokenDelBot } from '../lib/telegram/webhook-secret'

const DEFAULT_WEBHOOK_URL = 'https://volkern.app/api/webhooks/telegram'
const ALLOWED_UPDATES = ['message', 'edited_message', 'callback_query']

interface Opciones {
  aplicar: boolean
  todos: boolean
  forzar: boolean
  tenantId: string | null
  url: string
}

function leerArgumentos(argv: string[]): Opciones {
  const valorDe = (bandera: string): string | null => {
    const exacto = argv.indexOf(bandera)
    if (exacto >= 0 && argv[exacto + 1] && !argv[exacto + 1].startsWith('--')) {
      return argv[exacto + 1]
    }
    const conIgual = argv.find((a) => a.startsWith(`${bandera}=`))
    return conIgual ? conIgual.slice(bandera.length + 1) : null
  }

  return {
    aplicar: argv.includes('--apply'),
    todos: argv.includes('--all'),
    forzar: argv.includes('--force'),
    tenantId: valorDe('--tenant'),
    url: valorDe('--url') || DEFAULT_WEBHOOK_URL,
  }
}

type Estado =
  | 'registrado'
  | 'ya_apuntaba'
  | 'plan'
  | 'omitido_url_distinta'
  | 'sin_respuesta_telegram'

async function telegram(token: string, metodo: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  return (await res.json().catch(() => ({}))) as any
}

async function main() {
  const opciones = leerArgumentos(process.argv)

  if (!opciones.todos && !opciones.tenantId) {
    console.error('Indica qué registrar: --all (todos los tenants) o --tenant <id>.')
    console.error('Añade --apply para ejecutar; sin él solo se muestra el plan.')
    process.exit(1)
  }

  let bots = await botsDeTenants()
  if (opciones.tenantId) {
    bots = bots.filter((b) => b.tenantId === opciones.tenantId)
  }

  if (bots.length === 0) {
    console.error('No hay ningún tenant con bot de Telegram propio para ese filtro.')
    process.exit(1)
  }

  console.log(`Webhook destino : ${opciones.url}`)
  console.log(`Modo            : ${opciones.aplicar ? 'APLICAR' : 'PLAN (sin cambios)'}`)
  console.log(`Bots encontrados: ${bots.length}`)
  console.log('')

  const resultados: Array<{ tenantId: string; estado: Estado; detalle: string }> = []

  for (const bot of bots) {
    const info = await telegram(bot.botToken, 'getWebhookInfo')
    if (!info?.ok) {
      resultados.push({
        tenantId: bot.tenantId,
        estado: 'sin_respuesta_telegram',
        detalle: info?.description || 'getWebhookInfo falló (¿token inválido?)',
      })
      continue
    }

    const urlActual: string = info.result?.url || ''
    const pendientes: number = info.result?.pending_update_count ?? 0

    // Bot gestionado por otro flujo (inbox de Chatwoot, etc.): no se toca.
    if (urlActual && urlActual !== opciones.url && !opciones.forzar) {
      resultados.push({
        tenantId: bot.tenantId,
        estado: 'omitido_url_distinta',
        detalle: `apunta a ${urlActual} (usa --force para sobrescribir)`,
      })
      continue
    }

    if (!opciones.aplicar) {
      resultados.push({
        tenantId: bot.tenantId,
        estado: 'plan',
        detalle: urlActual
          ? `apunta a la url destino; se (re)registraría el secret · pendientes: ${pendientes}`
          : `sin webhook · se registraría con secret · pendientes: ${pendientes}`,
      })
      continue
    }

    const setRes = await telegram(bot.botToken, 'setWebhook', {
      url: opciones.url,
      secret_token: secretTokenDelBot(bot.botToken),
      allowed_updates: ALLOWED_UPDATES,
    })

    if (!setRes?.ok) {
      resultados.push({
        tenantId: bot.tenantId,
        estado: 'sin_respuesta_telegram',
        detalle: `setWebhook: ${setRes?.description || 'respuesta inesperada'}`,
      })
      continue
    }

    // Telegram tarda un momento en propagar; verificamos la url resultante.
    await new Promise((r) => setTimeout(r, 1_000))
    const despues = await telegram(bot.botToken, 'getWebhookInfo')
    const urlFinal: string = despues?.result?.url || ''

    if (urlFinal === opciones.url) {
      resultados.push({
        tenantId: bot.tenantId,
        estado: urlActual === opciones.url ? 'ya_apuntaba' : 'registrado',
        detalle: `secret configurado · pendientes: ${despues?.result?.pending_update_count ?? 0}`,
      })
    } else {
      resultados.push({
        tenantId: bot.tenantId,
        estado: 'sin_respuesta_telegram',
        detalle: `la url no quedó registrada (actual: ${urlFinal || 'vacía'})`,
      })
    }
  }

  console.log('tenant'.padEnd(30), 'estado'.padEnd(22), 'detalle')
  console.log('-'.repeat(100))
  for (const r of resultados) {
    console.log(r.tenantId.padEnd(30), r.estado.padEnd(22), r.detalle)
  }

  const fallos = resultados.filter((r) => r.estado === 'sin_respuesta_telegram')
  const omitidos = resultados.filter((r) => r.estado === 'omitido_url_distinta')

  console.log('')
  console.log(
    `Resumen: ${resultados.filter((r) => r.estado === 'registrado' || r.estado === 'ya_apuntaba').length} ok · ` +
      `${omitidos.length} omitidos · ${resultados.filter((r) => r.estado === 'plan').length} en plan · ${fallos.length} fallos`
  )

  if (!opciones.aplicar) {
    console.log('Nada se ha modificado. Repite con --apply para registrar los secrets.')
  }
  if (opciones.aplicar && fallos.length === 0) {
    console.log(
      'Los bots registrados ya envían X-Telegram-Bot-Api-Secret-Token. Con ' +
        'TELEGRAM_WEBHOOK_REQUIRE_SECRET=true el webhook rechazará updates sin esa cabecera.'
    )
  }

  if (fallos.length > 0) process.exitCode = 1
}

main()
  .catch((e: any) => {
    console.error(JSON.stringify({ status: 'error', message: e?.message ?? 'unknown' }, null, 2))
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
