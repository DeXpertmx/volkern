/**
 * P2 — Historial de la conversación para el agente CRM.
 *
 * El agente sólo veía el mensaje actual, así que una frase como «que tengan
 * terraza» no tenía antecedente: empezaba una búsqueda nueva en vez de afinar
 * la anterior. Aquí se demuestra que el historial llega al modelo y que, con
 * él, el criterio se acumula sobre la búsqueda previa.
 *
 * El "modelo" es un doble determinista que lee los mensajes que recibe, igual
 * que haría el LLM: si no ve el turno anterior, no puede saber la zona.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reiniciarPrisma, prismaActual } from '../ayuda/prisma-en-memoria'

const TENANT = 'tenant-a'
const CHANNEL = 'canal-1'

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

interface MensajeEnviado {
  role: string
  content: string
}

const mensajesRecibidos: MensajeEnviado[][] = []
const llamadas: Array<{ nombre: string; args: Record<string, any> }> = []
const respuestas: string[] = []

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithToolLoop: async (
    mensajes: MensajeEnviado[],
    _herramientas: unknown,
    ejecutar: (nombre: string, args: Record<string, any>) => Promise<string>
  ) => {
    mensajesRecibidos.push(mensajes.map((m) => ({ role: m.role, content: m.content })))
    const { nombre, args } = modeloDePrueba(mensajes)
    llamadas.push({ nombre, args })
    respuestas.push(await ejecutar(nombre, args))
    return { choices: [{ message: { content: 'Estas son las opciones que encajan.' } }] }
  },
}))

/**
 * Doble del modelo: saca los criterios del hilo completo (turnos anteriores +
 * mensaje actual). Sin historial, «que tengan terraza» no menciona zona,
 * operación ni tipo, así que sólo puede filtrar por terraza.
 */
function modeloDePrueba(mensajes: MensajeEnviado[]): {
  nombre: string
  args: Record<string, any>
} {
  const actual = String(mensajes[mensajes.length - 1]?.content || '')
  const previos = mensajes.slice(0, -1).filter((m) => m.role === 'user').map((m) => m.content)
  const texto = [...previos, actual].join('\n').toLowerCase()

  const args: Record<string, any> = {}
  if (/venta|comprar/.test(texto)) args.operacion = 'venta'
  if (/alquiler|rentar/.test(texto)) args.operacion = 'alquiler'
  if (/pisos?|departamentos?|apartamentos?/.test(texto)) args.tipo = 'departamento'
  const zona = /en\s+(madrid|barcelona)/.exec(texto)
  if (zona) args.zona = zona[1][0].toUpperCase() + zona[1].slice(1)
  if (/terraza/.test(texto)) args.terraza = true

  return { nombre: 'buscar_propiedades', args }
}

// `catalogo.ver` es la llave de la búsqueda de inmuebles: `leads.ver` no la
// sustituye (ver permisos-herramientas.test.ts).
const ROL_COMERCIAL = {
  nombre: 'Comercial',
  permisos: { leads: { ver: true, crear: true, editar: true }, catalogo: { ver: true } },
}

function inmueble(id: string, ciudad: string, terraza: boolean, precio: number) {
  return {
    id,
    tenantId: TENANT,
    nombre: `Piso ${id}`,
    descripcion: null,
    precioBase: precio,
    moneda: 'EUR',
    activo: true,
    destacado: false,
    media: null,
    tipo: 'inmueble',
    fechaCreacion: new Date('2026-11-01'),
    fechaActualizacion: new Date('2026-11-01'),
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'Departamento',
      zona: ciudad,
      habitaciones: 3,
      terraza,
      estado: 'disponible',
    },
  }
}

function sembrar() {
  reiniciarPrisma({
    tenant: [{ id: TENANT, nombre: 'Inmobiliaria A' }],
    user: [{ id: 'u-comercial', tenantId: TENANT, name: 'Carla', timezone: 'Europe/Madrid', role: ROL_COMERCIAL }],
    lead: [],
    task: [],
    note: [],
    interaction: [],
    contact: [],
    chatChannel: [{ id: CHANNEL, tenantId: TENANT, name: 'chat' }],
    chatMessage: [],
    catalogoItem: [
      inmueble('inm-madrid-terraza', 'Madrid', true, 320000),
      inmueble('inm-madrid-sin-terraza', 'Madrid', false, 250000),
      inmueble('inm-barcelona-terraza', 'Barcelona', true, 280000),
    ],
  })
}

async function preguntar(message: string, historial?: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const { ejecutarAgenteCrm } = await import('@/lib/agents/crm-tool-agent')
  return ejecutarAgenteCrm({ message, tenantId: TENANT, userId: 'u-comercial', historial })
}

