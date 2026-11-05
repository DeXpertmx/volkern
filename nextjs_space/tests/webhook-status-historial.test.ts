// @vitest-environment node
//
// GET /api/webhook-status?historial
//
// El panel de estado del webhook muestra las últimas acciones hechas desde él
// (desbloqueos de IP y reinicios de métricas) leídas del audit log.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getRateLimitMetrics: vi.fn(),
  resetRateLimitMetrics: vi.fn(),
  getSecretLimitMetrics: vi.fn(),
  desbloquearIp: vi.fn(),
  isAdminRequest: vi.fn(),
  sendTelegramMessage: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    lead: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
    conversation: { findFirst: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn() },
  },
}))

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/lib/auth-helpers', () => ({ isAdminRequest: mocks.isAdminRequest }))
vi.mock('@/lib/telegram/rate-limit-metrics', () => ({
  getRateLimitMetrics: mocks.getRateLimitMetrics,
  resetRateLimitMetrics: mocks.resetRateLimitMetrics,
}))
vi.mock('@/lib/telegram/webhook-secret-rate-limit', () => ({
  getSecretLimitMetrics: mocks.getSecretLimitMetrics,
  desbloquearIp: mocks.desbloquearIp,
}))
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: mocks.sendTelegramMessage }))
vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }))

import { GET } from '@/app/api/webhook-status/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getServerSession.mockResolvedValue({
    user: { id: 'u_admin', roleName: 'Superadmin', email: 'bruno@dimensionexpert.com' },
  })
  mocks.getRateLimitMetrics.mockResolvedValue({
    today: { telegram: 0, evolution: 0, total: 0 },
    topChats: [],
    byDay: [],
    lastRejectedAt: null,
    lastRejectedChannel: null,
    lastRejectedChatId: null,
  })
  mocks.getSecretLimitMetrics.mockResolvedValue({
    bloqueadas: [],
    fallos: [],
    totalBloqueadas: 0,
    totalFallos: 0,
  })
  mocks.prisma.auditLog.findMany.mockResolvedValue([])
})

describe('GET /api/webhook-status — historial del audit log', () => {
  it('pide los desbloqueos y reinicios más recientes, con su límite y orden', async () => {
    await GET()

    const consulta = mocks.prisma.auditLog.findMany.mock.calls[0][0]
    expect(consulta.where).toEqual({
      accion: { in: ['telegram_secret_ip_desbloqueada', 'webhook_metrics_reset'] },
    })
    // Orden estable: la fecha sola empata entre acciones del mismo segundo.
    expect(consulta.orderBy).toEqual([{ fechaCreacion: 'desc' }, { id: 'desc' }])
    // Se pide una fila de más para saber si hay página siguiente.
    expect(consulta.take).toBe(9)
    expect(consulta.cursor).toBeUndefined()
  })

  it('devuelve las acciones con autor, fallos descartados y fecha ISO', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'a1',
        accion: 'telegram_secret_ip_desbloqueada',
        entidadId: '203.0.113.9',
        descripcion: 'Desbloqueo manual de la IP 203.0.113.9 por Bruno Hess',
        metadata: { desbloqueadaPor: 'Bruno Hess', fallosDescartados: 7 },
        fechaCreacion: new Date('2026-10-30T10:00:00.000Z'),
        user: { name: 'Bruno Hess', email: 'bruno@dimensionexpert.com' },
      },
      {
        id: 'a2',
        accion: 'webhook_metrics_reset',
        entidadId: 'rate-limit',
        descripcion: 'Reinicio de las métricas de rate-limit del día por Bruno Hess',
        metadata: { reiniciadoPor: 'Bruno Hess' },
        fechaCreacion: new Date('2026-10-29T09:30:00.000Z'),
        user: null,
      },
    ])

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.historial).toEqual([
      {
        id: 'a1',
        accion: 'telegram_secret_ip_desbloqueada',
        objetivo: '203.0.113.9',
        descripcion: 'Desbloqueo manual de la IP 203.0.113.9 por Bruno Hess',
        autor: 'Bruno Hess',
        fallosDescartados: 7,
        fecha: '2026-10-30T10:00:00.000Z',
      },
      {
        id: 'a2',
        accion: 'webhook_metrics_reset',
        objetivo: 'rate-limit',
        descripcion: 'Reinicio de las métricas de rate-limit del día por Bruno Hess',
        autor: 'Bruno Hess',
        fallosDescartados: 0,
        fecha: '2026-10-29T09:30:00.000Z',
      },
    ])
  })

  it('cae al email del usuario y luego a la metadata si no hay nombre', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'b1',
        accion: 'telegram_secret_ip_desbloqueada',
        entidadId: '198.51.100.7',
        descripcion: 'x',
        metadata: { desbloqueadaPor: 'Bruno desde metadata', fallosDescartados: 2 },
        fechaCreacion: new Date('2026-10-30T10:00:00.000Z'),
        user: { name: null, email: 'otro@dimensionexpert.com' },
      },
      {
        id: 'b2',
        accion: 'telegram_secret_ip_desbloqueada',
        entidadId: '192.0.2.9',
        descripcion: 'y',
        metadata: { desbloqueadaPor: 'Bruno desde metadata' },
        fechaCreacion: new Date('2026-10-30T09:00:00.000Z'),
        user: null,
      },
    ])

    const body = await (await GET()).json()

    expect(body.historial[0].autor).toBe('otro@dimensionexpert.com')
    expect(body.historial[1].autor).toBe('Bruno desde metadata')
    // Sin dato de fallos en la metadata no se inventa una cifra.
    expect(body.historial[1].fallosDescartados).toBe(0)
  })

  it('sin acciones devuelve una lista vacía', async () => {
    const body = await (await GET()).json()
    expect(body.historial).toEqual([])
  })

  it('si el audit log falla, el panel sigue funcionando sin historial', async () => {
    mocks.prisma.auditLog.findMany.mockRejectedValue(new Error('audit db down'))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.historial).toEqual([])
    // El resto del estado se sigue sirviendo.
    expect(body.secretLimit).toBeTruthy()
    expect(body.metrics).toBeTruthy()
  })

  it('sin sesión no consulta nada', async () => {
    mocks.getServerSession.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(mocks.prisma.auditLog.findMany).not.toHaveBeenCalled()
  })
})

