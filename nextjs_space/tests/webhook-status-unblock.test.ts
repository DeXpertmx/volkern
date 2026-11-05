// @vitest-environment node
//
// DELETE /api/webhook-status?ip=…
//
// Desbloqueo manual de una IP cortada por el cortafuegos de `secret_token` del
// webhook de Telegram (panel de estado del webhook). Solo admins, y cada
// desbloqueo efectivo queda en el audit log.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  desbloquearIp: vi.fn(),
  getSecretLimitMetrics: vi.fn(),
  getRateLimitMetrics: vi.fn(),
  resetRateLimitMetrics: vi.fn(),
  sendTelegramMessage: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    lead: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
    conversation: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

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

import { DELETE } from '@/app/api/webhook-status/route'

function peticion(ip?: string) {
  const url = ip === undefined
    ? 'http://localhost/api/webhook-status'
    : `http://localhost/api/webhook-status?ip=${encodeURIComponent(ip)}`
  return new Request(url, {
    method: 'DELETE',
    headers: { 'x-forwarded-for': '10.0.0.5, 10.0.0.1', 'user-agent': 'vitest' },
  })
}

const ADMIN = { ok: true, email: 'bruno@dimensionexpert.com', userId: 'u_admin' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isAdminRequest.mockResolvedValue(ADMIN)
  mocks.prisma.user.findUnique.mockResolvedValue({ name: 'Bruno Hess', tenantId: 't_1' })
  mocks.prisma.auditLog.create.mockResolvedValue({ id: 'audit_1' })
  mocks.desbloquearIp.mockResolvedValue({ estabaBloqueada: true, fallosPrevios: 7 })
})

describe('DELETE /api/webhook-status — desbloquear IP', () => {
  it('desbloquea la IP y la registra en el audit log con quién y desde dónde', async () => {
    const res = await DELETE(peticion('203.0.113.9'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      ok: true,
      ip: '203.0.113.9',
      desbloqueada: true,
      fallosPrevios: 7,
    })

    expect(mocks.desbloquearIp).toHaveBeenCalledWith('203.0.113.9')

    expect(mocks.prisma.auditLog.create).toHaveBeenCalledTimes(1)
    const audit = mocks.prisma.auditLog.create.mock.calls[0][0].data
    expect(audit.accion).toBe('telegram_secret_ip_desbloqueada')
    expect(audit.entidad).toBe('webhook-secret-limit')
    expect(audit.entidadId).toBe('203.0.113.9')
    expect(audit.userId).toBe('u_admin')
    expect(audit.tenantId).toBe('t_1')
    expect(audit.ipAddress).toBe('10.0.0.5')
    expect(audit.userAgent).toBe('vitest')
    expect(audit.metadata).toMatchObject({
      desbloqueadaPor: 'Bruno Hess',
      email: 'bruno@dimensionexpert.com',
      action: 'unblock_telegram_secret_ip',
      estabaBloqueada: true,
      fallosDescartados: 7,
    })
  })

  it('rechaza a quien no es admin sin tocar el cortafuegos ni la auditoría', async () => {
    mocks.isAdminRequest.mockResolvedValue({ ok: false, error: 'Solo administradores' })

    const res = await DELETE(peticion('203.0.113.9'))

    expect(res.status).toBe(403)
    expect(mocks.desbloquearIp).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('devuelve 401 si la petición no está autenticada', async () => {
    mocks.isAdminRequest.mockResolvedValue({ ok: false, error: 'No autenticado' })

    const res = await DELETE(peticion('203.0.113.9'))

    expect(res.status).toBe(401)
    expect(mocks.desbloquearIp).not.toHaveBeenCalled()
  })

  it('exige el parámetro ip', async () => {
    for (const ip of [undefined, '   ']) {
      const res = await DELETE(peticion(ip))
      expect(res.status).toBe(400)
    }
    expect(mocks.desbloquearIp).not.toHaveBeenCalled()
  })

  it('rechaza un valor de IP desmesurado', async () => {
    const res = await DELETE(peticion('a'.repeat(65)))

    expect(res.status).toBe(400)
    expect(mocks.desbloquearIp).not.toHaveBeenCalled()
  })

  it('sin bloqueo ni fallos responde ok pero no ensucia la auditoría', async () => {
    mocks.desbloquearIp.mockResolvedValue({ estabaBloqueada: false, fallosPrevios: 0 })

    const res = await DELETE(peticion('192.0.2.55'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.desbloqueada).toBe(false)
    expect(body.message).toContain('no estaba bloqueada')
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('una IP con solo fallos queda auditada como reinicio de contador', async () => {
    mocks.desbloquearIp.mockResolvedValue({ estabaBloqueada: false, fallosPrevios: 2 })

    const res = await DELETE(peticion('198.51.100.7'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ desbloqueada: false, fallosPrevios: 2 })
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledTimes(1)
    expect(
      mocks.prisma.auditLog.create.mock.calls[0][0].data.metadata.estabaBloqueada
    ).toBe(false)
  })

  it('si el audit log falla, el desbloqueo sigue siendo efectivo', async () => {
    mocks.prisma.auditLog.create.mockRejectedValue(new Error('audit db down'))

    const res = await DELETE(peticion('203.0.113.9'))

    expect(res.status).toBe(200)
    expect((await res.json()).desbloqueada).toBe(true)
    expect(mocks.desbloquearIp).toHaveBeenCalledTimes(1)
  })
})
