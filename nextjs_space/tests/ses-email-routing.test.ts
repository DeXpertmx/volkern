import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findManyMock, sendMailMock, resendMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  sendMailMock: vi.fn(),
  resendMock: vi.fn(),
}))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
  },
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    configuracion: { findMany: findManyMock },
    tenant: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/resend-email', () => ({
  getFromAddress: vi.fn(() => 'Volkern <noreply@volkern.app>'),
  sendEmail: resendMock,
}))

import { sendEmail } from '@/lib/ses-email'

describe('routing de correo por tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AWS_SES_USER
    delete process.env.AWS_SES_PASSWORD
    resendMock.mockResolvedValue({ success: true, messageId: 'resend-1' })
    sendMailMock.mockResolvedValue({ messageId: 'smtp-1' })
  })

  it('usa el SMTP habilitado del tenant aunque Resend esté disponible', async () => {
    process.env.RESEND_API_KEY = 're_test'
    findManyMock.mockResolvedValue([
      { clave: 'smtp_enabled', valor: 'true' },
      { clave: 'smtp_host', valor: 'smtp.empresa.test' },
      { clave: 'smtp_port', valor: '587' },
      { clave: 'smtp_user', valor: 'notificaciones@empresa.test' },
      { clave: 'smtp_password', valor: 'secret' },
      { clave: 'smtp_encryption', valor: 'tls' },
      { clave: 'smtp_from_email', valor: 'notificaciones@empresa.test' },
      { clave: 'smtp_from_name', valor: 'Empresa' },
    ])

    const result = await sendEmail({
      to: 'cliente@destino.test',
      subject: 'Aviso de empresa',
      text: 'Contenido',
      tenantId: 'tenant-1',
    })

    expect(result.success).toBe(true)
    expect(result.tenantSmtpConfigured).toBe(true)
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
      from: '"Empresa" <notificaciones@empresa.test>',
      to: 'cliente@destino.test',
    }))
    expect(resendMock).not.toHaveBeenCalled()
  })

  it('usa Resend únicamente cuando el tenant no tiene SMTP habilitado', async () => {
    process.env.RESEND_API_KEY = 're_test'
    findManyMock.mockResolvedValue([
      { clave: 'smtp_enabled', valor: 'false' },
    ])

    const result = await sendEmail({
      to: 'cliente@destino.test',
      subject: 'Aviso',
      text: 'Contenido',
      tenantId: 'tenant-1',
    })

    expect(result.success).toBe(true)
    expect(resendMock).toHaveBeenCalledOnce()
    expect(sendMailMock).not.toHaveBeenCalled()
  })
})
