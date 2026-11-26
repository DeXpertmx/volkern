// @vitest-environment node
/**
 * Emisión del código de WhatsApp: un solo código válido por solicitud.
 *
 * El gate reutiliza la solicitud pendiente cuando dos llamadas traen los mismos
 * argumentos. Antes, cada llamada generaba un código, lo enviaba y luego lo
 * guardaba: la segunda sobrescribía el token de la primera y dejaba su enlace
 * muerto (y se enviaban dos WhatsApp con dos códigos distintos).
 *
 * Ahora la emisión se reserva con un UPDATE condicionado, que es el cerrojo: la
 * llamada que llega después encuentra el código vigente y devuelve ese mismo
 * enlace sin enviar nada. Si el envío falla, la reserva se libera para que el
 * reintento pueda emitir otro código.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  fila: null as any,
  enviar: vi.fn(),
  /** Emula el bloqueo de fila: un UPDATE condicionado cada vez. */
  colaLock: Promise.resolve() as Promise<unknown>,
}))

vi.mock('@/lib/evolution-instances', () => ({ sendMessageWithUserInstance: h.enviar }))

vi.mock('@/lib/db', () => {
  const aplicar = (data: Record<string, any>) => {
    for (const [clave, valor] of Object.entries(data)) {
      if (valor && typeof valor === 'object' && 'increment' in valor) {
        h.fila[clave] = (h.fila[clave] ?? 0) + valor.increment
      } else {
        h.fila[clave] = valor
      }
    }
    return { ...h.fila }
  }

  const cumple = (where: Record<string, any>): boolean =>
    Object.entries(where).every(([clave, condicion]) => {
      if (clave === 'OR') return (condicion as any[]).some(cumple)
      const valor = h.fila[clave] ?? null
      if (condicion && typeof condicion === 'object' && !(condicion instanceof Date)) {
        if ('lte' in condicion) {
          return valor !== null && new Date(valor).getTime() <= new Date(condicion.lte).getTime()
        }
      }
      return valor === condicion
    })

  const updateMany = async ({ where, data }: any) => {
    // El UPDATE condicionado se serializa como el bloqueo de fila de Postgres:
    // la segunda llamada reevalúa el WHERE con el estado ya confirmado.
    const anterior = h.colaLock
    let liberar!: () => void
    h.colaLock = new Promise<void>((resolve) => (liberar = resolve))
    await anterior
    try {
      if (!cumple(where)) return { count: 0 }
      aplicar(data)
      return { count: 1 }
    } finally {
      liberar()
    }
  }

  return {
    prisma: {
      tenantWhatsAppInstance: {
        findFirst: async () => ({ instanceName: 'inst-1', phoneNumber: '+52 55 1234 5678' }),
      },
      channel: { findFirst: async () => null },
      mcpApprovalRequest: {
        updateMany,
        update: async ({ data }: any) => aplicar(data),
        findFirst: async ({ where }: any) =>
          h.fila.id === where.id && h.fila.tenantId === where.tenantId ? { ...h.fila } : null,
      },
    },
  }
})

import {
  compareAuthCode,
  generateAndSendWhatsappAuthCode,
} from '@/lib/mcp/whatsapp-auth'

const APPROVAL_ID = 'ap-code'
const TENANT_ID = 'tenant-a'

function filaPendiente() {
  return {
    id: APPROVAL_ID,
    tenantId: TENANT_ID,
    status: 'pending',
    whatsappCodeHash: null,
    whatsappCodeExpiresAt: null,
    whatsappCodeSentAt: null,
    whatsappCodeAttempts: 0,
    whatsappPhoneNumber: null,
    whatsappVerificationToken: null,
  }
}

function emitir() {
  return generateAndSendWhatsappAuthCode({
    approvalId: APPROVAL_ID,
    tenantId: TENANT_ID,
    phoneDestination: 'lead-1',
    messagePreview: 'Hola',
  })
}

