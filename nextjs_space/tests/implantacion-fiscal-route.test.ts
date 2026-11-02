// @vitest-environment node
/**
 * Personalización del alta: la ruta de impuestos y moneda.
 *
 * Lo que se prueba es lo que puede dejar datos mal o duplicados: que el país
 * salga del emisor (no de la moneda heredada), que aplicar no borre las piezas
 * anteriores del plan, y que deshacer no se lleve un impuesto que ya está en
 * documentos.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  implantacionTenant: { findUnique: vi.fn(), update: vi.fn() },
  tasaImpuesto: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  configuracionFiscalEmisor: { findFirst: vi.fn() },
  tenant: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ prisma: mocks, default: mocks }))
vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (request: any) =>
    handler(request, { valid: true, tenant: { id: 't1' }, user: { id: 'u1' } }),
}))

const { GET, POST, DELETE } = await import('@/app/api/implantacion/fiscal/route')

const EMISOR = {
  pais: 'ES',
  razonSocial: 'Estudio Norte SL',
  idFiscal: 'B12345678',
  direccion: 'Calle Mayor 1',
  ciudad: 'Madrid',
  codigoPostal: '28013',
  email: 'hola@estudionorte.es',
}

const DESCUBRIMIENTO = {
  respuestas: { que_vende: ['servicios'] },
  noSe: [],
  notas: '',
  version: 1,
}

function postCon(body: unknown) {
  return new Request('http://localhost/api/implantacion/fiscal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

const borrar = () => new Request('http://localhost/api/implantacion/fiscal', { method: 'DELETE' }) as any

beforeEach(() => {
  vi.clearAllMocks()
  mocks.implantacionTenant.findUnique.mockResolvedValue({
    descubrimiento: DESCUBRIMIENTO,
    plan: null,
    estado: 'personalizacion',
  })
  mocks.implantacionTenant.update.mockResolvedValue({})
  mocks.tasaImpuesto.findMany.mockResolvedValue([])
  mocks.tasaImpuesto.findFirst.mockImplementation(async ({ where }: any) =>
    where?.esPrincipal ? EMISOR : null,
  )
  mocks.tasaImpuesto.create.mockImplementation(async ({ data }: any) => ({
    id: `t-${data.codigo}`,
    nombre: data.nombre,
  }))
  mocks.tasaImpuesto.update.mockResolvedValue({})
  mocks.tasaImpuesto.delete.mockResolvedValue({})
  mocks.tenant.findUnique.mockResolvedValue({ moneda: 'MXN' })
  mocks.tenant.update.mockResolvedValue({})
  mocks.auditLog.create.mockResolvedValue({})
  mocks.configuracionFiscalEmisor.findFirst.mockResolvedValue(EMISOR)
})

describe('GET /api/implantacion/fiscal', () => {
  it('toma el país del emisor y propone su tipo general con la moneda que le toca', async () => {
    const res = await GET(new Request('http://localhost/api/implantacion/fiscal') as any)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.propuesta.pais).toBe('ES')
    expect(body.seleccion).toEqual({ moneda: 'EUR', tasas: ['IVA_ES_GENERAL'] })
    // La cuenta está en MXN pero factura desde España: se dice, no se corrige solo.
    expect(body.propuesta.moneda).toMatchObject({ actual: 'MXN', recomendada: 'EUR', coincide: false })
    expect(body.monedas.length).toBeGreaterThan(3)
    expect(body.paises).toContainEqual({ codigo: 'ES', nombre: 'España' })
    expect(body.deshacerDisponible).toBe(false)
  })

  it('sin emisor ni tasas no sabe el país y lo dice', async () => {
    mocks.configuracionFiscalEmisor.findFirst.mockResolvedValue(null)
    mocks.tasaImpuesto.findFirst.mockResolvedValue(null)

    const body = await (await GET(new Request('http://localhost/api/implantacion/fiscal') as any)).json()

    expect(body.propuesta.pais).toBeNull()
    expect(body.propuesta.tasas).toEqual([])
    expect(body.propuesta.avisos.join(' ')).toContain('Sin país fiscal')
  })

  it('respeta la selección guardada en vez de reimponer la propuesta', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      descubrimiento: DESCUBRIMIENTO,
      plan: { fiscal: { moneda: 'USD', tasas: ['IVA_ES_GENERAL', 'IVA_ES_EXENTO'], creados: [] } },
      estado: 'personalizacion',
    })

    const body = await (await GET(new Request('http://localhost/api/implantacion/fiscal') as any)).json()
    expect(body.seleccion).toEqual({ moneda: 'USD', tasas: ['IVA_ES_GENERAL', 'IVA_ES_EXENTO'] })
  })
})

describe('POST /api/implantacion/fiscal', () => {
  it('crea los impuestos, cambia la moneda y guarda la pieza sin borrar las demás', async () => {
    const EMBUDO = { nombre: 'Ventas', etapas: [] }
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      descubrimiento: DESCUBRIMIENTO,
      plan: { embudo: EMBUDO, pipelineId: 'p1', roles: { seleccion: [{ id: 'direccion', veTodo: true }] } },
      estado: 'personalizacion',
    })

    const res = await POST(postCon({ moneda: 'EUR', tasas: ['IVA_ES_GENERAL'] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.resultado.tasas[0]).toMatchObject({ codigo: 'IVA_ES_GENERAL', estado: 'creada' })
    expect(body.resultado.moneda).toEqual({ anterior: 'MXN', actual: 'EUR', cambiada: true })

    const plan = mocks.implantacionTenant.update.mock.calls[0][0].data.plan
    expect(plan.embudo).toEqual(EMBUDO)
    expect(plan.roles.seleccion).toHaveLength(1)
    expect(plan.fiscal).toMatchObject({ pais: 'ES', moneda: 'EUR', tasas: ['IVA_ES_GENERAL'] })
    expect(plan.fiscal.creados).toEqual(['IVA_ES_GENERAL'])

    expect(mocks.auditLog.create.mock.calls[0][0].data.accion).toBe('implantacion_fiscal')
    expect(mocks.tenant.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { moneda: 'EUR', monedaInferida: 'EUR', monedaInferenciaSource: 'EXPLICIT' },
    })
  })

  it('sin descubrimiento no crea nada: no hay perfil del que partir', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue(null)

    const res = await POST(postCon({ moneda: 'EUR', tasas: ['IVA_ES_GENERAL'] }))
    expect(res.status).toBe(409)
    expect(mocks.tasaImpuesto.create).not.toHaveBeenCalled()
  })

  it('sin impuestos elegidos devuelve 400 y el motivo', async () => {
    const res = await POST(postCon({ moneda: 'EUR', tasas: [] }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('ningún impuesto')
    expect(mocks.tasaImpuesto.create).not.toHaveBeenCalled()
  })

  it('acumula lo creado y descarta tasas de otro país', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      descubrimiento: DESCUBRIMIENTO,
      plan: { fiscal: { creados: ['IVA_ES_REDUCIDO'] } },
      estado: 'personalizacion',
    })

    const res = await POST(postCon({ moneda: 'EUR', tasas: ['IVA_MX_GENERAL', 'IVA_ES_GENERAL'] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.avisos.join(' ')).toContain('IVA_MX_GENERAL')
    expect(body.resultado.tasas).toHaveLength(1)
    expect(body.resultado.tasas[0].codigo).toBe('IVA_ES_GENERAL')

    const plan = mocks.implantacionTenant.update.mock.calls[0][0].data.plan
    expect(plan.fiscal.creados).toEqual(['IVA_ES_REDUCIDO', 'IVA_ES_GENERAL'])
  })
})

describe('DELETE /api/implantacion/fiscal', () => {
  it('sin impuestos creados por el alta no hay nada que deshacer', async () => {
    const res = await DELETE(borrar())
    expect(res.status).toBe(409)
    expect(mocks.tasaImpuesto.delete).not.toHaveBeenCalled()
  })

  it('borra lo que no está en documentos y lo deja escrito', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      plan: {
        embudo: { nombre: 'Ventas', etapas: [] },
        fiscal: { moneda: 'EUR', tasas: ['IVA_ES_GENERAL', 'IVA_ES_REDUCIDO'], creados: ['IVA_ES_GENERAL', 'IVA_ES_REDUCIDO'] },
      },
    })
    mocks.tasaImpuesto.findFirst
      .mockResolvedValueOnce({
        id: 't1',
        nombre: 'IVA general ES',
        _count: { catalogoItems: 0, cotizacionItems: 0, ordenVentaItems: 0, contratoItems: 0 },
      })
      .mockResolvedValueOnce({
        id: 't2',
        nombre: 'IVA reducido ES',
        _count: { catalogoItems: 0, cotizacionItems: 2, ordenVentaItems: 0, contratoItems: 0 },
      })

    const res = await DELETE(borrar())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.borradas).toEqual(['IVA_ES_GENERAL'])
    expect(body.conservadas).toEqual([{ codigo: 'IVA_ES_REDUCIDO', nombre: 'IVA reducido ES', usos: 2 }])

    const plan = mocks.implantacionTenant.update.mock.calls[0][0].data.plan
    expect(plan.embudo).toBeDefined()
    expect(plan.fiscal.creados).toEqual(['IVA_ES_REDUCIDO'])
    expect(mocks.auditLog.create.mock.calls[0][0].data.accion).toBe('implantacion_fiscal_deshacer')
  })
})
