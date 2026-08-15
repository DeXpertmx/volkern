import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hashAcceptanceSecret,
  maskEmail,
  maskPhone,
} from '@/lib/cotizaciones/acceptance-verification'

const { prismaMock, sendEmailMock, sendWhatsAppMessageMock } = vi.hoisted(() => ({
  prismaMock: {
    cotizacion: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    cotizacionAcceptanceChallenge: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    deal: { update: vi.fn() },
    dealActivity: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  sendEmailMock: vi.fn(),
  sendWhatsAppMessageMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/api-key-auth', () => ({
  withPublicTenant: (handler: any) => async (request: Request) => handler(request, 'tenant-1', { id: 'cot-1' }),
}))
vi.mock('@/lib/ses-email', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: sendWhatsAppMessageMock }))
vi.mock('next/headers', () => ({ headers: () => ({ get: () => '203.0.113.10' }) }))

import { GET, POST } from '@/app/api/cotizaciones/public/[id]/verification/route'
import { POST as VERIFY } from '@/app/api/cotizaciones/public/[id]/verification/verify/route'
import { POST as DIRECT_ACCEPT } from '@/app/api/cotizaciones/public/[id]/accept/route'
import { prisma } from '@/lib/db'

const quote = {
  id: 'cot-1',
  tenantId: 'tenant-1',
  numero: 'COT-2026-0001',
  estado: 'borrador',
  fechaVencimiento: new Date(Date.now() + 60_000),
  clienteEmail: 'cliente@empresa.com',
  clienteTelefono: '+34600111222',
  lead: null,
  contacts: null,
  dealId: null,
  deal: null,
}

function request(url: string, body?: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

describe('verificación de aceptación pública de cotizaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.cotizacion.findUnique.mockResolvedValue(quote)
    prisma.cotizacionAcceptanceChallenge.findFirst.mockResolvedValue(null)
    prisma.cotizacionAcceptanceChallenge.create.mockImplementation(async ({ data }: any) => ({
      id: 'challenge-1',
      ...data,
    }))
    prisma.cotizacionAcceptanceChallenge.update.mockResolvedValue({})
    prisma.cotizacionAcceptanceChallenge.delete.mockResolvedValue({})
    sendEmailMock.mockResolvedValue({ success: true })
    sendWhatsAppMessageMock.mockResolvedValue({ success: true })
  })

  it('enmascara los destinos y no expone el email o teléfono completo', async () => {
    expect(maskEmail('cliente@empresa.com')).toBe('cl*****@empresa.com')
    expect(maskPhone('+34600111222')).toBe('********1222')

    const response = await GET(request('https://volkern.app/api/cotizaciones/public/cot-1/verification?tenantId=tenant-1', undefined, 'GET'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.channels).toEqual([
      { channel: 'email', destinationMasked: 'cl*****@empresa.com' },
      { channel: 'whatsapp', destinationMasked: '********1222' },
    ])
  })

  it('crea un desafío y envía el código por el canal elegido', async () => {
    const response = await POST(request('https://volkern.app/api/cotizaciones/public/cot-1/verification', {
      tenantId: 'tenant-1',
      channel: 'email',
    }))
    const json = await response.json()
    const created = prisma.cotizacionAcceptanceChallenge.create.mock.calls[0][0].data

    expect(response.status).toBe(200)
    expect(json.challengeId).toBe('challenge-1')
    expect(json.challengeToken).toHaveLength(64)
    expect(created.codeHash).not.toBe('123456')
    expect(created.challengeTokenHash).not.toBe(json.challengeToken)
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'cliente@empresa.com',
      tenantId: 'tenant-1',
    }))
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled()
  })

  it('aplica cooldown al reenvío del mismo canal', async () => {
    prisma.cotizacionAcceptanceChallenge.findFirst.mockResolvedValue({ id: 'recent' })

    const response = await POST(request('https://volkern.app/api/cotizaciones/public/cot-1/verification', {
      tenantId: 'tenant-1',
      channel: 'email',
    }))

    expect(response.status).toBe(429)
    expect(prisma.cotizacionAcceptanceChallenge.create).not.toHaveBeenCalled()
  })

  it('bloquea la aceptación directa sin código', async () => {
    const response = await DIRECT_ACCEPT(request('https://volkern.app/api/cotizaciones/public/cot-1/accept', {
      tenantId: 'tenant-1',
    }))

    expect(response.status).toBe(428)
    expect((await response.json()).verificationRequired).toBe(true)
  })

  it('verifica el código una sola vez y acepta la cotización', async () => {
    prisma.cotizacionAcceptanceChallenge.findUnique.mockResolvedValue({
      id: 'challenge-1',
      cotizacionId: 'cot-1',
      tenantId: 'tenant-1',
      codeHash: hashAcceptanceSecret('123456'),
      challengeTokenHash: hashAcceptanceSecret('challenge-token'),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: null,
    })
    prisma.cotizacion.update.mockResolvedValue({ ...quote, estado: 'aceptada' })

    const response = await VERIFY(request('https://volkern.app/api/cotizaciones/public/cot-1/verification/verify', {
      tenantId: 'tenant-1',
      challengeId: 'challenge-1',
      challengeToken: 'challenge-token',
      code: '123456',
    }))

    expect(response.status).toBe(200)
    expect((await response.json()).success).toBe(true)
    expect(prisma.cotizacion.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ estado: 'aceptada', firmadoPorCliente: true }),
    }))
    expect(prisma.cotizacionAcceptanceChallenge.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { verifiedAt: expect.any(Date) },
    }))
  })

  it('rechaza códigos incorrectos y aumenta los intentos', async () => {
    prisma.cotizacionAcceptanceChallenge.findUnique.mockResolvedValue({
      id: 'challenge-1',
      cotizacionId: 'cot-1',
      tenantId: 'tenant-1',
      codeHash: hashAcceptanceSecret('123456'),
      challengeTokenHash: hashAcceptanceSecret('challenge-token'),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: null,
    })

    const response = await VERIFY(request('https://volkern.app/api/cotizaciones/public/cot-1/verification/verify', {
      tenantId: 'tenant-1',
      challengeId: 'challenge-1',
      challengeToken: 'challenge-token',
      code: '654321',
    }))

    expect(response.status).toBe(400)
    expect(prisma.cotizacionAcceptanceChallenge.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { attempts: { increment: 1 } },
    }))
    expect(prisma.cotizacion.update).not.toHaveBeenCalled()
  })
})
