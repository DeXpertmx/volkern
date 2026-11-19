/**
 * El historial que el chat web entrega al agente.
 *
 * La ruta lo lee **antes** de guardar el mensaje actual —si lo leyera después,
 * el mismo mensaje llegaría dos veces al modelo— y lo acota al tenant de la
 * sesión. Estas pruebas cruzan la ruta con el orquestador para fijar las dos
 * cosas, que son las que no se ven mirando solo el lector del historial.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reiniciarPrisma, prismaActual } from '../ayuda/prisma-en-memoria'

const TENANT = 'tenant-a'
const CHANNEL = 'canal-1'
const USER = 'u-1'

const mocks = vi.hoisted(() => ({
  peticiones: [] as Array<{
    message: string
    historial?: Array<{ role: string; content: string }>
  }>,
}))

vi.mock('@/lib/db', async () => {
  const { prismaActual } = await import('../ayuda/prisma-en-memoria')
  const delegado = new Proxy(
    {},
    { get: (_t, prop: string) => (prismaActual.prisma as any)[prop] }
  )
  return {
    prisma: delegado,
    default: delegado,
    globalPrisma: delegado,
    getTenantDb: async () => delegado,
  }
})

vi.mock('next-auth', () => ({
  getServerSession: async () => ({
    user: { id: 'u-1', tenantId: 'tenant-a', roleName: 'Comercial' },
  }),
}))

vi.mock('@/lib/auth', () => ({ authOptions: {} }))

vi.mock('@/lib/agents/orchestrator', () => ({
  orchestrator: {
    process: async (req: any) => {
      mocks.peticiones.push({ message: req.message, historial: req.historial })
      return { success: true, response: 'respuesta del agente' }
    },
  },
}))

vi.mock('@/lib/chat/gemma-conversations', () => ({
  channelPrefix: (userId: string) => `gemma-chat:${userId}:`,
  resolveConversation: async () => 'canal-1',
  tituloDesde: (texto: string) => texto,
  touchConversation: async () => {},
}))

import { POST } from '@/app/api/chat/route'

function mensaje(
  id: string,
  tenantId: string,
  senderId: string | null,
  content: string,
  minuto: number
) {
  return {
    id,
    tenantId,
    channelId: CHANNEL,
    senderId,
    content,
    createdAt: new Date(Date.UTC(2026, 10, 19, 9, minuto)),
    deletedAt: null,
  }
}

function enviar(message: string) {
  return POST(
    new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
  )
}

beforeEach(() => {
  mocks.peticiones.length = 0
  reiniciarPrisma({
    tenant: [{ id: TENANT, nombre: 'Inmobiliaria A' }],
    user: [{ id: USER, tenantId: TENANT, name: 'Carla' }],
    lead: [],
    task: [],
    note: [],
    interaction: [],
    contact: [],
    chatChannel: [
      { id: CHANNEL, tenantId: TENANT, name: `gemma-chat:${USER}:demo`, type: 'private' },
    ],
    chatMessage: [],
    catalogoItem: [],
  })
})

describe('POST /api/chat — historial para el agente', () => {
  it('manda cada turno una sola vez y descarta los mensajes de otro tenant', async () => {
    prismaActual.tablas.chatMessage.push(
      mensaje('m1', TENANT, USER, 'Busca pisos en venta en Madrid', 0),
      mensaje('m2', TENANT, null, 'Encontré dos pisos.', 1),
      mensaje('m3', TENANT, USER, 'que tengan terraza', 2),
      mensaje('m4', TENANT, null, 'Estos tienen terraza.', 3),
      mensaje('m5', 'tenant-b', 'ajeno', 'no soy tuyo', 4)
    )

    await enviar('y más baratas')

    // Cada turno previo entra una vez, en orden; el mensaje actual todavía no
    // está en el historial (se guarda después) y el del otro tenant no entra
    // aunque comparta channelId.
    expect(mocks.peticiones[0].historial).toEqual([
      { role: 'user', content: 'Busca pisos en venta en Madrid' },
      { role: 'assistant', content: 'Encontré dos pisos.' },
      { role: 'user', content: 'que tengan terraza' },
      { role: 'assistant', content: 'Estos tienen terraza.' },
    ])
    expect(
      prismaActual.tablas.chatMessage.filter((m) => m.content === 'y más baratas')
    ).toHaveLength(1)
  })
})
