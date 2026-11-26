// @vitest-environment node
/**
 * ACK de entrega de un envío WhatsApp.
 *
 * El webhook de Evolution llega después de la respuesta (o de su ausencia) y es
 * lo único que dice si el mensaje se entregó. Aquí se comprueba que el ACK cae
 * en la solicitud correcta, avanza en un solo sentido y resuelve el caso que
 * antes quedaba abierto: una solicitud cerrada como fallida que en realidad
 * salió pasa a ejecutada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  solicitud: null as any,
  actualizaciones: [] as any[],
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    mcpApprovalRequest: {
      findFirst: async ({ where }: any) =>
        h.solicitud && h.solicitud.whatsappMessageId === where.whatsappMessageId
          ? { ...h.solicitud }
          : null,
      update: async ({ where, data }: any) => {
        h.actualizaciones.push({ where, data })
        return { ...h.solicitud, ...data }
      },
    },
  },
}))

import {
  estadoDeEntrega,
  idDeMensajeEnResultado,
  registrarEntregaDeWhatsapp,
} from '@/lib/mcp/whatsapp-entrega'

beforeEach(() => {
  h.actualizaciones = []
  h.solicitud = {
    id: 'ap-1',
    status: 'failed',
    entregaEstado: null,
    result: { success: true, resultado: { messageId: 'wamid-1' } },
    whatsappMessageId: 'wamid-1',
  }
})

describe('estadoDeEntrega', () => {
  it('traduce los ACK de Evolution y su forma numérica', () => {
    expect(estadoDeEntrega('SERVER_ACK')).toBe('enviado')
    expect(estadoDeEntrega('1')).toBe('enviado')
    expect(estadoDeEntrega('DELIVERY_ACK')).toBe('entregado')
    expect(estadoDeEntrega('2')).toBe('entregado')
    expect(estadoDeEntrega('READ')).toBe('leido')
    expect(estadoDeEntrega('ERROR')).toBe('fallido')
    expect(estadoDeEntrega('PENDING')).toBeNull()
    expect(estadoDeEntrega('')).toBeNull()
  })
})

describe('idDeMensajeEnResultado', () => {
  it('lo encuentra en la forma del skill y en la del proveedor', () => {
    expect(idDeMensajeEnResultado({ resultado: { messageId: 'wamid-1' } })).toBe('wamid-1')
    expect(idDeMensajeEnResultado({ data: { key: { id: 'wamid-2' } } })).toBe('wamid-2')
    expect(idDeMensajeEnResultado({ success: true })).toBeNull()
    expect(idDeMensajeEnResultado(null)).toBeNull()
  })
})

describe('registrarEntregaDeWhatsapp', () => {
  it('una entrega confirmada resuelve la solicitud fallida como ejecutada', async () => {
    const res = await registrarEntregaDeWhatsapp({
      messageId: 'wamid-1',
      estado: 'entregado',
      cuando: new Date('2026-11-27T10:00:00Z'),
    })

    expect(res).toEqual({ actualizada: true, approvalId: 'ap-1' })
    expect(h.actualizaciones).toHaveLength(1)
    const { data } = h.actualizaciones[0]
    expect(data.status).toBe('executed')
    expect(data.executedAt).toBeInstanceOf(Date)
    expect(data.entregaEstado).toBe('entregado')
    expect(data.result).toMatchObject({
      success: true,
      resultado: { messageId: 'wamid-1' },
      entrega: { estado: 'entregado' },
    })
  })

  it('solo avanza: un ACK viejo no retrocede el estado', async () => {
    h.solicitud.status = 'executed'
    h.solicitud.entregaEstado = 'leido'

    const res = await registrarEntregaDeWhatsapp({ messageId: 'wamid-1', estado: 'entregado' })

    expect(res).toEqual({ actualizada: false, approvalId: 'ap-1' })
    expect(h.actualizaciones).toHaveLength(0)
  })

  it('un error del proveedor no pisa una entrega ya confirmada', async () => {
    h.solicitud.status = 'executed'
    h.solicitud.entregaEstado = 'entregado'

    const res = await registrarEntregaDeWhatsapp({ messageId: 'wamid-1', estado: 'fallido' })

    expect(res.actualizada).toBe(false)
    expect(h.actualizaciones).toHaveLength(0)
  })

  it('un mensaje que no es de una aprobación no toca nada', async () => {
    const res = await registrarEntregaDeWhatsapp({ messageId: 'wamid-ajeno', estado: 'entregado' })

    expect(res).toEqual({ actualizada: false })
    expect(h.actualizaciones).toHaveLength(0)
  })

  it('marca fallido un envío sin entrega, sin cambiar su estado', async () => {
    await registrarEntregaDeWhatsapp({ messageId: 'wamid-1', estado: 'fallido' })

    const { data } = h.actualizaciones[0]
    expect(data.entregaEstado).toBe('fallido')
    expect(data.status).toBeUndefined()
  })

  it('repetir el mismo ACK no escribe dos veces', async () => {
    h.solicitud.status = 'executed'
    h.solicitud.entregaEstado = 'enviado'

    const res = await registrarEntregaDeWhatsapp({ messageId: 'wamid-1', estado: 'enviado' })

    expect(res.actualizada).toBe(false)
    expect(h.actualizaciones).toHaveLength(0)
  })
})
