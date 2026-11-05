import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRateLimitMetrics, resetRateLimitMetrics } from '@/lib/telegram/rate-limit-metrics'
import { desbloquearIp, getSecretLimitMetrics } from '@/lib/telegram/webhook-secret-rate-limit'
import { resolveChatIdentities } from '@/lib/telegram/chat-resolver'
import { isAdminRequest } from '@/lib/auth-helpers'
import { prisma } from '@/lib/db'
import { sendTelegramMessage } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

/**
 * GET /api/webhook-status
 *
 * Métricas de rate-limit de los webhooks (Telegram + Evolution/WhatsApp):
 * cuántos mensajes se rechazan con 429 por chat y por día. Cada chatId de los
 * top chats se resuelve al contacto/lead/usuario real en BD para mostrarlo con
 * nombre en el panel.
 *
 * Incluye además `secretLimit`: el estado del cortafuegos por IP del
 * `secret_token` de Telegram (IPs bloqueadas, con lo que les queda, e IPs con
 * fallos aún sin bloqueo), para ver desde el panel quién está siendo cortado
 * antes de llegar a la base.
 *
 * E incluye `historial`: las últimas acciones hechas desde este panel
 * (desbloqueos de IP e reinicios de métricas) leídas del audit log, para que la
 * traza no se quede solo en la base de datos.
 *
 * Filtros opcionales del historial (query):
 *   - `accion=desbloqueo|reinicio` (o el nombre crudo de la acción)
 *   - `autor=<texto>`: coincidencia parcial, sin mayúsculas ni acentos, sobre
 *     nombre/email del usuario o el autor anotado en la metadata.
 *   - `cursor=<id>` y `limite=<n>`: paginación por cursor del historial.
 *
 * El filtro se aplica en el servidor: filtrar en el cliente la página ya
 * recortada no encontraría casi nada. La respuesta lleva `historialCursor`
 * (`null` en la última página) para pedir la siguiente.
 */
