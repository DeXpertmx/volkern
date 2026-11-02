// @vitest-environment node
/**
 * Personalización del alta: la ruta que aplica el embudo.
 *
 * Los casos que importan son los que pueden romper datos o dejar el alta
 * mintiendo: no pisar un embudo con el mismo nombre, no pasar del tope del
 * plan, no tocar un embudo que ya tiene oportunidades, y que deshacer borre de
 * verdad el embudo del alta —pero no uno con trabajo dentro—.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  implantacionTenant: { findUnique: vi.fn(), update: vi.fn() },
  pipeline: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
  pipelineStage: { deleteMany: vi.fn(), createMany: vi.fn() },
  tenant: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ prisma: mocks, default: mocks }))
vi.mock('@/lib/pipelines-server', () => ({ getMaxPipelines: vi.fn(async () => 3) }))
vi.mock('@/lib/crm-entitlements', () => ({
  getCrmEntitlements: vi.fn(async () => ({
    tier: 'profesional',
    tierName: 'Profesional',
    legacy: false,
    seats: null,
    limits: { maxPipelines: 10 },
  })),
}))
vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (request: any) =>
    handler(request, { valid: true, tenant: { id: 't1' }, user: { id: 'u1' } }),
}))

const { GET, POST, DELETE } = await import('@/app/api/implantacion/plan/route')

const PROPUESTA = {
  nombre: 'Ventas',
  etapas: [
    { nombre: 'Contacto', criterio: 'Ha respondido y sabemos qué quiere', probabilidad: 10 },
    { nombre: 'Propuesta', criterio: 'Tiene la propuesta en su correo', probabilidad: 35 },
    { nombre: 'Cerrado', criterio: 'Firmado o descartado con motivo escrito', probabilidad: 100 },
  ],
}

const PIPELINE_CREADO = {
  id: 'p1',
  nombre: 'Ventas',
  activo: true,
  stages: [
    { nombre: 'Contacto', descripcion: 'Ha respondido y sabemos qué quiere', probabilidad: 10, orden: 1, esEtapaFinal: false },
    { nombre: 'Propuesta', descripcion: 'Tiene la propuesta en su correo', probabilidad: 35, orden: 2, esEtapaFinal: false },
    { nombre: 'Cerrado', descripcion: 'Firmado o descartado con motivo escrito', probabilidad: 100, orden: 3, esEtapaFinal: true },
  ],
  _count: { deals: 0 },
}

function postCon(body: unknown) {
  return new Request('http://localhost/api/implantacion/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

function borrar() {
  return new Request('http://localhost/api/implantacion/plan', { method: 'DELETE' }) as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.implantacionTenant.findUnique.mockResolvedValue({
    recomendacion: { embudo: PROPUESTA },
    plan: null,
    estado: 'seleccion',
  })
  mocks.implantacionTenant.update.mockResolvedValue({})
  mocks.auditLog.create.mockResolvedValue({})
  mocks.pipeline.findUnique.mockResolvedValue(null)
  mocks.pipeline.count.mockResolvedValue(0)
  // Por defecto: el embudo ya existe en la cuenta (lectura de estado). Los
  // casos que crean uno nuevo encolan un `null` para la llamada del orden.
  mocks.pipeline.findFirst.mockResolvedValue(PIPELINE_CREADO)
  mocks.pipeline.create.mockResolvedValue({ id: 'p1' })
  mocks.pipelineStage.createMany.mockResolvedValue({ count: 3 })
  mocks.pipelineStage.deleteMany.mockResolvedValue({ count: 3 })
  mocks.tenant.findUnique.mockResolvedValue({ plan: 'crm_profesional' })
})

describe('GET /api/implantacion/plan', () => {
  it('sin plan aplicado devuelve la propuesta del descubrimiento', async () => {
    const res = await GET(new Request('http://localhost/api/implantacion/plan') as any)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.embudo.nombre).toBe('Ventas')
    expect(body.embudo.etapas).toHaveLength(3)
    expect(body.aplicado).toBeNull()
    expect(body.puedeAplicar).toBe(true)
    expect(body.limites).toMatchObject({ maximo: 3, usados: 0 })
  })

  it('con plan aplicado informa del embudo real, no del guardado', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      recomendacion: { embudo: PROPUESTA },
      plan: { embudo: PROPUESTA, pipelineId: 'p1' },
    })
    mocks.pipeline.findFirst.mockResolvedValue({ ...PIPELINE_CREADO, _count: { deals: 2 } })

    const res = await GET(new Request('http://localhost/api/implantacion/plan') as any)
    const body = await res.json()

    expect(body.aplicado).toMatchObject({ pipelineId: 'p1', oportunidades: 2 })
    expect(body.aplicado.etapas.at(-1).esEtapaFinal).toBe(true)
  })

  it('si el embudo se borró a mano, el alta no dice que está aplicado', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      recomendacion: { embudo: PROPUESTA },
      plan: { embudo: PROPUESTA, pipelineId: 'borrado' },
    })
    mocks.pipeline.findFirst.mockResolvedValue(null)

    const res = await GET(new Request('http://localhost/api/implantacion/plan') as any)
    const body = await res.json()

    expect(body.aplicado).toBeNull()
  })
})

describe('POST /api/implantacion/plan', () => {
  it('crea el embudo con sus etapas y deja auditoría', async () => {
    // Primera llamada: el orden del embudo nuevo; después, la lectura de estado.
    mocks.pipeline.findFirst.mockResolvedValueOnce(null).mockResolvedValue(PIPELINE_CREADO)

    const res = await POST(postCon({ embudo: { nombre: 'Ventas', etapas: PROPUESTA.etapas } }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.accion).toBe('creado')
    expect(body.aplicado).toMatchObject({ pipelineId: 'p1', nombre: 'Ventas' })

    const creadas = mocks.pipelineStage.createMany.mock.calls[0][0].data
    expect(creadas).toHaveLength(3)
    expect(creadas.map((e: any) => e.orden)).toEqual([1, 2, 3])
    expect(creadas.at(-1)).toMatchObject({ esEtapaFinal: true, tipoEtapaFinal: 'ganado', probabilidad: 100 })

    expect(mocks.implantacionTenant.update).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      data: { plan: expect.objectContaining({ pipelineId: 'p1' }) },
    })
    expect(mocks.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: 'implantacion_plan', entidad: 'implantacion' }),
    })
  })

  it('no crea nada si el embudo no llega a dos etapas y no hay propuesta', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({ recomendacion: null, plan: null, estado: 'seleccion' })

    const res = await POST(postCon({ embudo: { nombre: 'Ventas', etapas: [{ nombre: 'Contacto', criterio: '', probabilidad: 10 }] } }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.avisos.join(' ')).toContain('al menos 2 etapas')
    expect(mocks.pipeline.create).not.toHaveBeenCalled()
  })

  it('no pisa un embudo con el mismo nombre que no salió del alta', async () => {
    mocks.pipeline.findUnique.mockResolvedValue({ id: 'ajeno', _count: { deals: 0 } })

    const res = await POST(postCon({ embudo: { nombre: 'Ventas', etapas: PROPUESTA.etapas } }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.codigo).toBe('nombre_ocupado')
    expect(mocks.pipeline.create).not.toHaveBeenCalled()
    expect(mocks.pipelineStage.createMany).not.toHaveBeenCalled()
  })

  it('respeta el tope de embudos del plan', async () => {
    mocks.pipeline.count.mockResolvedValue(3)

    const res = await POST(postCon({ embudo: { nombre: 'Ventas', etapas: PROPUESTA.etapas } }))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.codigo).toBe('tope_embudos')
    expect(mocks.pipeline.create).not.toHaveBeenCalled()
  })

  it('no reemplaza las etapas de un embudo que ya tiene oportunidades', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      recomendacion: { embudo: PROPUESTA },
      plan: { embudo: PROPUESTA, pipelineId: 'p1' },
      estado: 'personalizacion',
    })
    mocks.pipeline.findUnique.mockResolvedValue({ id: 'p1', _count: { deals: 4 } })

    const res = await POST(postCon({ embudo: { nombre: 'Ventas', etapas: PROPUESTA.etapas } }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.codigo).toBe('con_oportunidades')
    expect(mocks.pipelineStage.deleteMany).not.toHaveBeenCalled()
  })

  it('reaplica sobre el embudo vacío del propio alta', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      recomendacion: { embudo: PROPUESTA },
      plan: { embudo: PROPUESTA, pipelineId: 'p1' },
      estado: 'personalizacion',
    })
    mocks.pipeline.findUnique.mockResolvedValue({ id: 'p1', _count: { deals: 0 } })

    const res = await POST(postCon({ embudo: { nombre: 'Ventas', etapas: PROPUESTA.etapas } }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.accion).toBe('actualizado')
    expect(mocks.pipelineStage.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1', pipelineId: 'p1' } })
    expect(mocks.pipeline.create).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/implantacion/plan', () => {
  it('sin embudo aplicado no hay nada que deshacer', async () => {
    const res = await DELETE(borrar())
    expect(res.status).toBe(409)
    expect(mocks.pipeline.delete).toBeUndefined()
  })

  it('borra el embudo del alta y limpia el plan', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      plan: { embudo: PROPUESTA, pipelineId: 'p1' },
    })
    mocks.pipeline.findFirst.mockResolvedValue({ id: 'p1', nombre: 'Ventas', _count: { deals: 0 } })
    mocks.pipeline.delete = vi.fn().mockResolvedValue({ id: 'p1' })

    const res = await DELETE(borrar())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.aplicado).toBeNull()
    expect(mocks.pipelineStage.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1', pipelineId: 'p1' } })
    expect(mocks.pipeline.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
    expect(mocks.implantacionTenant.update).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      data: { plan: expect.objectContaining({ pipelineId: null }) },
    })
    expect(mocks.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: 'implantacion_plan_deshacer' }),
    })
  })

  it('no borra un embudo con oportunidades dentro', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue({
      plan: { embudo: PROPUESTA, pipelineId: 'p1' },
    })
    mocks.pipeline.findFirst.mockResolvedValue({ id: 'p1', nombre: 'Ventas', _count: { deals: 7 } })
    mocks.pipeline.delete = vi.fn()

    const res = await DELETE(borrar())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.codigo).toBe('con_oportunidades')
    expect(mocks.pipeline.delete).not.toHaveBeenCalled()
    expect(mocks.pipelineStage.deleteMany).not.toHaveBeenCalled()
  })
})
