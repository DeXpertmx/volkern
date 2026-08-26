// @vitest-environment node
//
// Verifica que el POST /api/integraciones notifica al desarrollador por Telegram
// cuando se CONECTAN credenciales de una integración externa (se guardan secretos),
// y que NO notifica cuando solo se actualiza el nombre (sin credenciales).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  notifyDeveloperSensitiveAction: vi.fn().mockResolvedValue(undefined),
  logAuditAction: vi.fn().mockResolvedValue(undefined),
  prisma: {
    user: { findUnique: vi.fn() },
    integration: { upsert: vi.fn() },
  },
}))

vi.mock('@/lib/telegram/developer-notify', () => ({
  notifyDeveloperSensitiveAction: mocks.notifyDeveloperSensitiveAction,
}))
vi.mock('@/lib/permissions', () => ({ logAuditAction: mocks.logAuditAction }))
vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }))
// getServerSession de next-auth no se usa porque mockeamos la ruta directamente;
// la ruta importa authOptions, así que hay que proporcionar un módulo next-auth.
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(() => ({ user: { email: 'owner@x.com' } })),
  default: () => null,
}))

import { POST } from '@/app/api/integraciones/route'

describe('POST /api/integraciones: aviso al desarrollador al conectar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u_1',
      email: 'owner@x.com',
      name: 'Owner',
      tenantId: 't_1',
    })
    mocks.prisma.integration.upsert.mockResolvedValue({ id: 'int_1' })
  })

  it('notifica al desarrollador cuando se conectan credenciales (stripe)', async () => {
    const res = await POST(
      new Request('http://localhost/api/integraciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'stripe',
          nombre: 'Stripe',
          credenciales: { secretKey: 'sk_test_xxx' },
        }),
      })
    )

    expect(res.status).toBe(200)
    expect(mocks.notifyDeveloperSensitiveAction).toHaveBeenCalledTimes(1)
    const info = mocks.notifyDeveloperSensitiveAction.mock.calls[0][0]
    expect(info.accion).toContain('stripe')
    expect(info.detalle).toContain('Stripe')
    expect(info.quien).toBe('Owner')
    expect(info.userId).toBe('u_1')
    expect(info.extra).toContain('t_1')
  })

  it('notifica cuando se actualizan credenciales de WhatsApp/Twilio', async () => {
    const res = await POST(
      new Request('http://localhost/api/integraciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'twilio',
          nombre: 'Twilio',
          credenciales: { accountSid: 'ACxxx', authToken: 'tok' },
        }),
      })
    )

    expect(res.status).toBe(200)
    expect(mocks.notifyDeveloperSensitiveAction).toHaveBeenCalledTimes(1)
  })

  it('NO notifica cuando solo se actualiza el nombre (sin credenciales)', async () => {
    const res = await POST(
      new Request('http://localhost/api/integraciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'stripe', nombre: 'Stripe Renombrado' }),
      })
    )

    expect(res.status).toBe(200)
    expect(mocks.notifyDeveloperSensitiveAction).not.toHaveBeenCalled()
  })

  it('devuelve 403 si el usuario no tiene tenant', async () => {
    const { getServerSession } = await import('next-auth')
    ;(getServerSession as any).mockResolvedValue({ user: { email: 'owner@x.com' } })
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'u_1', tenantId: null })
    const res = await POST(
      new Request('http://localhost/api/integraciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'stripe', nombre: 'Stripe' }),
      })
    )
    expect(res.status).toBe(403)
    expect(mocks.notifyDeveloperSensitiveAction).not.toHaveBeenCalled()
  })
})