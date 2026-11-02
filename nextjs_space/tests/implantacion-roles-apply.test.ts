// @vitest-environment node
/**
 * Personalización del alta: crear los roles sin pisar nada.
 *
 * Los casos que importan son los que pueden quitarle acceso a alguien: que
 * completar un rol existente no borre lo que ya tenía, que un rol con el
 * wildcard se quede como está, y que deshacer no borre un rol que alguien usa.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  role: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({ prisma: mocks, default: mocks }))

const { aplicarRoles, deshacerRoles } = await import('@/lib/implantacion/aplicar-roles')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.role.findMany.mockResolvedValue([])
  mocks.role.findFirst.mockResolvedValue({ orden: 3 })
  mocks.role.create.mockImplementation(async ({ data }: any) => ({ id: `r-${data.nombre}` }))
  mocks.role.update.mockResolvedValue({})
  mocks.role.delete.mockResolvedValue({})
})

describe('aplicarRoles — crear', () => {
  it('crea los que no existen con el orden siguiente y el alcance elegido', async () => {
    const resultado = await aplicarRoles('t1', [
      { id: 'direccion', veTodo: true },
      { id: 'comercial', veTodo: false },
    ])

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return

    expect(resultado.resultados.map((r) => r.estado)).toEqual(['creado', 'creado'])
    expect(mocks.role.create).toHaveBeenCalledTimes(2)

    const primero = mocks.role.create.mock.calls[0][0].data
    expect(primero).toMatchObject({ tenantId: 't1', nombre: 'Dirección', orden: 4 })
    expect(primero.permisos.leads.ver_todos).toBe(true)

    const segundo = mocks.role.create.mock.calls[1][0].data
    expect(segundo).toMatchObject({ nombre: 'Comercial', orden: 5 })
    expect(segundo.permisos.leads.ver_todos).toBeUndefined()
  })

  it('no crea nada si no hay selección', async () => {
    const resultado = await aplicarRoles('t1', [])
    expect(resultado.ok).toBe(false)
    expect(mocks.role.create).not.toHaveBeenCalled()
  })
})

describe('aplicarRoles — completar sin retirar', () => {
  it('añade lo que falta y respeta lo que el cliente ya había puesto', async () => {
    mocks.role.findMany.mockResolvedValue([
      {
        id: 'r1',
        nombre: 'Comercial',
        // Un permiso propio que el catálogo no contempla: no puede desaparecer.
        permisos: { leads: { ver: true }, campanas: { ver: true, enviar: true } },
        _count: { users: 2 },
      },
    ])

    const resultado = await aplicarRoles('t1', [{ id: 'comercial', veTodo: true }])

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return

    expect(resultado.resultados[0]).toMatchObject({ estado: 'completado', usuarios: 2 })
    expect(resultado.resultados[0].anadidos).toContain('leads.ver_todos')

    const permisos = mocks.role.update.mock.calls[0][0].data.permisos
    expect(permisos.campanas).toEqual({ ver: true, enviar: true })
    // Se le añade el resto del diseño de «Comercial» (crear/editar) y el alcance
    // elegido, pero `campanas` sigue donde estaba.
    expect(permisos.leads).toEqual({ ver: true, ver_todos: true, crear: true, editar: true })
    expect(mocks.role.create).not.toHaveBeenCalled()
  })

  it('si ya lo tenía todo, no toca la fila', async () => {
    mocks.role.findMany.mockResolvedValue([
      {
        id: 'r1',
        nombre: 'Dirección',
        permisos: {
          leads: { ver: true, ver_todos: true, crear: true, editar: true, asignar: true, exportar: true },
          citas: { ver: true },
          analytics: { ver: true, exportar: true },
          mensajes: { ver: true },
          configuracion: { ver: true },
          equipo: { ver: true, invitar: true },
        },
        _count: { users: 0 },
      },
    ])

    const resultado = await aplicarRoles('t1', [{ id: 'direccion', veTodo: true }])

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.resultados[0].estado).toBe('sin_cambios')
    expect(mocks.role.update).not.toHaveBeenCalled()
  })

  it('un rol con el wildcard concede todo: no se le añade ruido ni se le toca', async () => {
    mocks.role.findMany.mockResolvedValue([
      { id: 'r1', nombre: 'Preventa', permisos: { all: true }, _count: { users: 1 } },
    ])

    const resultado = await aplicarRoles('t1', [{ id: 'preventa', veTodo: true }])

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.resultados[0].estado).toBe('sin_cambios')
    expect(mocks.role.update).not.toHaveBeenCalled()
  })
})

describe('deshacerRoles', () => {
  it('borra lo vacío y conserva lo que tiene personas, diciendo cuántas', async () => {
    mocks.role.findFirst
      .mockResolvedValueOnce({ id: 'r1', nombre: 'Comercial', _count: { users: 0 } })
      .mockResolvedValueOnce({ id: 'r2', nombre: 'Dirección', _count: { users: 3 } })
      .mockResolvedValueOnce(null)

    const resultado = await deshacerRoles('t1', [
      { id: 'comercial', roleId: 'r1' },
      { id: 'direccion', roleId: 'r2' },
      { id: 'preventa', roleId: 'r3' },
    ])

    expect(resultado.borrados).toEqual(['r1'])
    expect(resultado.conservados).toEqual([{ roleId: 'r2', nombre: 'Dirección', usuarios: 3 }])
    expect(resultado.ausentes).toEqual(['r3'])
    expect(mocks.role.delete).toHaveBeenCalledTimes(1)
    expect(mocks.role.delete).toHaveBeenCalledWith({ where: { id: 'r1' } })
  })
})
