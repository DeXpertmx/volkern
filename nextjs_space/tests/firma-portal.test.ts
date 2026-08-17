import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashAcceptanceSecret } from '@/lib/cotizaciones/acceptance-verification'

const { prismaMock, sendEmailMock, sendWhatsAppMock } = vi.hoisted(() => ({
  prismaMock: {
    contrato: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    contratoFirmaChallenge: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(async () => ({})),
    },
    signatureRequest: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    contratoTimeline: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    pipelineStage: { findFirst: vi.fn() },
    deal: { update: vi.fn() },
    dealActivity: { create: vi.fn() },
    user: { findMany: vi.fn() },
    inAppNotification: { createMany: vi.fn() },
  },
  sendEmailMock: vi.fn(),
  sendWhatsAppMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/ses-email', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: sendWhatsAppMock }))
vi.mock('@/lib/contratos/timeline', () => ({
  addContratoTimelineEvent: vi.fn(async () => {}),
}))

import { sendFirmaCode, signContratoConCodigo } from '@/lib/contratos/firma'
import { addContratoTimelineEvent } from '@/lib/contratos/timeline'
import { prisma } from '@/lib/db'

const contrato = {
  id: 'ctr-1',
  tenantId: 'tenant-1',
  numero: 'CONT-2026-0001',
  titulo: 'Contrato de prueba',
  estado: 'enviado',
  total: 1000,
  moneda: 'EUR',
  firmadoPorCliente: false,
  firmadoPorEmpresa: true,
  dealId: null,
  clienteEmail: 'cliente@empresa.com',
  clienteNombre: 'Cliente',
  signatureRequests: [
    {
      id: 'sr-1',
      signers: [{ email: 'cliente@empresa.com', name: 'Cliente', role: 'Cliente', signedAt: null }],
    },
  ],
}

const contratoFirmaChallenge = {
  id: 'challenge-1',
  contratoId: 'ctr-1',
  tenantId: 'tenant-1',
  channel: 'email',
  email: 'cliente@empresa.com',
  telefono: null,
  maxAttempts: 5,
  attempts: 0,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  verifiedAt: null,
  codeHash: hashAcceptanceSecret('123456'),
  challengeTokenHash: hashAcceptanceSecret('tok-abc'),
}

describe('sendFirmaCode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.contrato.findFirst.mockResolvedValue(contrato)
    prisma.contratoFirmaChallenge.findFirst.mockResolvedValue(null)
    prisma.contratoFirmaChallenge.create.mockImplementation(async ({ data }: any) => ({
      id: 'challenge-1',
      expiresAt: data.expiresAt,
      ...data,
    }))
    sendEmailMock.mockResolvedValue({ success: true })
    sendWhatsAppMock.mockResolvedValue({ success: true })
  })

  it('envía el código al email del contrato y crea el reto', async () => {
    const result = await sendFirmaCode({ contratoId: 'ctr-1', tenantId: 'tenant-1' })

    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const call = sendEmailMock.mock.calls[0][0]
    expect(call.to).toBe('cliente@empresa.com')
    expect(call.subject).toContain('CONT-2026-0001')
    expect(call.text).toContain('Código Volkern')
    expect(prisma.contratoFirmaChallenge.create).toHaveBeenCalledTimes(1)
    expect(result.destinationMasked).toContain('@empresa.com')
    expect(result.challengeId).toBe('challenge-1')
  })

  it('usa el email del cuerpo si se indica y es válido', async () => {
    await sendFirmaCode({ contratoId: 'ctr-1', tenantId: 'tenant-1', email: 'otro@dominio.com' })

    expect(sendEmailMock.mock.calls[0][0].to).toBe('otro@dominio.com')
  })

  it('rechaza si no hay email válido (no inventa datos)', async () => {
    prisma.contrato.findFirst.mockResolvedValue({
      ...contrato,
      clienteEmail: null,
      signatureRequests: [{ id: 'sr-1', signers: [{ name: 'Sin email', role: 'Cliente' }] }],
    })

    await expect(sendFirmaCode({ contratoId: 'ctr-1', tenantId: 'tenant-1' })).rejects.toThrow(
      'No hay un email válido',
    )
    expect(prisma.contratoFirmaChallenge.create).not.toHaveBeenCalled()
  })

  it('rechaza si el contrato ya fue firmado', async () => {
    prisma.contrato.findFirst.mockResolvedValue({ ...contrato, firmadoPorCliente: true })

    await expect(sendFirmaCode({ contratoId: 'ctr-1', tenantId: 'tenant-1' })).rejects.toThrow(
      'ya fue firmado',
    )
  })

  it('envía el código por WhatsApp si se elige ese canal y hay teléfono', async () => {
    prisma.contrato.findFirst.mockResolvedValue({
      ...contrato,
      clienteEmail: null,
      clienteTelefono: '+34600123456',
    })

    const result = await sendFirmaCode({
      contratoId: 'ctr-1',
      tenantId: 'tenant-1',
      channel: 'whatsapp',
    })

    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(sendWhatsAppMock).toHaveBeenCalledTimes(1)
    const call = sendWhatsAppMock.mock.calls[0]
    expect(call[0]).toBe('+34600123456')
    expect(call[1]).toContain('Código Volkern')
    expect(call[2]).toBe('tenant-1')
    expect(prisma.contratoFirmaChallenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: 'whatsapp', telefono: '+34600123456', email: null }),
      }),
    )
    expect(result.channel).toBe('whatsapp')
    expect(result.destinationMasked).not.toContain('@')
  })

  it('usa el teléfono del cuerpo si se indica y es válido', async () => {
    await sendFirmaCode({
      contratoId: 'ctr-1',
      tenantId: 'tenant-1',
      channel: 'whatsapp',
      telefono: '+34699887766',
    })

    expect(sendWhatsAppMock.mock.calls[0][0]).toBe('+34699887766')
  })

  it('rechaza WhatsApp sin teléfono válido (no inventa datos)', async () => {
    prisma.contrato.findFirst.mockResolvedValue({
      ...contrato,
      clienteEmail: null,
      clienteTelefono: null,
    })

    await expect(
      sendFirmaCode({ contratoId: 'ctr-1', tenantId: 'tenant-1', channel: 'whatsapp' }),
    ).rejects.toThrow('No hay un teléfono de WhatsApp válido')
    expect(prisma.contratoFirmaChallenge.create).not.toHaveBeenCalled()
  })

  it('no crea el reto si el envío del código falla', async () => {
    sendWhatsAppMock.mockResolvedValue({ success: false, error: 'boom' })
    prisma.contrato.findFirst.mockResolvedValue({
      ...contrato,
      clienteEmail: null,
      clienteTelefono: '+34600123456',
    })

    await expect(
      sendFirmaCode({ contratoId: 'ctr-1', tenantId: 'tenant-1', channel: 'whatsapp' }),
    ).rejects.toThrow('No se pudo enviar el código')
    expect(prisma.contratoFirmaChallenge.delete).toHaveBeenCalled()
  })
})