const PRIMERA = 'Busca pisos en venta en Madrid'
const SEGUNDA = 'que tengan terraza'

beforeEach(() => {
  sembrar()
  mensajesRecibidos.length = 0
  llamadas.length = 0
  respuestas.length = 0
})

describe('historial al modelo', () => {
  it('el segundo mensaje llega con los turnos anteriores y afina la búsqueda previa', async () => {
    await preguntar(PRIMERA)
    expect(llamadas[0].args).toMatchObject({ operacion: 'venta', tipo: 'departamento', zona: 'Madrid' })

    const historial = [
      { role: 'user' as const, content: PRIMERA },
      { role: 'assistant' as const, content: 'Encontré 2 pisos en Madrid.' },
    ]
    await preguntar(SEGUNDA, historial)

    // El modelo recibe el hilo en orden y el mensaje actual una sola vez.
    const mensajes = mensajesRecibidos[1]
    expect(mensajes.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(mensajes[1].content).toBe(PRIMERA)
    expect(mensajes[2].content).toBe('Encontré 2 pisos en Madrid.')
    expect(mensajes[3].content).toBe(SEGUNDA)

    // Los criterios de antes siguen ahí y se les suma el nuevo.
    expect(llamadas[1].args).toEqual({
      operacion: 'venta',
      tipo: 'departamento',
      zona: 'Madrid',
      terraza: true,
    })

    const resultado = JSON.parse(respuestas[1])
    expect(resultado.propiedades.map((p: any) => p.id)).toEqual(['inm-madrid-terraza'])
  })

  it('sin historial la misma frase no puede aplicar el filtro sobre la búsqueda previa', async () => {
    await preguntar(SEGUNDA)

    // El modelo sólo ve «que tengan terraza»: no sabe zona, operación ni tipo,
    // así que devuelve inmuebles de cualquier ciudad.
    expect(llamadas[0].args).toEqual({ terraza: true })
    const resultado = JSON.parse(respuestas[0])
    expect(resultado.propiedades.map((p: any) => p.id).sort()).toEqual([
      'inm-barcelona-terraza',
      'inm-madrid-terraza',
    ])
  })
})

describe('lectura del historial', () => {
  it('devuelve los últimos mensajes del canal en orden y con su rol', async () => {
    prismaActual.tablas.chatMessage.push(
      { id: 'm1', tenantId: TENANT, channelId: CHANNEL, senderId: 'u-comercial', content: 'hola', createdAt: new Date('2026-11-19T09:00:00Z'), deletedAt: null },
      { id: 'm2', tenantId: TENANT, channelId: CHANNEL, senderId: null, content: 'buenas', createdAt: new Date('2026-11-19T09:01:00Z'), deletedAt: null },
      { id: 'm3', tenantId: TENANT, channelId: CHANNEL, senderId: 'u-comercial', content: 'busco pisos', createdAt: new Date('2026-11-19T09:02:00Z'), deletedAt: null },
      // Otro tenant y un mensaje borrado: no deben aparecer.
      { id: 'm4', tenantId: 'tenant-b', channelId: CHANNEL, senderId: 'ajeno', content: 'no soy tuyo', createdAt: new Date('2026-11-19T09:03:00Z'), deletedAt: null },
      { id: 'm5', tenantId: TENANT, channelId: CHANNEL, senderId: 'u-comercial', content: 'borrado', createdAt: new Date('2026-11-19T09:04:00Z'), deletedAt: new Date() }
    )

    const { cargarHistorialDeConversacion } = await import('@/lib/agents/conversation-history')
    const historial = await cargarHistorialDeConversacion({ channelId: CHANNEL, tenantId: TENANT })

    expect(historial).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'buenas' },
      { role: 'user', content: 'busco pisos' },
    ])
  })

  it('recorta a los últimos 10 turnos (20 mensajes) cuando el hilo es largo', async () => {
    for (let i = 0; i < 30; i++) {
      prismaActual.tablas.chatMessage.push({
        id: `m${i}`,
        tenantId: TENANT,
        channelId: CHANNEL,
        senderId: 'u-comercial',
        content: `mensaje ${i}`,
        createdAt: new Date(Date.UTC(2026, 10, 19, 9, i)),
        deletedAt: null,
      })
    }

    const { cargarHistorialDeConversacion } = await import('@/lib/agents/conversation-history')
    const historial = await cargarHistorialDeConversacion({ channelId: CHANNEL, tenantId: TENANT })

    expect(historial).toHaveLength(20)
    expect(historial.map((m) => m.content)).toEqual(
      Array.from({ length: 20 }, (_, i) => `mensaje ${i + 10}`)
    )
  })
})