export async function GET(request?: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const filtros = leerFiltrosHistorial(request)

    const metrics = await getRateLimitMetrics()
    const topChats = await resolveTopChats(metrics.topChats)
    const lastRejected = await resolveLastRejected(
      metrics.lastRejectedChatId,
      metrics.lastRejectedChannel,
      metrics.lastRejectedAt
    )
    const secretLimit = await getSecretLimitMetrics()
    const paginaHistorial = await getHistorialAcciones(filtros)
    const roleName = (session.user as any)?.roleName as string | undefined
    const isAdmin = roleName === 'Superadmin'

    return NextResponse.json({
      metrics: { ...metrics, topChats, lastRejected },
      secretLimit,
      historial: paginaHistorial.acciones,
      // Cursor de la página siguiente (`null` = no hay más) y si la hay.
      historialCursor: paginaHistorial.cursorSiguiente,
      historialHayMas: paginaHistorial.hayMas,
      // Filtros realmente aplicados (lo que no se reconoce se ignora).
      historialFiltros: { accion: filtros.accion, autor: filtros.autor },
      isAdmin,
      processUptime: Math.round(process.uptime()),
      processPid: process.pid,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/webhook-status/reset
 *
 * Reinicia las métricas de rate-limit del día actual. Solo superadmins y
 * administradores (rota la métrica de "quién reinició" para auditoría).
 * Tras reiniciar, se avisa al desarrollador por Telegram (bot del sistema)
 * indicando quién lo hizo.
 */
export async function POST(request: Request) {
  try {
    const auth = await isAdminRequest(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.error?.includes('autentic') ? 401 : 403 })
    }

    // Metadata de origen del request (para la auditoría)
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const userAgent = request.headers.get('user-agent') || null

    // Capturar las métricas ANTES de reiniciar, para reflejar en el aviso qué
    // se estaba borrando (totales por canal y último rechazo).
    let before = null
    try {
      before = await getRateLimitMetrics()
    } catch (e) {
      console.warn('[WebhookStatus] No se pudieron leer métricas previas:', (e as Error).message)
    }
    const lastBefore = before
      ? await resolveLastRejected(before.lastRejectedChatId, before.lastRejectedChannel, before.lastRejectedAt)
      : { chatId: null, name: null, channel: null as 'telegram' | 'evolution' | null, at: null }

    await resetRateLimitMetrics()

    // Nombre y tenant del usuario que reinició (para el aviso y la auditoría)
    let resetByName: string | null = null
    let resetTenantId: string | null = null
    if (auth.userId) {
      try {
        const resetBy = await prisma.user.findUnique({
          where: { id: auth.userId },
          select: { name: true, tenantId: true },
        })
        resetByName = resetBy?.name ?? null
        resetTenantId = resetBy?.tenantId ?? null
      } catch {
        // no romper el reset por un fallo de nombre
      }
    }

    const msg = `Métricas reiniciadas por ${resetByName || auth.email || auth.userId} (${auth.userId})`
    console.log(`[WebhookStatus] ${msg}`)

    // Trazabilidad permanente: registrar el reinicio en el audit log (no rompe
    // el flujo si falla la escritura, igual que el resto de la instrumentación).
    try {
      await prisma.auditLog.create({
        data: {
          userId: auth.userId ?? undefined,
          tenantId: resetTenantId ?? undefined,
          accion: 'webhook_metrics_reset',
          entidad: 'webhook-metrics',
          entidadId: 'rate-limit',
          descripcion: `Reinicio de las métricas de rate-limit del día por ${resetByName || auth.email || auth.userId}`,
          metadata: {
            reiniciadoPor: resetByName || auth.email || auth.userId,
            email: auth.email || null,
            action: 'reset_rate_limit_metrics',
            origen: ipAddress || null,
            // Snapshot de lo que se borró (totales del día y último rechazo)
            borrados: {
              telegram: before?.today.telegram ?? 0,
              evolution: before?.today.evolution ?? 0,
              total: before?.today.total ?? 0,
              ultimoRechazo: lastBefore.at
                ? {
                    chatId: lastBefore.chatId,
                    nombre: lastBefore.name,
                    canal: lastBefore.channel,
                    fecha: lastBefore.at,
                  }
                : null,
            },
          },
          ipAddress,
          userAgent,
        },
      })
    } catch (error) {
      console.error('[WebhookStatus] Error registrando el reinicio en audit log:', error)
    }

    // Aviso al desarrollador por el bot del sistema (volkerncrm_bot)
    try {
      const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID
      if (adminChat) {
        const borrados = before
          ? `${before.today.telegram} Telegram · ${before.today.evolution} WhatsApp · ${before.today.total} total`
          : 'no disponibles'
        const ultimoRechazo = lastBefore?.at
          ? `${lastBefore.name || `ID ${lastBefore.chatId}`} (${lastBefore.channel || '?'})`
          : 'ninguno'
        const text = [
          '🔄 Reinicio de métricas del webhook',
          '',
          `Quién: ${resetByName || auth.email || auth.userId}`,
          `Email: ${auth.email || '—'}`,
          `UserId: ${auth.userId}`,
          `Fecha: ${new Date().toISOString()}`,
          '',
          `Borrados: ${borrados}`,
          `Último rechazo: ${ultimoRechazo}`,
          '',
          'Se reiniciaron los contadores 429 del día (por chat, totales y último rechazo).',
        ].join('\n')
        const res = await sendTelegramMessage(adminChat, text)
        if (!res.success) {
          console.error('[WebhookStatus] Error enviando aviso de reinicio:', res.error)
        }
      } else {
        console.warn('[WebhookStatus] TELEGRAM_ADMIN_CHAT_ID no configurado; no se envió el aviso de reinicio.')
      }
    } catch (error) {
      console.error('[WebhookStatus] Error enviando aviso de reinicio al desarrollador:', error)
    }

    return NextResponse.json({
      ok: true,
      message: 'Métricas del día reiniciadas',
      // Snapshot de lo borrado, por si el cliente del panel quiere mostrarlo
      borrados: before
        ? {
            telegram: before.today.telegram,
            evolution: before.today.evolution,
            total: before.today.total,
            ultimoRechazo: lastBefore?.at ? lastBefore : null,
          }
        : null,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/webhook-status?ip=<ip>
 *
 * Desbloquea a mano una IP marcada por el cortafuegos de `secret_token` del
 * webhook de Telegram, para poder deshacer un bloqueo legítimo (un proxy mal
 * configurado, un tenant que cambió el secret) sin esperar los 10 minutos.
 *
 * Borra la marca de bloqueo **y** el contador de fallos de la ventana: si solo
 * se quitara el bloqueo, el siguiente intento con secret inválido de esa misma
 * IP la volvería a bloquear al instante.
 *
 * Solo superadmins y administradores. Cada desbloqueo efectivo queda en el
 * audit log con quién lo hizo, desde dónde y cuántos fallos se descartaron.
 */
export async function DELETE(request: Request) {
  try {
    const auth = await isAdminRequest(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.error?.includes('autentic') ? 401 : 403 })
    }

    const ip = (new URL(request.url).searchParams.get('ip') || '').trim()
    if (!ip) {
      return NextResponse.json({ error: 'Falta el parámetro ip' }, { status: 400 })
    }
    if (ip.length > 64) {
      return NextResponse.json({ error: 'IP inválida' }, { status: 400 })
    }

    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const userAgent = request.headers.get('user-agent') || null

    const resultado = await desbloquearIp(ip)

    // Nada que borrar: ni bloqueo ni fallos. No se ensucia la auditoría con un
    // no-op, pero se responde igual de bien para que el panel refresque.
    if (!resultado.estabaBloqueada && resultado.fallosPrevios === 0) {
      return NextResponse.json({
        ok: true,
        ip,
        desbloqueada: false,
        fallosPrevios: 0,
        message: `La IP ${ip} no estaba bloqueada`,
      })
    }

    let nombreUsuario: string | null = null
    let tenantId: string | null = null
    if (auth.userId) {
      try {
        const autor = await prisma.user.findUnique({
          where: { id: auth.userId },
          select: { name: true, tenantId: true },
        })
        nombreUsuario = autor?.name ?? null
        tenantId = autor?.tenantId ?? null
      } catch {
        // no romper el desbloqueo por un fallo del nombre
      }
    }
    const quien = nombreUsuario || auth.email || auth.userId

    console.log(`[WebhookStatus] IP ${ip} desbloqueada por ${quien} (${auth.userId})`)

    try {
      await prisma.auditLog.create({
        data: {
          userId: auth.userId ?? undefined,
          tenantId: tenantId ?? undefined,
          accion: 'telegram_secret_ip_desbloqueada',
          entidad: 'webhook-secret-limit',
          entidadId: ip,
          descripcion: `Desbloqueo manual de la IP ${ip} por ${quien}`,
          metadata: {
            desbloqueadaPor: quien,
            email: auth.email || null,
            action: 'unblock_telegram_secret_ip',
            origen: ipAddress || null,
            estabaBloqueada: resultado.estabaBloqueada,
            fallosDescartados: resultado.fallosPrevios,
          },
          ipAddress,
          userAgent,
        },
      })
    } catch (error) {
      console.error('[WebhookStatus] Error registrando el desbloqueo en audit log:', error)
    }

    return NextResponse.json({
      ok: true,
      ip,
      desbloqueada: resultado.estabaBloqueada,
      fallosPrevios: resultado.fallosPrevios,
      message: resultado.estabaBloqueada
        ? `IP ${ip} desbloqueada`
        : `Fallos de la IP ${ip} reiniciados`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/** Acciones del panel que quedan en el audit log y se muestran en él. */
const ACCIONES_DEL_PANEL = ['telegram_secret_ip_desbloqueada', 'webhook_metrics_reset'] as const

/** Tamaño de página por defecto del historial. */
const HISTORIAL_LIMITE = 8

/** Tope de página que acepta el cliente (`?limite=`). */
const HISTORIAL_LIMITE_MAX = 50

/** Filas que como mucho se escanean en una petición cuando hay filtro por autor. */
const HISTORIAL_VENTANA_AUTOR = 100

/** Filas por consulta en el recorrido con filtro por autor. */
const HISTORIAL_BLOQUE = 20

/** Alias cortos que usa el panel para el tipo de acción. */
const ALIAS_ACCION: Record<string, (typeof ACCIONES_DEL_PANEL)[number]> = {
  desbloqueo: 'telegram_secret_ip_desbloqueada',
  desbloqueos: 'telegram_secret_ip_desbloqueada',
  reinicio: 'webhook_metrics_reset',
  reinicios: 'webhook_metrics_reset',
}

interface FiltrosHistorial {
  accion: (typeof ACCIONES_DEL_PANEL)[number] | null
  autor: string | null
  /** Cursor de paginación: id de la última acción devuelta. */
  cursor: string | null
  /** Tamaño de página (1..HISTORIAL_LIMITE_MAX), ya saneado. */
  limite: number
}

/** Normaliza para comparar sin mayúsculas ni acentos. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Lee y sanea los filtros del historial. Lo que no se reconoce se ignora en
 * vez de devolver error: el panel solo manda valores válidos y un filtro raro no
 * debe romper el estado del webhook. El resultado se devuelve al cliente para
 * que sepa qué se aplicó de verdad.
 */
function leerFiltrosHistorial(request?: Request): FiltrosHistorial {
  const vacio: FiltrosHistorial = {
    accion: null,
    autor: null,
    cursor: null,
    limite: HISTORIAL_LIMITE,
  }
  if (!request) return vacio

  let params: URLSearchParams
  try {
    params = new URL(request.url).searchParams
  } catch {
    return vacio
  }

  const accionCruda = (params.get('accion') || '').trim().toLowerCase()
  let accion: FiltrosHistorial['accion'] = ALIAS_ACCION[accionCruda] ?? null
  if (!accion && (ACCIONES_DEL_PANEL as readonly string[]).includes(accionCruda)) {
    accion = accionCruda as FiltrosHistorial['accion']
  }

  const autorCrudo = (params.get('autor') || '').trim().slice(0, 64)

  // El cursor es un id de auditLog: se acepta solo con forma de id. Un valor
  // raro se ignora y se devuelve la primera página.
  const cursorCrudo = (params.get('cursor') || '').trim()
  const cursor = /^[A-Za-z0-9_-]{1,64}$/.test(cursorCrudo) ? cursorCrudo : null

  const limiteCrudo = Number((params.get('limite') || '').trim())
  const limite =
    Number.isFinite(limiteCrudo) && limiteCrudo > 0
      ? Math.min(Math.floor(limiteCrudo), HISTORIAL_LIMITE_MAX)
      : HISTORIAL_LIMITE

  return { accion, autor: autorCrudo || null, cursor, limite }
}

interface AccionReciente {
  id: string
  accion: 'telegram_secret_ip_desbloqueada' | 'webhook_metrics_reset'
  /** IP desbloqueada (desbloqueos) o 'rate-limit' (reinicios). */
  objetivo: string
  descripcion: string
  /** Nombre del autor, con caída al email o a lo anotado en la metadata. */
  autor: string | null
  /** Fallos descartados al desbloquear (0 en los reinicios). */
  fallosDescartados: number
  fecha: string
}

interface PaginaHistorial {
  acciones: AccionReciente[]
  /** Cursor para la página siguiente; `null` si no hay más. */
  cursorSiguiente: string | null
  hayMas: boolean
}

const HISTORIAL_SELECT = {
  id: true,
  accion: true,
  entidadId: true,
  descripcion: true,
  metadata: true,
  fechaCreacion: true,
  user: { select: { name: true, email: true } },
} as const

function mapearAccion(
  fila: {
    id: string
    accion: string
    entidadId: string
    descripcion: string
    metadata: unknown
    fechaCreacion: Date
    user: { name: string | null; email: string | null } | null
  }
): AccionReciente & { _textoAutor: string } {
  const meta = (fila.metadata ?? {}) as Record<string, unknown>
  const desbloqueadaPor = typeof meta.desbloqueadaPor === 'string' ? meta.desbloqueadaPor : null
  const reiniciadoPor = typeof meta.reiniciadoPor === 'string' ? meta.reiniciadoPor : null
  const fallos = Number(meta.fallosDescartados)
  return {
    id: fila.id,
    accion: fila.accion as AccionReciente['accion'],
    objetivo: fila.entidadId,
    descripcion: fila.descripcion,
    autor: fila.user?.name || fila.user?.email || desbloqueadaPor || reiniciadoPor || null,
    fallosDescartados: Number.isFinite(fallos) ? fallos : 0,
    fecha: fila.fechaCreacion.toISOString(),
    // Solo para el filtro por autor: también busca por el email del usuario.
    _textoAutor: [fila.user?.name, fila.user?.email, desbloqueadaPor, reiniciadoPor]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' '),
  }
}

/**
 * Una página de desbloqueos y reinicios del audit log, con cursor.
 *
 * Orden `fechaCreacion desc, id desc` y cursor por `id` (único): así dos acciones
 * con la misma marca de tiempo no se pierden ni se repiten entre páginas.
 *
 * Se pide una fila de más (`limite + 1`) para saber si quedan más sin contar
 * nada; la extra se descarta y el cursor es el id de la **última devuelta**, de
 * modo que es ella la que arranca la página siguiente.
 *
 * Con filtro por autor la búsqueda es en memoria sobre una ventana acotada
 * (`HISTORIAL_VENTANA_AUTOR` filas): si la ventana se agota antes de llenar la
 * página, se devuelve lo encontrado y el cursor apunta a la última fila leída.
 *
 * Deliberadamente tolerante: si la consulta falla, el panel sigue mostrando el
 * estado del webhook sin historial en vez de romperse entero.
 */
async function getHistorialAcciones(
  filtros: FiltrosHistorial = {
    accion: null,
    autor: null,
    cursor: null,
    limite: HISTORIAL_LIMITE,
  }
): Promise<PaginaHistorial> {
  try {
    const acciones = filtros.accion ? [filtros.accion] : [...ACCIONES_DEL_PANEL]
    const buscado = filtros.autor ? normalizar(filtros.autor) : null
    const tamano = Math.max(1, filtros.limite)
    // Sin filtro por autor basta un tiro de `tamano + 1`; con filtro se recorre
    // por bloques hasta tener la página o agotar la ventana de escaneo.
    const maxEscaneo = buscado ? HISTORIAL_VENTANA_AUTOR : tamano + 1

    const acumuladas: (AccionReciente & { _textoAutor: string })[] = []
    let cursorConsulta: string | null = filtros.cursor
    let escaneadas = 0
    let agotado = false
    let ultimoExaminado: string | null = null

    // Sin filtro por autor no hace falta trocear: una sola consulta trae la
    // página y la fila de control. Con filtro se lee por bloques porque la
    // criba es en memoria y la página puede necesitar más filas.
    const bloque = buscado ? HISTORIAL_BLOQUE : tamano + 1

    while (!agotado && escaneadas < maxEscaneo) {
      const pedir = Math.min(
        bloque,
        maxEscaneo - escaneadas,
        tamano + 1 - acumuladas.length
      )
      if (pedir <= 0) break

      const filas = await prisma.auditLog.findMany({
        where: { accion: { in: acciones } },
        orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
        take: pedir,
        ...(cursorConsulta ? { cursor: { id: cursorConsulta }, skip: 1 } : {}),
        select: HISTORIAL_SELECT,
      })

      if (filas.length === 0) {
        agotado = true
        break
      }

      for (const fila of filas) {
        escaneadas += 1
        ultimoExaminado = fila.id
        const mapeada = mapearAccion(fila)
        if (!buscado || normalizar(mapeada._textoAutor).includes(buscado)) {
          acumuladas.push(mapeada)
          // Con la fila de control ya sabemos que hay página siguiente; lo que
          // venga después no se examina para que el cursor no se la salte.
          if (acumuladas.length > tamano) break
        }
      }

      cursorConsulta = filas[filas.length - 1].id
      if (filas.length < pedir) agotado = true
    }

    // La fila de más solo servía para saber que hay página siguiente.
    const desbordo = acumuladas.length > tamano
    if (desbordo) acumuladas.pop()

    const hayMas = desbordo || !agotado
    const cursorSiguiente = !hayMas
      ? null
      : desbordo
        ? acumuladas[acumuladas.length - 1].id
        : ultimoExaminado

    return {
      acciones: acumuladas.map(({ _textoAutor, ...accion }) => accion),
      cursorSiguiente,
      hayMas,
    }
  } catch (error) {
    console.warn(
      '[WebhookStatus] No se pudo leer el historial del panel:',
      (error as Error).message
    )
    return { acciones: [], cursorSiguiente: null, hayMas: false }
  }
}

function channelForChatId(chatId: string): 'telegram' | 'evolution' {
  // Canal aproximado: ids largos que empiezan en 52 (código país México) = WhatsApp,
  // el resto (chat id numérico de Telegram) = Telegram.
  const isWhatsApp = /^\d{10,}$/.test(chatId) && chatId.startsWith('52')
  return isWhatsApp ? 'evolution' : 'telegram'
}

async function resolveTopChats(topChats: { chatId: string; count: number }[]): Promise<{ chatId: string; count: number; name: string }[]> {
  const topById = new Map<string, string>()
  for (const chat of topChats) {
    const channel = channelForChatId(chat.chatId)
    const identities = await resolveChatIdentities(channel, [chat.chatId])
    const name = identities.get(chat.chatId)?.name ?? chat.chatId
    topById.set(chat.chatId, name)
  }
  return topChats.map((chat) => ({
    ...chat,
    name: topById.get(chat.chatId) ?? chat.chatId,
  }))
}

/**
 * Envuelve el último rechazo con el chatId y su nombre resuelto, para que el
 * panel muestre quién fue (Bruno Hess, un lead, un contacto) y no solo la hora.
 */
async function resolveLastRejected(
  chatId: string | null,
  channel: 'telegram' | 'evolution' | null,
  at: string | null
): Promise<{ chatId: string | null; name: string | null; channel: 'telegram' | 'evolution' | null; at: string | null }> {
  if (!chatId) {
    return { chatId: null, name: null, channel, at }
  }
  const identities = await resolveChatIdentities(channel ?? channelForChatId(chatId), [chatId])
  return {
    chatId,
    name: identities.get(chatId)?.name ?? null,
    channel,
    at,
  }
}
