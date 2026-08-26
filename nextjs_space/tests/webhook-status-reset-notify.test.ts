// @vitest-environment node
//
// Tests del aviso por Telegram al desarrollador cuando alguien (admin) reinicia
// las métricas del día del panel de estado del webhook (POST /api/webhook-status).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  resetRateLimitMetrics: vi.fn(),
  sendTelegramMessage: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('@/lib/auth-helpers', () => ({ isAdminRequest: mocks.isAdminRequest }))
vi.mock('@/lib/telegram/rate-limit-metrics', () => ({ resetRateLimitMetrics: mocks.resetRateLimitMetrics }))
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: mocks.sendTelegramMessage }))
vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }))
// getServerSession se usa en el GET; para el POST solo pasa por isAdminRequest,
// así que no hace falta mockear next-auth. El módulo tiene authOptions importado.

import { POST } from '@/app/api/webhook-status/route'

const ORIG_ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID

describe('POST /api/webhook-status: aviso de reinicio al desarrollador', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resetRateLimitMetrics.mockResolvedValue({ reset: true })
    mocks.sendTelegramMessage.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    if (ORIG_ADMIN_CHAT === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
    else process.env.TELEGRAM_ADMIN_CHAT_ID = ORIG_ADMIN_CHAT
  })

  it('reinicia las métricas y avisa con el nombre, email y userId del admin', async () => {
    mocks.isAdminRequest.mockResolvedValue({
      ok: true,
      email: 'bruno.hess@dimensionexpert.com',
      userId: 'u_bruno',
    })
    mocks.prisma.user.findUnique.mockResolvedValue({ name: 'Bruno Hess', tenantId: 't_1' })
    mocks.prisma.auditLog.create.mockResolvedValue({ id: 'audit1' })
    process.env.TELEGRAM_ADMIN_CHAT_ID = '646107192'

    const res = await POST(new Request('http://localhost/api/webhook-status', { method: 'POST' }))

    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)

    // Se reinició una vez
    expect(mocks.resetRateLimitMetrics).toHaveBeenCalledTimes(1)

    // Trazabilidad permanente: quedó registrado en el audit log
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledTimes(1)
    const audit = mocks.prisma.auditLog.create.mock.calls[0][0].data
    expect(audit.accion).toBe('webhook_metrics_reset')
    expect(audit.entidad).toBe('webhook-metrics')
    expect(audit.entidadId).toBe('rate-limit')
    expect(audit.userId).toBe('u_bruno')
    expect(audit.tenantId).toBe('t_1')
    expect(audit.metadata.reiniciadoPor).toBe('Bruno Hess')

    // El aviso llegó al chat del desarrollador con quién lo hizo
    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1)
    const [chatId, text] = mocks.sendTelegramMessage.mock.calls[0]
    expect(chatId).toBe('646107192')
    expect(text).toContain('Bruno Hess')
    expect(text).toContain('bruno.hess@dimensionexpert.com')
    expect(text).toContain('u_bruno')
  })

  it('cae al email en el aviso si el usuario no tiene nombre', async () => {
    mocks.isAdminRequest.mockResolvedValue({
      ok: true,
      email: 'bruno.hess@dimensionexpert.com',
      userId: 'u_bruno',
    })
    mocks.prisma.user.findUnique.mockResolvedValue({ name: null })
    mocks.prisma.auditLog.create.mockResolvedValue({ id: 'audit1' })
    process.env.TELEGRAM_ADMIN_CHAT_ID = '646107192'

    await POST(new Request('http://localhost/api/webhook-status', { method: 'POST' }))

    const [, text] = mocks.sendTelegramMessage.mock.calls[0]
    expect(text).toContain('bruno.hess@dimensionexpert.com')
    // El audit log también cae al email en el metadata
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledTimes(1)
    const audit = mocks.prisma.auditLog.create.mock.calls[0][0].data
    expect(audit.metadata.reiniciadoPor).toBe('bruno.hess@dimensionexpert.com')
  })

  it('no rompe el reset ni el envío si falla la consulta del nombre', async () => {
    mocks.isAdminRequest.mockResolvedValue({ ok: true, email: 'a@b.com', userId: 'u1' })
    mocks.prisma.user.findUnique.mockRejectedValue(new Error('db down'))
    process.env.TELEGRAM_ADMIN_CHAT_ID = '646107192'

    const res = await POST(new Request('http://localhost/api/webhook-status', { method: 'POST' }))

    expect(res.status).toBe(200)
    expect(mocks.resetRateLimitMetrics).toHaveBeenCalledTimes(1)
    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1)
  })

  it('no rompe el reset si falla la escritura del audit log', async () => {
    mocks.isAdminRequest.mockResolvedValue({ ok: true, email: 'a@b.com', userId: 'u1' })
    mocks.prisma.user.findUnique.mockResolvedValue({ name: 'Bruno Hess', tenantId: 't_1' })
    mocks.prisma.auditLog.create.mockRejectedValue(new Error('audit db down'))
    process.env.TELEGRAM_ADMIN_CHAT_ID = '646107192'

    const res = await POST(new Request('http://localhost/api/webhook-status', { method: 'POST' }))

    // El reset y el aviso siguen ocurriendo aunque el audit log falle
    expect(res.status).toBe(200)
    expect(mocks.resetRateLimitMetrics).toHaveBeenCalledTimes(1)
    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1)
  })

  it('no envía nada si no está configurado TELEGRAM_ADMIN_CHAT_ID', async () => {
    mocks.isAdminRequest.mockResolvedValue({ ok: true, email: 'a@b.com', userId: 'u1' })
    mocks.prisma.user.findUnique.mockResolvedValue({ name: 'Bruno Hess' })
    mocks.prisma.auditLog.create.mockResolvedValue({ id: 'audit1' })
    delete process.env.TELEGRAM_ADMIN_CHAT_ID

    const res = await POST(new Request('http://localhost/api/webhook-status', { method: 'POST' }))

    expect(res.status).toBe(200)
    expect(mocks.resetRateLimitMetrics).toHaveBeenCalledTimes(1)
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
    // Aunque no haya aviso por Telegram, sí queda el audit log
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('deniega el reset y no envía aviso si no es admin', async () => {
    mocks.isAdminRequest.mockResolvedValue({ ok: false, error: 'Acceso denegado: requiere rol de Superadmin o Administrador' })

    const res = await POST(new Request('http://localhost/api/webhook-status', { method: 'POST' }))

    expect(res.status).toBe(403)
    expect(mocks.resetRateLimitMetrics).not.toHaveBeenCalled()
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
  })
})