describe('GET /api/webhook-status — filtros del historial', () => {
  const pedir = (qs: string) =>
    GET(new Request(`http://localhost/api/webhook-status${qs}`))

  const fila = (id: string, autor: string | null, email: string | null = null) => ({
    id,
    accion: 'telegram_secret_ip_desbloqueada',
    entidadId: `10.0.0.${id}`,
    descripcion: `desbloqueo ${id}`,
    metadata: autor ? { desbloqueadaPor: autor, fallosDescartados: 1 } : { fallosDescartados: 1 },
    fechaCreacion: new Date(`2026-10-30T10:00:0${id.slice(-1)}.000Z`),
    user: email ? { name: null, email } : null,
  })

  it('filtra por tipo de acción con el alias del panel', async () => {
    const body = await (await pedir('?accion=desbloqueo')).json()

    expect(mocks.prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      accion: { in: ['telegram_secret_ip_desbloqueada'] },
    })
    expect(body.historialFiltros).toEqual({ accion: 'telegram_secret_ip_desbloqueada', autor: null })
  })

  it('acepta también «reinicio» y el nombre crudo de la acción', async () => {
    await pedir('?accion=reinicio')
    expect(mocks.prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      accion: { in: ['webhook_metrics_reset'] },
    })

    vi.clearAllMocks()
    mocks.getServerSession.mockResolvedValue({ user: { id: 'u1', roleName: 'Superadmin' } })
    mocks.getRateLimitMetrics.mockResolvedValue({
      today: { telegram: 0, evolution: 0, total: 0 },
      topChats: [],
      byDay: [],
      lastRejectedAt: null,
      lastRejectedChannel: null,
      lastRejectedChatId: null,
    })
    mocks.getSecretLimitMetrics.mockResolvedValue({
      bloqueadas: [], fallos: [], totalBloqueadas: 0, totalFallos: 0,
    })
    mocks.prisma.auditLog.findMany.mockResolvedValue([])

    await pedir('?accion=webhook_metrics_reset')
    expect(mocks.prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      accion: { in: ['webhook_metrics_reset'] },
    })
  })

  it('un tipo de acción desconocido se ignora en vez de romper la respuesta', async () => {
    const res = await pedir('?accion=inventada')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      accion: { in: ['telegram_secret_ip_desbloqueada', 'webhook_metrics_reset'] },
    })
    expect(body.historialFiltros.accion).toBeNull()
  })

  it('con autor pagina igual: devuelve 8 y marca que hay más', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => fila(`a${i}`, 'Bruno Hess'))
    )

    const body = await (await pedir('?autor=Bruno')).json()

    expect(body.historial).toHaveLength(8)
    expect(body.historialHayMas).toBe(true)
    // El cursor es el id de la última devuelta, no la fila de más.
    expect(body.historialCursor).toBe(body.historial[7].id)
    expect(body.historialFiltros).toEqual({ accion: null, autor: 'Bruno' })
  })

  it('el autor casa sin mayúsculas ni acentos, por nombre, email o metadata', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([
      fila('a1', 'José Pérez'),
      fila('a2', null, 'bruno@dimensionexpert.com'),
      fila('a3', 'Marta Ruiz'),
    ])

    const jose = await (await pedir('?autor=jose perez')).json()
    expect(jose.historial.map((h: { id: string }) => h.id)).toEqual(['a1'])

    vi.clearAllMocks()
    mocks.getServerSession.mockResolvedValue({ user: { id: 'u1', roleName: 'Superadmin' } })
    mocks.getRateLimitMetrics.mockResolvedValue({
      today: { telegram: 0, evolution: 0, total: 0 },
      topChats: [], byDay: [], lastRejectedAt: null, lastRejectedChannel: null,
      lastRejectedChatId: null,
    })
    mocks.getSecretLimitMetrics.mockResolvedValue({
      bloqueadas: [], fallos: [], totalBloqueadas: 0, totalFallos: 0,
    })
    mocks.prisma.auditLog.findMany.mockResolvedValue([
      fila('a1', 'José Pérez'),
      fila('a2', null, 'bruno@dimensionexpert.com'),
      fila('a3', 'Marta Ruiz'),
    ])

    const bruno = await (await pedir('?autor=BRUNO@')).json()
    expect(bruno.historial.map((h: { id: string }) => h.id)).toEqual(['a2'])
  })

  it('si ningún autor casa, el historial va vacío y el filtro se refleja', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([fila('a1', 'Marta Ruiz')])

    const body = await (await pedir('?autor=nadie')).json()

    expect(body.historial).toEqual([])
    expect(body.historialFiltros).toEqual({ accion: null, autor: 'nadie' })
  })

  it('combina tipo de acción y autor, y acota el texto del autor', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([])

    const body = await (await pedir(`?accion=reinicio&autor=${'x'.repeat(200)}`)).json()

    expect(mocks.prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      accion: { in: ['webhook_metrics_reset'] },
    })
    expect(body.historialFiltros.accion).toBe('webhook_metrics_reset')
    expect(body.historialFiltros.autor).toHaveLength(64)
  })

  it('sin filtros pide solo la página más la fila de control', async () => {
    await GET(new Request('http://localhost/api/webhook-status'))
    expect(mocks.prisma.auditLog.findMany.mock.calls[0][0].take).toBe(9)
  })
})