/** Código de 6 dígitos que viajó en el mensaje enviado. */
function codigoEnviado(llamada: number): string {
  const mensaje = h.enviar.mock.calls[llamada][2] as string
  const match = /Código: (\d{6})/.exec(mensaje)
  if (!match) throw new Error('El mensaje no lleva código')
  return match[1]
}

beforeEach(() => {
  vi.clearAllMocks()
  h.colaLock = Promise.resolve()
  h.fila = filaPendiente()
  h.enviar.mockResolvedValue({ success: true })
})

describe('generateAndSendWhatsappAuthCode — un código por solicitud', () => {
  it('dos emisiones simultáneas envían UN código y devuelven el mismo enlace', async () => {
    const [primera, segunda] = await Promise.all([emitir(), emitir()])

    expect(h.enviar).toHaveBeenCalledTimes(1)
    expect(segunda.verificationToken).toBe(primera.verificationToken)
    expect(segunda.verificationUrl).toBe(primera.verificationUrl)
    expect(segunda.codeExpiresAt.getTime()).toBe(primera.codeExpiresAt.getTime())

    // El único token vivo es el devuelto por ambas, y el hash guardado
    // corresponde al código que de verdad viajó en el mensaje.
    expect(h.fila.whatsappVerificationToken).toBe(primera.verificationToken)
    expect(await compareAuthCode(codigoEnviado(0), h.fila.whatsappCodeHash)).toBe(true)
    expect(h.fila.whatsappCodeSentAt).toBeInstanceOf(Date)
  })

  it('una segunda emisión con el código vigente no envía ni invalida el enlace', async () => {
    const primera = await emitir()
    const segunda = await emitir()

    expect(h.enviar).toHaveBeenCalledTimes(1)
    expect(segunda.verificationToken).toBe(primera.verificationToken)
    expect(h.fila.whatsappVerificationToken).toBe(primera.verificationToken)
  })

  it('tras caducar el código se emite uno nuevo y el anterior deja de valer', async () => {
    const primera = await emitir()
    const hashPrimero = h.fila.whatsappCodeHash

    h.fila.whatsappCodeExpiresAt = new Date(Date.now() - 1_000)
    const segunda = await emitir()

    expect(h.enviar).toHaveBeenCalledTimes(2)
    expect(segunda.verificationToken).not.toBe(primera.verificationToken)
    expect(h.fila.whatsappVerificationToken).toBe(segunda.verificationToken)
    expect(h.fila.whatsappCodeHash).not.toBe(hashPrimero)
    expect(await compareAuthCode(codigoEnviado(1), h.fila.whatsappCodeHash)).toBe(true)
  })

  it('si el envío falla, libera la reserva y el reintento emite otro código', async () => {
    h.enviar.mockResolvedValueOnce({ success: false, error: 'Evolution caída' })

    await expect(emitir()).rejects.toThrow('Evolution caída')
    expect(h.fila.whatsappVerificationToken).toBeNull()
    expect(h.fila.whatsappCodeHash).toBeNull()
    expect(h.fila.whatsappCodeExpiresAt).toBeNull()

    const reintento = await emitir()

    expect(h.enviar).toHaveBeenCalledTimes(2)
    expect(h.fila.whatsappVerificationToken).toBe(reintento.verificationToken)
    expect(await compareAuthCode(codigoEnviado(1), h.fila.whatsappCodeHash)).toBe(true)
  })

  it('si el envío lanza, también libera la reserva antes de propagar', async () => {
    h.enviar.mockRejectedValueOnce(new Error('sin conexión'))

    await expect(emitir()).rejects.toThrow('sin conexión')
    expect(h.fila.whatsappVerificationToken).toBeNull()
    expect(h.fila.whatsappCodeHash).toBeNull()
  })

  it('una solicitud que ya no está pendiente no emite ni envía', async () => {
    h.fila.status = 'approved'

    await expect(emitir()).rejects.toThrow('no admite un código')
    expect(h.enviar).not.toHaveBeenCalled()
  })
})
