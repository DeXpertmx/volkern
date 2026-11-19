/**
 * Etapa 0 — Aislamiento multi-tenant entre dos tenants.
 *
 * Qué demuestra: que las rutas del chat y las herramientas del agente no
 * devuelven, escriben ni modifican datos de otro tenant, y que si una consulta
 * pierde su filtro, la fuga se ve como datos reales del otro tenant.
 *
 * Cómo: el Prisma en memoria (`prisma-en-memoria.ts`) filtra solo cuando el
 * código le pasa el filtro; si no, devuelve filas de A y B y anota la violación,
 * que cada caso comprueba con `violaciones == []`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reiniciarPrisma, prismaActual } from '../ayuda/prisma-en-memoria'

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'
const USER_A = 'user-a'
const USER_B = 'user-b'
const CANAL_A = 'canal-a'
const CANAL_B = 'canal-b'
const LEAD_A = 'lead-a'
const LEAD_B = 'lead-b'
const TAREA_A = 'tarea-a'
const TAREA_B = 'tarea-b'

let sesionActual: any = null

vi.mock('@/lib/db', async () => {
  const { prismaActual } = await import('../ayuda/prisma-en-memoria')
  const delegado = new Proxy(
    {},
    { get: (_t, prop: string) => (prismaActual.prisma as any)[prop] }
  )
  return { prisma: delegado, globalPrisma: delegado, getTenantDb: async () => delegado }
})

vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('next-auth', () => ({ getServerSession: async () => sesionActual }))

vi.mock('@/lib/agents/orchestrator', () => ({
  orchestrator: {
    process: vi.fn(async () => ({ success: true, response: 'Respuesta simulada', metadata: {} })),
  },
}))

/** Guion de herramientas que el "modelo" decide llamar, y sus respuestas. */
const guion: Array<{ nombre: string; args: Record<string, any> }> = []
const respuestasHerramientas: string[] = []

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithToolLoop: async (
    _mensajes: unknown,
    _herramientas: unknown,
    ejecutar: (nombre: string, args: Record<string, any>) => Promise<string>
  ) => {
    for (const paso of guion) respuestasHerramientas.push(await ejecutar(paso.nombre, paso.args))
    return { choices: [{ message: { content: 'Resumen de lo ejecutado' } }] }
  },
}))

const sesionDeA = { user: { id: USER_A, tenantId: TENANT_A, roleName: 'Comercial' } }
const ROL_CON_ESCRITURA = { nombre: 'Comercial', permisos: { leads: { ver: true, crear: true, editar: true } } }

function sembrar() {
  reiniciarPrisma({
    tenant: [
      { id: TENANT_A, nombre: 'Inmobiliaria A' },
      { id: TENANT_B, nombre: 'Inmobiliaria B' },
    ],
    user: [
      // Con rol y permisos: esta suite mide aislamiento entre tenants, no
      // autorización (eso lo cubre tests/agentes/permisos-herramientas.test.ts).
      { id: USER_A, tenantId: TENANT_A, name: 'Ana', email: 'ana@a.test', timezone: 'Europe/Madrid', role: ROL_CON_ESCRITURA },
      { id: USER_B, tenantId: TENANT_B, name: 'Beto', email: 'beto@b.test', timezone: 'Europe/Madrid', role: ROL_CON_ESCRITURA },
    ],
    chatChannel: [
      {
        id: CANAL_A,
        tenantId: TENANT_A,
        name: `gemma-chat:${USER_A}:Conversación de Ana`,
        type: 'private',
        updatedAt: new Date('2026-11-01T10:00:00Z'),
      },
      {
        id: CANAL_B,
        tenantId: TENANT_B,
        name: `gemma-chat:${USER_B}:Conversación de Beto`,
        type: 'private',
        updatedAt: new Date('2026-11-02T10:00:00Z'),
      },
    ],
    chatMessage: [
      {
        id: 'msg-a',
        tenantId: TENANT_A,
        channelId: CANAL_A,
        senderId: USER_A,
        content: 'dato privado de A',
        deletedAt: null,
        createdAt: new Date('2026-11-01T10:00:00Z'),
      },
      {
        id: 'msg-b',
        tenantId: TENANT_B,
        channelId: CANAL_B,
        senderId: USER_B,
        content: 'dato privado de B',
        deletedAt: null,
        createdAt: new Date('2026-11-02T10:00:00Z'),
      },
    ],
    lead: [
      { id: LEAD_A, tenantId: TENANT_A, nombre: 'Ana Propia', email: 'ana.propia@a.test' },
      { id: LEAD_B, tenantId: TENANT_B, nombre: 'Bruno Ajeno', email: 'bruno@b.test' },
    ],
    task: [
      {
        id: TAREA_A,
        tenantId: TENANT_A,
        leadId: LEAD_A,
        titulo: 'Llamar a Ana',
        tipo: 'llamada',
        completada: false,
        fechaVencimiento: new Date('2026-11-20T09:00:00Z'),
      },
      {
        id: TAREA_B,
        tenantId: TENANT_B,
        leadId: LEAD_B,
        titulo: 'Llamar a Bruno',
        tipo: 'llamada',
        completada: false,
        fechaVencimiento: new Date('2026-11-20T09:00:00Z'),
      },
    ],
    note: [],
    interaction: [],
  })
}