describe('GET /api/webhook-status — paginación por cursor', () => {
  const pedir = (qs: string) =>
    GET(new Request(`http://localhost/api/webhook-status${qs}`))

  const filas = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `ck${i}`,
      accion: 'telegram_secret_ip_desbloqueada',
      entidadId: `10.0.0.${i}`,
      descripcion: `d${i}`,
      metadata: { desbloqueadaPor: 'Bruno Hess', fallosDescartados: 1 },
      fechaCreacion: new Date(`2026-10-30T10:00:${String(59 - i).padStart(2, '0')}.000Z`),
      user: null,
    }))

  it('una página incompleta cierra la paginación', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue(filas(3))

    const body = await (await pedir('')).json()

    expect(body.historial).toHaveLength(3)
    expect(body.historialHayMas).toBe(false)
    expect(body.historialCursor).toBeNull()
  })

  it('con más filas devuelve cursor y solo 8 acciones', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue(filas(9))

    const body = await (await pedir('')).json()

    expect(body.historial).toHaveLength(8)
    expect(body.historialHayMas).toBe(true)
    expect(body.historialCursor).toBe('ck7')
  })

  it('envía el cursor a Prisma con skip 1 para no repetir la última fila', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue(filas(3))

    await pedir('?cursor=ck7')

    const consulta = mocks.prisma.auditLog.findMany.mock.calls[0][0]
    expect(consulta.cursor).toEqual({ id: 'ck7' })
    expect(consulta.skip).toBe(1)
  })

  it('un cursor con forma inválida se ignora y devuelve la primera página', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue(filas(1))

    await pedir(`?cursor=${encodeURIComponent('../../etc/passwd')}`)

    expect(mocks.prisma.auditLog.findMany.mock.calls[0][0].cursor).toBeUndefined()
  })

  it('acepta un límite de página y lo acota al máximo', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue(filas(2))

    await pedir('?limite=5')
    expect(mocks.prisma.auditLog.findMany.mock.calls[0][0].take).toBe(6)

    vi.clearAllMocks()
    mocks.getServerSession.mockResolvedValue({ user: { id: 'u1', roleName: 'Superadmin' } })
    mocks.getRateLimitMetrics.mockResolvedValue({
      today: { telegram: 0, evolution: 0, total: 0 },
      topChats: [], byDay: [], lastRejectedAt: null, lastRejectedChannel: null,
      lastRejectedChatId: null,
    })
    mocks.getSecretLimitMetrics.mockResolvedValue({
      bloqueadas: [], fallos: [], totalBloqueadas: 0, totalFallos: 0,
    })
    mocks.prisma.auditLog.findMany.mockResolvedValue([])

    await pedir('?limite=999')
    expect(mocks.prisma.auditLog.findMany.mock.calls[0][0].take).toBe(51)
  })

  it('un límite no numérico vuelve al tamaño por defecto', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([])

    await pedir('?limite=abc')
    expect(mocks.prisma.auditLog.findMany.mock.calls[0][0].take).toBe(9)
  })
})

describe('GET /api/webhook-status — sin sesión pese al filtro', () => {
  it('no consulta el historial aunque llegue un filtro válido', async () => {
    mocks.getServerSession.mockResolvedValue(null)

    const res = await GET(new Request('http://localhost/api/webhook-status?accion=desbloqueo'))

    expect(res.status).toBe(401)
    expect(mocks.prisma.auditLog.findMany).not.toHaveBeenCalled()
  })
})