describe('signContratoConCodigo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.contratoFirmaChallenge.findUnique.mockResolvedValue(contratoFirmaChallenge)
    prisma.contrato.findFirst.mockResolvedValue(contrato)
    prisma.contrato.update.mockResolvedValue({ ...contrato, firmadoPorCliente: true, estado: 'vigente' })
    prisma.signatureRequest.findFirst.mockResolvedValue({
      id: 'sr-1',
      signers: [{ email: 'cliente@empresa.com', name: 'Cliente', role: 'Cliente', signedAt: null }],
    })
    prisma.signatureRequest.update.mockResolvedValue({})
    prisma.user.findMany.mockResolvedValue([{ id: 'u-1' }])
    prisma.inAppNotification.createMany.mockResolvedValue({ count: 1 })
  })

  it('firma el contrato con un código correcto y registra el timeline', async () => {
    const result = await signContratoConCodigo({
      contratoId: 'ctr-1',
      tenantId: 'tenant-1',
      challengeId: 'challenge-1',
      challengeToken: 'tok-abc',
      code: '123456',
      nombreFirma: 'Cliente Prueba',
      ip: '203.0.113.5',
    })

    expect(result.estado).toBe('vigente')
    expect(prisma.contrato.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firmadoPorCliente: true,
          nombreFirmaCliente: 'Cliente Prueba',
          estado: 'vigente',
          ipFirmaCliente: '203.0.113.5',
        }),
      }),
    )
    // SignatureRequest: marca al firmante y la solicitud como signed
    const srUpdate = prisma.signatureRequest.update.mock.calls[0][0]
    expect(srUpdate.data.status).toBe('signed')
    expect(srUpdate.data.signers[0].signedAt).toBeDefined()
    // Timeline + auditoría + notificación
    expect(addContratoTimelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'document_signed', contratoId: 'ctr-1' }),
    )
    expect(prisma.auditLog.create).toHaveBeenCalled()
    expect(prisma.inAppNotification.createMany).toHaveBeenCalled()
    // Challenge verificado
    expect(prisma.contratoFirmaChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verifiedAt: expect.any(Date) }) }),
    )
  })

  it('rechaza un código incorrecto sin firmar el contrato', async () => {
    await expect(
      signContratoConCodigo({
        contratoId: 'ctr-1',
        tenantId: 'tenant-1',
        challengeId: 'challenge-1',
        challengeToken: 'tok-abc',
        code: '999999',
        nombreFirma: 'Cliente',
        ip: '203.0.113.5',
      }),
    ).rejects.toThrow('Código inválido')

    expect(prisma.contrato.update).not.toHaveBeenCalled()
    // Se incrementaron los intentos
    expect(prisma.contratoFirmaChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attempts: { increment: 1 } }) }),
    )
  })

  it('rechaza un token de reto inválido', async () => {
    await expect(
      signContratoConCodigo({
        contratoId: 'ctr-1',
        tenantId: 'tenant-1',
        challengeId: 'challenge-1',
        challengeToken: 'otro-token',
        code: '123456',
        nombreFirma: 'Cliente',
        ip: '203.0.113.5',
      }),
    ).rejects.toThrow('Código inválido')
    expect(prisma.contrato.update).not.toHaveBeenCalled()
  })

  it('rechaza si el reto caducó o no pertenece al contrato', async () => {
    prisma.contratoFirmaChallenge.findUnique.mockResolvedValue({
      ...contratoFirmaChallenge,
      contratoId: 'otro-contrato',
    })

    await expect(
      signContratoConCodigo({
        contratoId: 'ctr-1',
        tenantId: 'tenant-1',
        challengeId: 'challenge-1',
        challengeToken: 'tok-abc',
        code: '123456',
        nombreFirma: 'Cliente',
        ip: '203.0.113.5',
      }),
    ).rejects.toThrow('Código inválido o caducado')
    expect(prisma.contrato.update).not.toHaveBeenCalled()
  })

  it('firma con un reto por WhatsApp (sin email) y registra el timeline con el teléfono', async () => {
    prisma.contratoFirmaChallenge.findUnique.mockResolvedValue({
      ...contratoFirmaChallenge,
      channel: 'whatsapp',
      email: null,
      telefono: '+34600123456',
    })

    const result = await signContratoConCodigo({
      contratoId: 'ctr-1',
      tenantId: 'tenant-1',
      challengeId: 'challenge-1',
      challengeToken: 'tok-abc',
      code: '123456',
      nombreFirma: 'Cliente Prueba',
      ip: '203.0.113.5',
    })

    expect(result.estado).toBe('vigente')
    // Sin email: la SignatureRequest no se rompe (se deja como está)
    expect(prisma.signatureRequest.update).toHaveBeenCalled()
    // Timeline con el teléfono enmascarado/real
    expect(addContratoTimelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'document_signed',
        metadata: expect.objectContaining({ canal: 'whatsapp', telefono: '+34600123456', email: null }),
      }),
    )
    expect(prisma.inAppNotification.createMany).toHaveBeenCalled()
  })
})