async function pedirChat(query: string) {
  sesionActual = sesionDeA
  const { GET } = await import('@/app/api/chat/route')
  return GET(new Request(`http://localhost/api/chat${query}`))
}

async function enviarChat(cuerpo: Record<string, unknown>) {
  sesionActual = sesionDeA
  const { POST } = await import('@/app/api/chat/route')
  return POST(
    new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify(cuerpo),
      headers: { 'content-type': 'application/json' },
    })
  )
}

async function ejecutarConGuion(pasos: Array<{ nombre: string; args: Record<string, any> }>) {
  guion.length = 0
  respuestasHerramientas.length = 0
  guion.push(...pasos)
  const { ejecutarAgenteCrm } = await import('@/lib/agents/crm-tool-agent')
  return ejecutarAgenteCrm({ message: 'prueba de aislamiento', tenantId: TENANT_A, userId: USER_A })
}

const tareaPorId = (id: string) => prismaActual.tablas.task.find((t) => t.id === id)!

beforeEach(() => {
  sembrar()
  guion.length = 0
  respuestasHerramientas.length = 0
  sesionActual = null
})

describe('chat: lectura', () => {
  it('un usuario solo ve los mensajes de su conversación', async () => {
    const respuesta = await pedirChat(`?conversationId=${CANAL_A}`)
    expect(respuesta.status).toBe(200)

    const cuerpo = await respuesta.json()
    expect(cuerpo.messages).toHaveLength(1)
    expect(cuerpo.messages[0].content).toContain('dato privado de A')
    expect(JSON.stringify(cuerpo)).not.toContain('dato privado de B')
    expect(prismaActual.violaciones).toEqual([])
  })

  it('la conversación de otro tenant devuelve 404 y ningún dato', async () => {
    const respuesta = await pedirChat(`?conversationId=${CANAL_B}`)
    expect(respuesta.status).toBe(404)
    expect(JSON.stringify(await respuesta.json())).not.toContain('dato privado de B')
  })

  it('el historial no lista canales ajenos', async () => {
    sesionActual = sesionDeA
    const { GET } = await import('@/app/api/chat/conversations/route')
    const respuesta = await GET()
    const ids = (await respuesta.json()).conversations.map((c: any) => c.id)

    expect(ids).toContain(CANAL_A)
    expect(ids).not.toContain(CANAL_B)
    expect(prismaActual.violaciones).toEqual([])
  })
})

describe('chat: escritura', () => {
  it('escribir en la conversación de otro tenant no crea nada ni la toca', async () => {
    const antes = prismaActual.tablas.chatMessage.length
    const respuesta = await enviarChat({ message: 'hola', conversationId: CANAL_B })

    expect(respuesta.status).toBe(404)
    expect(prismaActual.tablas.chatMessage.length).toBe(antes)
    expect(prismaActual.tablas.chatChannel.find((c) => c.id === CANAL_B)!.updatedAt.toISOString()).toBe(
      '2026-11-02T10:00:00.000Z'
    )
  })

  it('un mensaje propio se guarda con el tenant de la sesión', async () => {
    const respuesta = await enviarChat({ message: 'mensaje nuevo' })
    expect(respuesta.status).toBe(200)

    const creado = prismaActual.tablas.chatMessage.find((m) => m.content === 'mensaje nuevo')!
    expect(creado.tenantId).toBe(TENANT_A)
    expect(creado.channelId).toBe(CANAL_A)
    expect(prismaActual.violaciones).toEqual([])
  })
})

