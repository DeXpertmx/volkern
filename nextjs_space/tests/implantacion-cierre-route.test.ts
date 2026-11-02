// @vitest-environment node
/**
 * Cierre del alta en la API.
 *
 * Lo que se prueba es que la firma no sea un botón: el servidor recalcula el
 * checklist contra la cuenta antes de aceptarla, no deja llegar a «listo» sin
 * firmar, y retirarla devuelve el alta al paso de datos sin borrar nada más.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  implantacionTenant: { findUnique: vi.fn(), update: vi.fn() },
  tenant: { findUnique: vi.fn() },
  tenantFeature: { findMany: vi.fn() },
  pipeline: { count: vi.fn() },
  role: { count: vi.fn() },
  tasaImpuesto: { count: vi.fn() },
  configuracionFiscalEmisor: { count: vi.fn() },
  configuracion: { findUnique: vi.fn() },
  task: { count: vi.fn() },
  importLog: { count: vi.fn() },
  lead: { count: vi.fn() },
  contact: { count: vi.fn() },
  servicio: { count: vi.fn() },
  auditLog: { create: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ prisma: mocks, default: mocks }))
vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (request: any) =>
    handler(request, { valid: true, tenant: { id: 't1' }, user: { id: 'u1' } }),
}))
// Se conserva el catálogo real (`ALL_MODULES`): `recomendar.ts` lo recorre al
// cargar y un mock parcial lo dejaría sin inicializar.
vi.mock('@/lib/plans', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/plans')>()),
  getPlanConfig: vi.fn(async () => ({ nombre: 'Básico', modules: [], limites: { users: 5 } })),
}))
vi.mock('@/lib/tenant-modules', () => ({ resolverModulosTenant: vi.fn(async () => []) }))

const { GET, PATCH } = await import('@/app/api/implantacion/route')

const CRITERIO = 'Veinte oportunidades creadas y la primera cotización enviada'

const FIRMA = {
  criterioExito: CRITERIO,
  plantillasRevisadas: true as const,
  firmadoEn: '2026-11-01T09:00:00.000Z',
  firmadoPor: 'u1',
}

const registro = (over: Record<string, unknown> = {}) => ({
  estado: 'datos',
  descubrimiento: {
    respuestas: { que_vende: ['servicios'], a_quien: ['empresas'], ciclo: ['menos_7d'] },
    noSe: [],
    notas: '',
    version: 1,
  },
  recomendacion: { modulos: [] },
  aceptados: ['cotizaciones'],
  descartados: [],
  informes: ['embudo_etapas', 'prevision_caja'],
  entregablesAplicadosEn: new Date('2026-10-31T10:00:00.000Z'),
  plan: {
    pipelineId: 'p1',
    roles: { seleccion: ['direccion'] },
    fiscal: { moneda: 'EUR' },
    marca: { seleccion: ['web'], tareas: [{ id: 'task-web' }] },
  },
  firmaGoLive: null,
  ...over,
})

const patch = (cuerpo: unknown) =>
  new Request('http://localhost/api/implantacion', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  }) as any

const get = () => new Request('http://localhost/api/implantacion') as any

beforeEach(() => {
  vi.clearAllMocks()

  mocks.implantacionTenant.findUnique.mockResolvedValue(registro())
  mocks.implantacionTenant.update.mockResolvedValue({})

  mocks.tenant.findUnique.mockResolvedValue({
    plan: 'basico',
    enabledModules: [],
    subdomain: null,
    brandingConfig: { primaryColor: '#112233' },
  })
  mocks.tenantFeature.findMany.mockResolvedValue([])

  mocks.pipeline.count.mockResolvedValue(1)
  mocks.role.count.mockResolvedValue(1)
  mocks.tasaImpuesto.count.mockResolvedValue(1)
  mocks.configuracionFiscalEmisor.count.mockResolvedValue(1)
  mocks.configuracion.findUnique.mockResolvedValue({ valor: 'Estudio Norte' })
  mocks.task.count.mockResolvedValue(1)
  // Una importación confirmada basta para «Datos cargados»; sin ella, la cuenta
  // tendría que tener registros propios y el checklist no cerraría.
  mocks.importLog.count.mockResolvedValue(1)
  mocks.lead.count.mockResolvedValue(0)
  mocks.contact.count.mockResolvedValue(0)
  mocks.servicio.count.mockResolvedValue(0)

  mocks.auditLog.create.mockResolvedValue({})
})

describe('GET /api/implantacion · firma', () => {
  it('sin firma, el final del alta sigue abierto', async () => {
    const res = await GET(get())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.firma).toBeNull()
    expect(json.checklist.find((t: any) => t.id === 'plantillas').completada).toBe(false)
    expect(json.checklist.find((t: any) => t.id === 'go_live').completada).toBe(false)
  })

  it('con la firma guardada, el checklist llega cerrado', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue(registro({ firmaGoLive: FIRMA }))

    const res = await GET(get())
    const json = await res.json()

    expect(json.firma).toMatchObject({ criterioExito: CRITERIO, firmadoPor: 'u1' })
    expect(json.checklist.every((t: any) => t.completada)).toBe(true)
  })
})

describe('PATCH /api/implantacion · firmar el go-live', () => {
  it('firma cuando todo está cumplido y deja el alta en «listo»', async () => {
    const res = await PATCH(
      patch({ firma: { criterioExito: CRITERIO, plantillasRevisadas: true } }),
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.estado).toBe('listo')
    expect(json.firma).toMatchObject({
      criterioExito: CRITERIO,
      plantillasRevisadas: true,
      firmadoPor: 'u1',
    })
    expect(json.checklist.every((t: any) => t.completada)).toBe(true)

    const data = mocks.implantacionTenant.update.mock.calls[0][0].data
    expect(data.estado).toBe('listo')
    expect(data.completadoEn).toBeInstanceOf(Date)
    expect(data.firmaGoLive).toMatchObject({ criterioExito: CRITERIO, plantillasRevisadas: true })

    expect(mocks.auditLog.create.mock.calls[0][0].data.accion).toBe('implantacion_go_live')
  })

  it('no firma con un criterio que no se puede medir', async () => {
    const res = await PATCH(patch({ firma: { criterioExito: 'vender más', plantillasRevisadas: true } }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('demasiado corto')
    expect(mocks.implantacionTenant.update).not.toHaveBeenCalled()
  })

  it('no firma sin confirmar las plantillas', async () => {
    const res = await PATCH(patch({ firma: { criterioExito: CRITERIO } }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('plantillas')
    expect(mocks.implantacionTenant.update).not.toHaveBeenCalled()
  })

  it('no firma si una pieza se borró de la cuenta, y dice cuál', async () => {
    // El embudo ya no existe: la firma no puede taparlo con lo que diga la pantalla.
    mocks.pipeline.count.mockResolvedValue(0)

    const res = await PATCH(
      patch({ firma: { criterioExito: CRITERIO, plantillasRevisadas: true } }),
    )
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.pendientes).toContain('Embudo aprobado')
    expect(mocks.implantacionTenant.update).not.toHaveBeenCalled()
  })

  it('no firma desde personalización: el alta tiene que haber pasado a datos', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue(registro({ estado: 'personalizacion' }))

    const res = await PATCH(
      patch({ firma: { criterioExito: CRITERIO, plantillasRevisadas: true } }),
    )
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toContain('paso de datos')
    expect(mocks.implantacionTenant.update).not.toHaveBeenCalled()
  })

  it('no vuelve a firmar un go-live ya firmado', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue(registro({ firmaGoLive: FIRMA }))

    const res = await PATCH(
      patch({ firma: { criterioExito: 'Otro criterio distinto al firmado', plantillasRevisadas: true } }),
    )

    expect(res.status).toBe(409)
    expect(mocks.implantacionTenant.update).not.toHaveBeenCalled()
  })

  it('el último paso no se alcanza cambiando el estado', async () => {
    const res = await PATCH(patch({ estado: 'listo' }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toContain('firmando el go-live')
    expect(mocks.implantacionTenant.update).not.toHaveBeenCalled()
  })

  it('con la firma puesta no se retrocede sin retirarla', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue(
      registro({ estado: 'listo', firmaGoLive: FIRMA }),
    )

    const res = await PATCH(patch({ estado: 'datos' }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toContain('retira la firma')
    expect(mocks.implantacionTenant.update).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/implantacion · retirar la firma', () => {
  it('devuelve el alta al paso de datos y deja el final abierto', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue(
      registro({ estado: 'listo', firmaGoLive: FIRMA }),
    )

    const res = await PATCH(patch({ retirarFirma: true }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.estado).toBe('datos')
    expect(json.firma).toBeNull()
    expect(json.checklist.find((t: any) => t.id === 'go_live').completada).toBe(false)

    const data = mocks.implantacionTenant.update.mock.calls[0][0].data
    expect(data.estado).toBe('datos')
    expect(data.completadoEn).toBeNull()

    expect(mocks.auditLog.create.mock.calls[0][0].data.accion).toBe(
      'implantacion_go_live_deshacer',
    )
  })

  it('no retira una firma que no existe', async () => {
    const res = await PATCH(patch({ retirarFirma: true }))

    expect(res.status).toBe(409)
    expect(mocks.implantacionTenant.update).not.toHaveBeenCalled()
  })
})

describe('checklist · datos cargados', () => {
  it('sin datos en la cuenta la línea sigue abierta, aunque el alta esté en el paso', async () => {
    mocks.importLog.count.mockResolvedValue(0)

    const res = await GET(get())
    const json = await res.json()

    const datos = json.checklist.find((t: any) => t.id === 'datos')
    expect(datos.completada).toBe(false)
    expect(datos.detalle).toContain('no al llegar al paso')
  })

  it('una importación confirmada la cierra, y solo cuentan las confirmadas', async () => {
    mocks.importLog.count.mockResolvedValue(2)

    const res = await GET(get())
    const json = await res.json()

    const datos = json.checklist.find((t: any) => t.id === 'datos')
    expect(datos.completada).toBe(true)
    expect(datos.detalle).toContain('2 importaciones confirmadas')
    // Ni previsualizaciones ni lotes deshechos: el filtro va en la consulta.
    expect(mocks.importLog.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', mode: 'commit', revertedAt: null, recordsImported: { gt: 0 } },
    })
  })

  it('los registros creados a mano también cuentan como datos cargados', async () => {
    mocks.importLog.count.mockResolvedValue(0)
    mocks.lead.count.mockResolvedValue(4)
    mocks.contact.count.mockResolvedValue(2)

    const res = await GET(get())
    const json = await res.json()

    const datos = json.checklist.find((t: any) => t.id === 'datos')
    expect(datos.completada).toBe(true)
    expect(datos.detalle).toContain('6 registros')
  })

  it('no deja firmar si todavía no hay datos', async () => {
    mocks.importLog.count.mockResolvedValue(0)

    const res = await PATCH(patch({ firma: { criterioExito: CRITERIO, plantillasRevisadas: true } }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.pendientes).toContain('Datos cargados')
    expect(mocks.implantacionTenant.update).not.toHaveBeenCalled()
  })
})
