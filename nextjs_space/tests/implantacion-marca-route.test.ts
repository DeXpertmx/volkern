// @vitest-environment node
/**
 * Personalización del alta: la ruta de marca y canales.
 *
 * Lo que se prueba es lo que puede dejar datos mal o duplicados: que el nombre
 * y el color vayan donde los lee la marca efectiva, que aplicar no borre las
 * piezas anteriores del plan, que no se dupliquen las tareas de un canal ya
 * montado y que deshacer no se lleve una tarea que el equipo ya hizo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  implantacionTenant: { findUnique: vi.fn(), update: vi.fn() },
  tenant: { findUnique: vi.fn(), update: vi.fn() },
  configuracion: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  lead: { groupBy: vi.fn() },
  socialPlatformConfig: { count: vi.fn() },
  tenantWhatsAppInstance: { count: vi.fn() },
  task: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  auditLog: { create: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ prisma: mocks, default: mocks }))
vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (request: any) =>
    handler(request, { valid: true, tenant: { id: 't1' }, user: { id: 'u1' } }),
}))

const { GET, POST, DELETE } = await import('@/app/api/implantacion/marca/route')

const DESCUBRIMIENTO = {
  respuestas: { que_vende: ['servicios'], origen: ['web', 'referidos'] },
  noSe: [],
  notas: '',
  version: 1,
}

function postCon(body: unknown) {
  return new Request('http://localhost/api/implantacion/marca', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

const borrar = () => new Request('http://localhost/api/implantacion/marca', { method: 'DELETE' }) as any

beforeEach(() => {
  vi.clearAllMocks()

  mocks.implantacionTenant.findUnique.mockResolvedValue({
    descubrimiento: DESCUBRIMIENTO,
    plan: null,
    estado: 'personalizacion',
  })
  mocks.implantacionTenant.update.mockResolvedValue({})

  mocks.tenant.findUnique.mockResolvedValue({
    nombre: 'Estudio Norte',
    brandingConfig: { showPoweredBy: true },
    emailDomainStatus: 'not_started',
  })
  mocks.tenant.update.mockResolvedValue({})

  mocks.configuracion.findUnique.mockResolvedValue(null)
  mocks.configuracion.upsert.mockResolvedValue({})
  mocks.configuracion.deleteMany.mockResolvedValue({ count: 1 })

  mocks.lead.groupBy.mockResolvedValue([])
  mocks.socialPlatformConfig.count.mockResolvedValue(0)
  mocks.tenantWhatsAppInstance.count.mockResolvedValue(0)

  mocks.task.count.mockResolvedValue(0)
  mocks.task.create.mockImplementation(async ({ data }: any) => ({ id: `task-${data.titulo}` }))
  mocks.task.findFirst.mockResolvedValue(null)
  mocks.task.delete.mockResolvedValue({})
  mocks.auditLog.create.mockResolvedValue({})
})

describe('GET /api/implantacion/marca', () => {
  it('propone el nombre de la cuenta, un color del sector y los canales declarados', async () => {
    const res = await GET(new Request('http://localhost/api/implantacion/marca') as any)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.propuesta.nombre.propuesto).toBe('Estudio Norte')
    expect(json.propuesta.color.propuesto).toBe('#1d4ed8')
    expect(json.seleccion.nombre).toBe('Estudio Norte')
    expect(json.seleccion.canales).toEqual(['referido', 'web'])
    // Sin logo no hay marca completa y la pantalla tiene que decirlo.
    expect(json.propuesta.falta.join(' ')).toContain('Logo')
  })

  it('cuenta los leads que ya hay por canal y las integraciones conectadas', async () => {
    mocks.lead.groupBy.mockResolvedValue([{ canal: 'evento', _count: { _all: 7 } }])
    mocks.tenantWhatsAppInstance.count.mockResolvedValue(1)

    const res = await GET(new Request('http://localhost/api/implantacion/marca') as any)
    const json = await res.json()

    expect(json.canales.find((c: any) => c.id === 'evento')?.leads).toBe(7)
    // Un canal con leads ya en la cuenta se propone aunque no lo haya marcado.
    expect(json.canales.find((c: any) => c.id === 'evento')?.propuesto).toBe(true)
    expect(json.canales.find((c: any) => c.id === 'whatsapp')?.conectado).toBe(true)
  })

  it('respeta la selección guardada en vez de reimponer la propuesta', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      descubrimiento: DESCUBRIMIENTO,
      plan: {
        fiscal: { moneda: 'EUR' },
        marca: {
          nombre: 'Norte Legal',
          color: '#112233',
          seleccion: ['evento'],
          tareas: [],
          aplicadoEn: '2026-10-31T10:00:00.000Z',
        },
      },
      estado: 'personalizacion',
    })

    const res = await GET(new Request('http://localhost/api/implantacion/marca') as any)
    const json = await res.json()

    expect(json.seleccion).toEqual({ nombre: 'Norte Legal', color: '#112233', canales: ['evento'] })
    expect(json.deshacerDisponible).toBe(true)
  })

  it('sin descubrimiento devuelve la propuesta mínima en vez de fallar', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue(null)

    const res = await GET(new Request('http://localhost/api/implantacion/marca') as any)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.canales.length).toBeGreaterThan(0)
  })
})

describe('POST /api/implantacion/marca', () => {
  it('escribe nombre y color donde los lee la marca, y crea una tarea por canal', async () => {
    const res = await POST(
      postCon({ nombre: 'Norte Legal', color: '#0f766e', canales: ['web', 'whatsapp'] }),
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)

    // Nombre: Configuracion.business_name (lo que lee getEffectiveBranding).
    expect(mocks.configuracion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_clave: { tenantId: 't1', clave: 'business_name' } },
        update: { valor: 'Norte Legal' },
      }),
    )

    // Color: brandingConfig, sin perder las claves que ya hubiera.
    expect(mocks.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          brandingConfig: expect.objectContaining({ showPoweredBy: true, primaryColor: '#0f766e' }),
        },
      }),
    )

    // Una tarea por canal, con su primer paso y fecha de vencimiento.
    expect(mocks.task.create).toHaveBeenCalledTimes(2)
    const primera = mocks.task.create.mock.calls[0][0].data
    expect(primera.tenantId).toBe('t1')
    expect(primera.asignadoA).toBe('u1')
    expect(primera.titulo).toContain('Poner en marcha')
    expect(primera.fechaVencimiento instanceof Date).toBe(true)

    expect(json.resultado.canales.map((c: any) => c.estado)).toEqual(['creada', 'creada'])
  })

  it('aplicar no borra las piezas anteriores del plan', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      descubrimiento: DESCUBRIMIENTO,
      plan: { pipelineId: 'p1', fiscal: { moneda: 'EUR' }, marca: { seleccion: ['web'] } },
      estado: 'personalizacion',
    })

    await POST(postCon({ nombre: 'Norte Legal', color: '#0f766e', canales: ['web'] }))

    const plan = mocks.implantacionTenant.update.mock.calls[0][0].data.plan
    expect(plan.pipelineId).toBe('p1')
    expect(plan.fiscal).toEqual({ moneda: 'EUR' })
    expect(plan.marca.aplicadoEn).toBeTruthy()
    expect(plan.marca.seleccion).toEqual(['web'])
  })

  it('no duplica la tarea de un canal que ya la tiene', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      descubrimiento: DESCUBRIMIENTO,
      plan: {
        marca: {
          seleccion: ['web'],
          tareas: [{ canal: 'web', id: 'task-vieja' }],
          anteriores: { nombre: null, color: null },
        },
      },
      estado: 'personalizacion',
    })
    mocks.task.count.mockResolvedValue(1)

    const res = await POST(postCon({ nombre: 'Norte Legal', canales: ['web'] }))
    const json = await res.json()

    expect(mocks.task.create).not.toHaveBeenCalled()
    expect(json.resultado.canales[0]).toMatchObject({ canal: 'web', id: 'task-vieja', estado: 'existente' })
  })

  it('al desmarcar un canal retira su tarea, salvo que ya esté hecha', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      descubrimiento: DESCUBRIMIENTO,
      plan: {
        marca: {
          seleccion: ['web', 'evento', 'telefono'],
          tareas: [
            { canal: 'evento', id: 'task-evento' },
            { canal: 'telefono', id: 'task-telefono' },
          ],
          anteriores: { nombre: null, color: null },
        },
      },
      estado: 'personalizacion',
    })
    mocks.task.count.mockResolvedValue(1)
    mocks.task.findFirst.mockImplementation(async ({ where }: any) =>
      where.id === 'task-telefono' ? { id: 'task-telefono', completada: true } : { id: where.id, completada: false },
    )

    const res = await POST(postCon({ nombre: 'Norte Legal', canales: ['web'] }))
    const json = await res.json()

    expect(json.resultado.borradas.map((c: any) => c.canal)).toEqual(['evento'])
    expect(json.resultado.conservadas.map((c: any) => c.canal)).toEqual(['telefono'])
    expect(mocks.task.delete).toHaveBeenCalledTimes(1)
  })

  it('un canal que no está en el catálogo se ignora y no crea nada', async () => {
    const res = await POST(postCon({ nombre: 'Norte Legal', canales: ['tiktok'] }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.task.create).not.toHaveBeenCalled()
    expect(json.avisos.join(' ')).toContain('tiktok')
  })

  it('sin descubrimiento no escribe nada: no hay perfil del que partir', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue(null)

    const res = await POST(postCon({ nombre: 'Norte Legal', canales: ['web'] }))

    expect(res.status).toBe(409)
    expect(mocks.configuracion.upsert).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/implantacion/marca', () => {
  it('sin nada aplicado no hay nada que deshacer', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({ plan: null })

    const res = await DELETE(borrar())

    expect(res.status).toBe(409)
  })

  it('restaura el nombre anterior, retira el color y borra tareas no hechas', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      plan: {
        marca: {
          nombre: 'Norte Legal',
          color: '#0f766e',
          seleccion: ['web'],
          tareas: [{ canal: 'web', id: 'task-web' }],
          anteriores: { nombre: 'Estudio Norte', color: null },
          aplicadoEn: '2026-10-31T10:00:00.000Z',
        },
      },
    })
    mocks.tenant.findUnique.mockResolvedValue({
      nombre: 'Estudio Norte',
      brandingConfig: { primaryColor: '#0f766e', showPoweredBy: true },
    })
    mocks.task.findFirst.mockResolvedValue({ id: 'task-web', completada: false })

    const res = await DELETE(borrar())
    const json = await res.json()

    expect(res.status).toBe(200)
    // El nombre vuelve al que había.
    expect(mocks.configuracion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { valor: 'Estudio Norte' } }),
    )
    // El color se retira porque antes no había: se borra la clave, no se deja vacía.
    const branding = mocks.tenant.update.mock.calls[0][0].data.brandingConfig
    expect(branding.primaryColor).toBeUndefined()
    expect(branding.showPoweredBy).toBe(true)

    expect(json.borradas.map((c: any) => c.canal)).toEqual(['web'])
    expect(mocks.task.delete).toHaveBeenCalledTimes(1)
  })

  it('sin nombre comercial previo se retira la fila en vez de dejar una cadena vacía', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      plan: {
        marca: {
          seleccion: [],
          tareas: [],
          anteriores: { nombre: null, color: null },
          aplicadoEn: '2026-10-31T10:00:00.000Z',
        },
      },
    })

    await DELETE(borrar())

    expect(mocks.configuracion.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', clave: 'business_name' },
    })
    expect(mocks.configuracion.upsert).not.toHaveBeenCalled()
  })
})