describe('herramientas del agente', () => {
  it('buscar_persona no devuelve un lead ajeno', async () => {
    const resultado = await ejecutarConGuion([
      { nombre: 'buscar_persona', args: { nombre: 'Bruno Ajeno' } },
    ])

    expect(resultado.herramientas).toContain('buscar_persona')
    const respuestas = respuestasHerramientas.join(' ')
    expect(respuestas).toContain('encontrado')
    expect(respuestas).not.toContain('bruno@b.test')
    expect(respuestas).not.toContain(LEAD_B)
    expect(prismaActual.violaciones).toEqual([])
  })

  it('registrar_interaccion no escribe sobre un lead ajeno', async () => {
    const resultado = await ejecutarConGuion([
      { nombre: 'registrar_interaccion', args: { nombre: 'Bruno Ajeno', tipo: 'llamada', contenido: 'x' } },
    ])

    expect(resultado.herramientas).toEqual([])
    expect(prismaActual.tablas.interaction).toHaveLength(0)
    expect(respuestasHerramientas.join(' ')).toContain('No encontré a')
  })

  it('crear_nota no deja nota en la ficha de otro tenant', async () => {
    const resultado = await ejecutarConGuion([
      { nombre: 'crear_nota', args: { nombre: 'Bruno Ajeno', contenido: 'nota' } },
    ])

    expect(resultado.herramientas).toEqual([])
    expect(prismaActual.tablas.note).toHaveLength(0)
  })

  it('completar_tarea no cierra la tarea de otro tenant', async () => {
    const resultado = await ejecutarConGuion([
      { nombre: 'completar_tarea', args: { nombre: 'Bruno Ajeno', titulo: 'Llamar a Bruno' } },
    ])

    expect(resultado.herramientas).toEqual([])
    expect(tareaPorId(TAREA_B).completada).toBe(false)
    expect(tareaPorId(TAREA_B).fechaCompletado).toBeUndefined()
    expect(tareaPorId(TAREA_A).completada).toBe(false)
    expect(prismaActual.violaciones).toEqual([])
  })

  it('completar_tarea sí funciona dentro del propio tenant (control positivo)', async () => {
    const resultado = await ejecutarConGuion([
      { nombre: 'completar_tarea', args: { nombre: 'Ana Propia', titulo: 'Llamar a Ana' } },
    ])

    expect(resultado.herramientas).toContain('completar_tarea')
    expect(tareaPorId(TAREA_A).completada).toBe(true)
    expect(prismaActual.violaciones).toEqual([])
  })
})

/**
 * Canario del detector: la misma consulta que hace `buscarPersona`, una con el
 * `tenantId` que usa producción y otra con el fallo inyectado. Si el detector
 * dejara de avisar, este bloque falla; si alguien quita el filtro en el código,
 * fallan los casos de arriba.
 */
describe('canario del detector', () => {
  const buscar = (where: Record<string, unknown>) =>
    prismaActual.prisma.lead.findMany({ where: { nombre: { contains: 'Bruno', mode: 'insensitive' }, ...where } })

  it('con filtro no hay fuga ni violación', async () => {
    expect(await buscar({ tenantId: TENANT_A })).toEqual([])
    expect(prismaActual.violaciones).toEqual([])
  })

  it('sin filtro aparece el lead ajeno, se anota la violación y la invariante se rompe', async () => {
    const leads = await buscar({})

    expect(leads).toHaveLength(1)
    expect(leads[0]).toMatchObject({ id: LEAD_B, tenantId: TENANT_B, email: 'bruno@b.test' })
    expect(prismaActual.violaciones).toHaveLength(1)
    expect(prismaActual.violaciones[0]).toMatchObject({ tabla: 'lead', metodo: 'findMany' })

    // La comprobación que cierra cada caso de la suite falla aquí: la fuga se
    // ve, en lugar de pasar por buena.
    expect(() => expect(prismaActual.violaciones).toEqual([])).toThrow()
  })
})
