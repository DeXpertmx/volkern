// @vitest-environment node
/**
 * Personalización del alta: la ruta de roles.
 *
 * Lo que se prueba es lo que puede dejar el alta mintiendo o quitarle acceso a
 * alguien: que aplicar no borre la pieza del embudo que ya estaba guardada, que
 * sin descubrimiento no se cree nada, y que deshacer solo borre lo que el alta
 * creó y nadie usa.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  implantacionTenant: { findUnique: vi.fn(), update: vi.fn() },
  role: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  tenant: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ prisma: mocks, default: mocks }))
vi.mock('@/lib/plans', () => ({
  getPlanConfig: vi.fn(async () => ({ nombre: 'Básico', limites: { users: 5 }, modules: [] })),
}))
vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (request: any) =>
    handler(request, { valid: true, tenant: { id: 't1' }, user: { id: 'u1' } }),
}))

const { GET, POST, DELETE } = await import('@/app/api/implantacion/roles/route')

const DESCUBRIMIENTO = {
  respuestas: { equipo: ['2_5'], dolor: ['leads_frios'], que_vende: ['servicios'] },
  noSe: [],
  notas: '',
  version: 1,
}

function postCon(body: unknown) {
  return new Request('http://localhost/api/implantacion/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

const borrar = () => new Request('http://localhost/api/implantacion/roles', { method: 'DELETE' }) as any

beforeEach(() => {
  vi.clearAllMocks()
  mocks.implantacionTenant.findUnique.mockResolvedValue({
    descubrimiento: DESCUBRIMIENTO,
    plan: null,
    estado: 'personalizacion',
  })
  mocks.implantacionTenant.update.mockResolvedValue({})
  mocks.tenant.findUnique.mockResolvedValue({ plan: 'basico' })
  mocks.auditLog.create.mockResolvedValue({})
  mocks.role.findMany.mockResolvedValue([])
  mocks.role.findFirst.mockResolvedValue({ orden: 2 })
  mocks.role.create.mockImplementation(async ({ data }: any) => ({ id: `r-${data.nombre}` }))
  mocks.role.update.mockResolvedValue({})
  mocks.role.delete.mockResolvedValue({})
})

describe('GET /api/implantacion/roles', () => {
  it('propone según el perfil y trae como selección lo propuesto', async () => {
    const res = await GET(new Request('http://localhost/api/implantacion/roles') as any)
    const body = await res.json()

    expect(res.status).toBe(200)
    const propuestos = body.propuesta.roles.filter((r: any) => r.propuesto).map((r: any) => r.id)
    expect(propuestos).toContain('direccion')
    expect(propuestos).toContain('comercial')
    expect(propuestos).toContain('preventa')

    expect(body.seleccion.map((s: any) => s.id)).toEqual(propuestos)
    expect(body.equipo).toEqual({ estimado: 2, limiteUsuarios: 5 })
    expect(body.deshacerDisponible).toBe(false)
  })

  it('informa de lo que ya existe en la cuenta, con cuántas personas lo usan', async () => {
    mocks.role.findMany.mockResolvedValue([
      { id: 'r1', nombre: 'Comercial', permisos: {}, _count: { users: 4 } },
    ])

    const res = await GET(new Request('http://localhost/api/implantacion/roles') as any)
    const body = await res.json()

    expect(body.enCuenta).toHaveLength(1)
    expect(body.enCuenta[0]).toMatchObject({ roleId: 'r1', nombre: 'Comercial', usuarios: 4 })
  })

  it('respeta la selección guardada en vez de reimponer la propuesta', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      descubrimiento: DESCUBRIMIENTO,
      plan: { roles: { seleccion: [{ id: 'direccion', veTodo: false }], creados: [] } },
      estado: 'personalizacion',
    })

    const body = await (await GET(new Request('http://localhost/api/implantacion/roles') as any)).json()
    expect(body.seleccion).toEqual([{ id: 'direccion', veTodo: false }])
  })
})

describe('POST /api/implantacion/roles', () => {
  it('crea los roles y guarda la pieza sin borrar el embudo ya aplicado', async () => {
    const EMBUDO = { nombre: 'Ventas', etapas: [{ nombre: 'Contacto', criterio: 'x', probabilidad: 100 }] }
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      descubrimiento: DESCUBRIMIENTO,
      plan: { embudo: EMBUDO, pipelineId: 'p1', aplicadoEn: '2026-11-01T09:00:00.000Z' },
      estado: 'personalizacion',
    })

    const res = await POST(
      postCon({ seleccion: [{ id: 'direccion', veTodo: true }, { id: 'comercial', veTodo: false }] }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.resultados.map((r: any) => r.estado)).toEqual(['creado', 'creado'])

    const plan = mocks.implantacionTenant.update.mock.calls[0][0].data.plan
    expect(plan.embudo).toEqual(EMBUDO)
    expect(plan.pipelineId).toBe('p1')
    expect(plan.roles.seleccion).toHaveLength(2)
    expect(plan.roles.creados).toHaveLength(2)

    expect(mocks.auditLog.create.mock.calls[0][0].data.accion).toBe('implantacion_roles')
  })

  it('acumula los roles creados al reaplicar, para que deshacer los alcance todos', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      descubrimiento: DESCUBRIMIENTO,
      plan: { roles: { seleccion: [{ id: 'direccion', veTodo: true }], creados: [{ id: 'direccion', roleId: 'r-previa' }] } },
      estado: 'personalizacion',
    })

    await POST(postCon({ seleccion: [{ id: 'direccion', veTodo: true }, { id: 'comercial', veTodo: false }] }))

    // El rol que se había creado antes y ya no existe se sustituye por el nuevo:
    // dejar el id muerto haría que deshacer apuntara a la nada.
    const plan = mocks.implantacionTenant.update.mock.calls[0][0].data.plan
    expect(plan.roles.creados).toEqual([
      { id: 'direccion', roleId: 'r-Dirección' },
      { id: 'comercial', roleId: 'r-Comercial' },
    ])
  })

  it('sin descubrimiento no crea nada: no hay perfil del que partir', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue(null)

    const res = await POST(postCon({ seleccion: ['direccion'] }))
    expect(res.status).toBe(409)
    expect(mocks.role.create).not.toHaveBeenCalled()
  })

  it('con la selección vacía devuelve 400 y el motivo', async () => {
    const res = await POST(postCon({ seleccion: [] }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('al menos un rol')
    expect(mocks.role.create).not.toHaveBeenCalled()
  })

  it('acepta ids sueltos y descarta los que no existen sin perder los demás', async () => {
    const res = await POST(postCon({ seleccion: ['inventado', 'comercial'] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.seleccion).toEqual([{ id: 'comercial', veTodo: false }])
    expect(body.avisos.join(' ')).toContain('no existe')
  })
})

describe('DELETE /api/implantacion/roles', () => {
  it('sin roles creados por el alta no hay nada que deshacer', async () => {
    const res = await DELETE(borrar())
    expect(res.status).toBe(409)
    expect(mocks.role.delete).not.toHaveBeenCalled()
  })

  it('borra lo vacío y conserva lo que tiene personas, dejando constancia', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      plan: {
        embudo: { nombre: 'Ventas', etapas: [] },
        roles: {
          seleccion: [
            { id: 'comercial', veTodo: false },
            { id: 'direccion', veTodo: true },
          ],
          creados: [
            { id: 'comercial', roleId: 'r1' },
            { id: 'direccion', roleId: 'r2' },
          ],
        },
      },
    })
    mocks.role.findFirst
      .mockResolvedValueOnce({ id: 'r1', nombre: 'Comercial', _count: { users: 0 } })
      .mockResolvedValueOnce({ id: 'r2', nombre: 'Dirección', _count: { users: 2 } })

    const res = await DELETE(borrar())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.borrados).toEqual(['r1'])
    expect(body.conservados).toEqual([{ roleId: 'r2', nombre: 'Dirección', usuarios: 2 }])

    const plan = mocks.implantacionTenant.update.mock.calls[0][0].data.plan
    expect(plan.embudo).toBeDefined()
    // Solo sigue marcado lo que no se pudo borrar: si esa persona se va,
    // deshacer vuelve a funcionar.
    expect(plan.roles.creados).toEqual([{ id: 'direccion', roleId: 'r2' }])
    expect(mocks.auditLog.create.mock.calls[0][0].data.accion).toBe('implantacion_roles_deshacer')
  })
})
