/**
 * P1 — Permisos de las herramientas del agente CRM.
 *
 * Demuestra que la autorización se decide en backend antes de ejecutar: el rol
 * sale de la BD y una herramienta sin permiso no llega a tocar datos, aunque el
 * "modelo" la haya pedido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reiniciarPrisma, prismaActual } from '../ayuda/prisma-en-memoria'

const TENANT = 'tenant-a'
const LEAD = 'lead-a'

vi.mock('@/lib/db', async () => {
  const { prismaActual } = await import('../ayuda/prisma-en-memoria')
  const delegado = new Proxy(
    {},
    { get: (_t, prop: string) => (prismaActual.prisma as any)[prop] }
  )
  return { prisma: delegado, globalPrisma: delegado, getTenantDb: async () => delegado }
})

const guion: Array<{ nombre: string; args: Record<string, any> }> = []
const respuestasHerramientas: string[] = []

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithToolLoop: async (
    _mensajes: unknown,
    _herramientas: unknown,
    ejecutar: (nombre: string, args: Record<string, any>) => Promise<string>
  ) => {
    for (const paso of guion) respuestasHerramientas.push(await ejecutar(paso.nombre, paso.args))
    return { choices: [{ message: { content: 'Resumen' } }] }
  },
}))

const ROL_SOLO_LECTURA = { nombre: 'Solo lectura', permisos: { leads: { ver: true } } }
const ROL_COMERCIAL = { nombre: 'Comercial', permisos: { leads: { ver: true, crear: true, editar: true } } }
const ROL_CATALOGO = { nombre: 'Catálogo', permisos: { catalogo: { ver: true } } }
const ROL_SUPERADMIN = { nombre: 'Superadmin', permisos: {} }

function sembrar() {
  reiniciarPrisma({
    tenant: [{ id: TENANT, nombre: 'Inmobiliaria A' }],
    user: [
      { id: 'u-lectura', tenantId: TENANT, name: 'Lola', role: ROL_SOLO_LECTURA },
      { id: 'u-comercial', tenantId: TENANT, name: 'Carla', role: ROL_COMERCIAL },
      { id: 'u-catalogo', tenantId: TENANT, name: 'Catálogo', role: ROL_CATALOGO },
      { id: 'u-sin-rol', tenantId: TENANT, name: 'Sin rol', role: null },
      { id: 'u-super', tenantId: TENANT, name: 'Super', role: ROL_SUPERADMIN },
      { id: 'u-otro-tenant', tenantId: 'tenant-b', name: 'Ajeno', role: ROL_COMERCIAL },
    ],
    lead: [{ id: LEAD, tenantId: TENANT, nombre: 'Ana Propia', email: 'ana@a.test' }],
    task: [],
    note: [],
    interaction: [],
    contact: [],
    chatChannel: [],
    chatMessage: [],
    catalogoItem: [],
  })
}

async function pedirHerramienta(
  userId: string,
  herramienta: string,
  args: Record<string, any> = { nombre: 'Ana Propia' }
) {
  guion.length = 0
  respuestasHerramientas.length = 0
  guion.push({ nombre: herramienta, args })
  const { ejecutarAgenteCrm } = await import('@/lib/agents/crm-tool-agent')
  return ejecutarAgenteCrm({ message: 'prueba de permisos', tenantId: TENANT, userId })
}

beforeEach(() => {
  sembrar()
  guion.length = 0
  respuestasHerramientas.length = 0
})

describe('herramienta de escritura sin permiso', () => {
  it('un rol de solo lectura no puede crear una nota', async () => {
    const resultado = await pedirHerramienta('u-lectura', 'crear_nota', {
      nombre: 'Ana Propia',
      contenido: 'no debería guardarse',
    })

    expect(resultado.herramientas).toEqual([])
    expect(prismaActual.tablas.note).toHaveLength(0)
    expect(respuestasHerramientas.join(' ')).toContain('sin_permiso')
  })

  it('un usuario sin rol tampoco (denegar por defecto)', async () => {
    const resultado = await pedirHerramienta('u-sin-rol', 'crear_nota', {
      nombre: 'Ana Propia',
      contenido: 'tampoco',
    })

    expect(resultado.herramientas).toEqual([])
    expect(prismaActual.tablas.note).toHaveLength(0)
    expect(respuestasHerramientas.join(' ')).toContain('sin_permiso')
  })

  it('un usuario de otro tenant no resuelve y se deniega', async () => {
    const resultado = await pedirHerramienta('u-otro-tenant', 'buscar_persona')

    expect(resultado.herramientas).toEqual([])
    expect(respuestasHerramientas.join(' ')).toContain('sin_permiso')
  })

  it('una herramienta inventada por el modelo se deniega aunque el rol tenga todo', async () => {
    const resultado = await pedirHerramienta('u-super', 'borrar_todo_el_crm', {})

    expect(resultado.herramientas).toEqual([])
    expect(respuestasHerramientas.join(' ')).toContain('sin_permiso')
  })
})

describe('herramienta de lectura', () => {
  it('el rol de solo lectura sí puede buscar personas', async () => {
    const resultado = await pedirHerramienta('u-lectura', 'buscar_persona')

    expect(resultado.herramientas).toContain('buscar_persona')
    const respuesta = respuestasHerramientas.join(' ')
    expect(respuesta).toContain('Ana Propia')
    expect(respuesta).not.toContain('sin_permiso')
  })
})

describe('el catálogo tiene su propio permiso', () => {
  it('leads.ver no autoriza a buscar inmuebles', async () => {
    // El rol comercial ve leads, pero el catálogo es otra llave: no se hereda.
    const resultado = await pedirHerramienta('u-comercial', 'buscar_propiedades', {})

    expect(resultado.herramientas).toEqual([])
    expect(respuestasHerramientas.join(' ')).toContain('sin_permiso')
  })

  it('catalogo.ver sí, aunque el rol no tenga leads', async () => {
    const resultado = await pedirHerramienta('u-catalogo', 'buscar_propiedades', {})

    expect(resultado.herramientas).toContain('buscar_propiedades')
    expect(respuestasHerramientas.join(' ')).not.toContain('sin_permiso')
  })
})

describe('con permiso, la herramienta se ejecuta (control positivo)', () => {
  it('un comercial con leads.editar crea la nota', async () => {
    const resultado = await pedirHerramienta('u-comercial', 'crear_nota', {
      nombre: 'Ana Propia',
      contenido: 'seguimiento',
    })

    expect(resultado.herramientas).toContain('crear_nota')
    expect(prismaActual.tablas.note).toHaveLength(1)
    // La nota cuelga del lead de su tenant (la tabla no guarda tenantId propio).
    expect(prismaActual.tablas.note[0].leadId).toBe(LEAD)
  })

  it('Superadmin pasa aunque su JSON de permisos esté vacío', async () => {
    const resultado = await pedirHerramienta('u-super', 'crear_nota', {
      nombre: 'Ana Propia',
      contenido: 'nota del superadmin',
    })

    expect(resultado.herramientas).toContain('crear_nota')
    expect(prismaActual.tablas.note).toHaveLength(1)
  })
})

describe('coste de la comprobación', () => {
  it('lee el rol una sola vez por mensaje aunque ejecute varias herramientas', async () => {
    guion.length = 0
    respuestasHerramientas.length = 0
    guion.push(
      { nombre: 'buscar_persona', args: { nombre: 'Ana Propia' } },
      { nombre: 'crear_nota', args: { nombre: 'Ana Propia', contenido: 'seguimiento' } }
    )

    const { ejecutarAgenteCrm } = await import('@/lib/agents/crm-tool-agent')
    const resultado = await ejecutarAgenteCrm({
      message: 'dos herramientas en un mensaje',
      tenantId: TENANT,
      userId: 'u-comercial',
    })

    expect(resultado.herramientas).toEqual(['buscar_persona', 'crear_nota'])
    // Solo la lectura del rol: `select.role` distingue esa consulta de la del
    // timezone del usuario o de las que hacen las skills.
    const lecturasDeRol = prismaActual.llamadas.filter(
      (l) => l.tabla === 'user' && Boolean((l.args as any)?.select?.role)
    )
    expect(lecturasDeRol).toHaveLength(1)
  })
})

describe('cobertura de la política', () => {
  it('las herramientas del agente y las políticas son el mismo conjunto', async () => {
    const { HERRAMIENTAS } = await import('@/lib/agents/crm-tool-agent')
    const { PERMISOS_HERRAMIENTAS } = await import('@/lib/agents/crm-tool-permissions')

    const expuestas = HERRAMIENTAS.map((h) => h.function.name).sort()
    const conPolitica = Object.keys(PERMISOS_HERRAMIENTAS).sort()

    // Igualdad en los dos sentidos: ninguna ejecutable sin permiso declarado y
    // ninguna política huérfana que dé falsa sensación de cobertura.
    expect(expuestas).toEqual(conPolitica)
  })
})
