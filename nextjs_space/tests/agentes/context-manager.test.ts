/**
 * Etapa B — Context Manager.
 *
 * Cubre: ventana de 10 turnos, resumen a partir de 20 turnos, entidades
 * activas (persona/propiedad/oportunidad/tarea), continuidad entre mensajes y
 * sustitución del contexto pendiente que antes vivía en `chatbotAuditLog`
 * (ahora en `AgentConversationContext`, con tenant real y TTL).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reiniciarPrisma, prismaActual } from '../ayuda/prisma-en-memoria'

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

vi.mock('@/lib/db', async () => {
  const { prismaActual } = await import('../ayuda/prisma-en-memoria')
  const delegado = new Proxy({}, { get: (_t, prop: string) => (prismaActual.prisma as any)[prop] })
  return { prisma: delegado, default: delegado, globalPrisma: delegado, getTenantDb: async () => delegado }
})

const TENANT = 'tenant-a'
const CHANNEL = 'canal-1'
const USER = 'u-comercial'

function mensaje(id: string, content: string, minuto: number) {
  return {
    id,
    tenantId: TENANT,
    channelId: CHANNEL,
    senderId: USER,
    content,
    createdAt: new Date(Date.UTC(2026, 10, 19, 9, minuto)),
    deletedAt: null,
  }
}

function sembrar(numeroMensajes: number) {
  const mensajes = Array.from({ length: numeroMensajes }, (_, i) =>
    mensaje(`m${i}`, `mensaje ${i}`, i)
  )
  reiniciarPrisma({
    tenant: [{ id: TENANT, nombre: 'Inmobiliaria A' }],
    user: [{ id: USER, tenantId: TENANT, name: 'Carla' }],
    chatChannel: [{ id: CHANNEL, tenantId: TENANT, name: 'chat' }],
    chatMessage: mensajes,
    agentConversationContext: [],
  })
}

beforeEach(() => {
  sembrar(0)
})

describe('ventana y resumen', () => {
  it('devuelve los últimos 10 turnos y ningún resumen por debajo del umbral', async () => {
    sembrar(40)
    const { cargarContextoDeConversacion } = await import('@/lib/agents/context-manager')

    const contexto = await cargarContextoDeConversacion({ channelId: CHANNEL, tenantId: TENANT, userId: USER })

    expect(contexto.historial).toHaveLength(20)
    expect(contexto.historial[0].content).toBe('mensaje 20')
    expect(contexto.resumen).toBeNull()
  })

  it('genera y persiste un resumen cuando se superan 20 turnos', async () => {
    sembrar(45)
    const { cargarContextoDeConversacion } = await import('@/lib/agents/context-manager')

    const contexto = await cargarContextoDeConversacion({ channelId: CHANNEL, tenantId: TENANT, userId: USER })

    expect(contexto.historial).toHaveLength(20)
    expect(contexto.resumen).toContain('Resumen de')
    expect(contexto.resumen).toContain('mensaje 0')

    // Persistido: una segunda carga no vuelve a resumir la cola ya guardada.
    const fila = prismaActual.tablas.agentConversationContext.find(
      (c) => c.clave === `conversacion:${CHANNEL}`
    )
    expect(fila?.resumen?.texto).toContain('Resumen de')
  })

  it('no deja surrogates sueltos al recortar un emoji en el límite del resumen', async () => {
    // 159 caracteres + emoji: el corte a 160 parte el par y Prisma no puede
    // serializar un JSON con un surrogate suelto.
    sembrar(45)
    prismaActual.tablas.chatMessage[0].content = `${'a'.repeat(159)}😀 resto`
    const { resumirMensajes } = await import('@/lib/agents/context-manager')

    const resumen = resumirMensajes(prismaActual.tablas.chatMessage.map((m) => ({ role: 'user', content: m.content })))

    expect(resumen.texto).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
    expect(resumen.texto).toContain('a'.repeat(159))
  })

  it('el resumen persistido no contiene surrogates sueltos (Prisma rechaza ese JSON)', async () => {
    sembrar(45)
    prismaActual.tablas.chatMessage[0].content = `${'a'.repeat(159)}😀 resto`
    const { cargarContextoDeConversacion } = await import('@/lib/agents/context-manager')

    await cargarContextoDeConversacion({ channelId: CHANNEL, tenantId: TENANT, userId: USER })

    const fila = prismaActual.tablas.agentConversationContext.find(
      (c) => c.clave === `conversacion:${CHANNEL}`
    )
    expect(fila?.resumen?.texto).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })

  it('no mezcla mensajes de otra conversación ni de otro tenant', async () => {
    reiniciarPrisma({
      tenant: [{ id: TENANT, nombre: 'A' }],
      user: [{ id: USER, tenantId: TENANT, name: 'Carla' }],
      chatChannel: [{ id: CHANNEL, tenantId: TENANT, name: 'chat' }],
      chatMessage: [
        mensaje('propio', 'dato propio', 0),
        { id: 'ajeno', tenantId: 'tenant-b', channelId: CHANNEL, senderId: 'otro', content: 'dato ajeno', createdAt: new Date(), deletedAt: null },
        { id: 'otro-canal', tenantId: TENANT, channelId: 'canal-2', senderId: USER, content: 'otra conversación', createdAt: new Date(), deletedAt: null },
      ],
      agentConversationContext: [],
    })
    const { cargarContextoDeConversacion } = await import('@/lib/agents/context-manager')

    const contexto = await cargarContextoDeConversacion({ channelId: CHANNEL, tenantId: TENANT, userId: USER })

    expect(contexto.historial.map((m) => m.content)).toEqual(['dato propio'])
    expect(prismaActual.violaciones).toEqual([])
  })
})

describe('entidades activas', () => {
  it('persiste y mezcla las entidades resueltas', async () => {
    const { registrarEntidadesActivas } = await import('@/lib/agents/context-manager')

    await registrarEntidadesActivas({
      channelId: CHANNEL,
      tenantId: TENANT,
      userId: USER,
      entidades: { persona: { id: 'lead-1', etiqueta: 'Ana' }, propiedad: { id: 'inm-1', etiqueta: 'Piso Madrid' } },
    })
    await registrarEntidadesActivas({
      channelId: CHANNEL,
      tenantId: TENANT,
      userId: USER,
      entidades: { persona: { id: 'lead-2', etiqueta: 'Bruno' } },
    })

    const fila = prismaActual.tablas.agentConversationContext.find(
      (c) => c.clave === `conversacion:${CHANNEL}`
    )
    expect(fila?.entidades).toMatchObject({
      persona: { id: 'lead-2', etiqueta: 'Bruno' },
      propiedad: { id: 'inm-1', etiqueta: 'Piso Madrid' },
    })
  })

  it('bloqueDeEntidades sólo nombra las entidades presentes', async () => {
    const { bloqueDeEntidades } = await import('@/lib/agents/context-manager')
    const bloque = bloqueDeEntidades({
      persona: { id: 'lead-1', etiqueta: 'Ana' },
      oportunidad: { id: 'deal-1', etiqueta: 'Negocio Centro' },
    })
    expect(bloque).toContain('persona: Ana (lead-1)')
    expect(bloque).toContain('oportunidad/negocio: Negocio Centro (deal-1)')
    expect(bloque).not.toContain('propiedad')
    expect(bloqueDeEntidades({})).toBe('')
  })
})

describe('contexto pendiente (sustituye a chatbotAuditLog)', () => {
  it('guarda, lee y limpia el contexto pendiente con el tenant real', async () => {
    const { guardarContextoPendiente, obtenerContextoPendiente, limpiarContextoPendiente } =
      await import('@/lib/agents/context-manager')

    await guardarContextoPendiente({
      userId: USER,
      tenantId: TENANT,
      pendiente: { intent: 'agendar_cita', missingParams: ['date'], collectedParams: {} },
    })

    expect(await obtenerContextoPendiente({ userId: USER, tenantId: TENANT })).toEqual({
      intent: 'agendar_cita',
      missingParams: ['date'],
      collectedParams: {},
    })

    // El registro ya no se escribe en chatbotAuditLog con tenant 'pending'.
    await limpiarContextoPendiente({ userId: USER })
    expect(await obtenerContextoPendiente({ userId: USER, tenantId: TENANT })).toBeNull()
  })

  it('no devuelve el contexto pendiente a otro tenant', async () => {
    const { guardarContextoPendiente, obtenerContextoPendiente } = await import('@/lib/agents/context-manager')

    await guardarContextoPendiente({
      userId: USER,
      tenantId: TENANT,
      pendiente: { intent: 'agendar_cita' },
    })

    expect(await obtenerContextoPendiente({ userId: USER, tenantId: 'tenant-b' })).toBeNull()
  })

  it('el contexto pendiente caduca a los cinco minutos', async () => {
    const { guardarContextoPendiente, obtenerContextoPendiente } = await import('@/lib/agents/context-manager')

    await guardarContextoPendiente({ userId: USER, tenantId: TENANT, pendiente: { intent: 'agendar_cita' } })
    const fila = prismaActual.tablas.agentConversationContext.find(
      (c) => c.clave === `pendiente:${USER}`
    )
    fila!.updatedAt = new Date(Date.now() - 6 * 60 * 1000)

    expect(await obtenerContextoPendiente({ userId: USER, tenantId: TENANT })).toBeNull()
    expect(
      prismaActual.tablas.agentConversationContext.find((c) => c.clave === `pendiente:${USER}`)
    ).toBeUndefined()
  })
})
