// @vitest-environment node
/**
 * Redacción con IA en la API del alta (R3).
 *
 * Dos cosas que la pantalla necesita garantizadas:
 *   - Guardar el descubrimiento con el proveedor de IA **caído** devuelve la
 *     propuesta completa, con motivos plantilla: el alta no se bloquea.
 *   - GET no llama al modelo (cada carga de pantalla no cuesta una llamada),
 *     pero reaprovecha la redacción guardada al volver a la propuesta.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  implantacionTenant: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
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
  llamar: vi.fn(),
  cupo: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ prisma: mocks, default: mocks }))
vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (request: any) =>
    handler(request, { valid: true, tenant: { id: 't1' }, user: { id: 'u1' } }),
}))
vi.mock('@/lib/plans', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/plans')>()),
  getPlanConfig: vi.fn(async () => ({ nombre: 'Básico', modules: [], limites: { users: 5 } })),
}))
vi.mock('@/lib/tenant-modules', () => ({ resolverModulosTenant: vi.fn(async () => []) }))
vi.mock('@/lib/assistant/openrouter-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/assistant/openrouter-client')>()),
  callAssistantWithFallback: mocks.llamar,
}))
// El cupo es lo que impide que un cliente que reenvía el cuestionario en bucle
// gaste la cuenta: se controla desde el test.
vi.mock('@/lib/rate-limiter', () => ({ rateLimiter: { checkLimit: mocks.cupo } }))

const { GET, POST } = await import('@/app/api/implantacion/route')

const DESCUBRIMIENTO = {
  respuestas: { que_vende: ['servicios'], a_quien: ['empresas'], ciclo: ['menos_7d'] },
  noSe: [],
  notas: '',
  version: 1,
}

const registro = (over: Record<string, unknown> = {}) => ({
  estado: 'propuesta',
  descubrimiento: DESCUBRIMIENTO,
  recomendacion: null,
  aceptados: [],
  descartados: [],
  informes: [],
  entregablesAplicadosEn: null,
  plan: null,
  firmaGoLive: null,
  ...over,
})

const get = () => new Request('http://localhost/api/implantacion') as any

const post = (cuerpo: unknown) =>
  new Request('http://localhost/api/implantacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  }) as any

/** Respuesta válida del modelo: un motivo por cada módulo que recibe el prompt. */
const respuestaDelModelo = async (messages: any[]) => {
  const usuario = String(messages[1].content)
  const ids = [...usuario.matchAll(/^- ([a-z_]+) \(/gm)].map((m) => m[1])
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: JSON.stringify({
            motivos: Object.fromEntries(ids.map((id) => [id, `Motivo redactado para ${id}.`])),
            contradicciones: ['Dices vender servicios y cerrar en menos de 7 días.'],
          }),
        },
        finish_reason: 'stop',
      },
    ],
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()

  mocks.implantacionTenant.findUnique.mockResolvedValue(registro())
  mocks.implantacionTenant.upsert.mockResolvedValue({})
  mocks.implantacionTenant.update.mockResolvedValue({})

  mocks.tenant.findUnique.mockResolvedValue({
    plan: 'basico',
    enabledModules: [],
    subdomain: null,
    brandingConfig: { primaryColor: '#112233' },
  })
  mocks.tenantFeature.findMany.mockResolvedValue([])

  mocks.pipeline.count.mockResolvedValue(0)
  mocks.role.count.mockResolvedValue(0)
  mocks.tasaImpuesto.count.mockResolvedValue(0)
  mocks.configuracionFiscalEmisor.count.mockResolvedValue(0)
  mocks.configuracion.findUnique.mockResolvedValue(null)
  mocks.task.count.mockResolvedValue(0)
  mocks.importLog.count.mockResolvedValue(0)
  mocks.lead.count.mockResolvedValue(0)
  mocks.contact.count.mockResolvedValue(0)
  mocks.servicio.count.mockResolvedValue(0)
  mocks.auditLog.create.mockResolvedValue({})

  // Por defecto, todos los proveedores de IA caídos y cupo disponible.
  mocks.llamar.mockRejectedValue(new Error('Todos los modelos fallaron'))
  mocks.cupo.mockResolvedValue({
    allowed: true,
    remaining: 19,
    limit: 20,
    resetAt: new Date('2026-11-03T00:00:00.000Z'),
  })
})

describe('POST /api/implantacion · redacción de la propuesta', () => {
  it('con la IA caída guarda y devuelve la propuesta con motivos plantilla', async () => {
    const res = await POST(post({ descubrimiento: DESCUBRIMIENTO }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.recomendacion.modulos.length).toBeGreaterThan(0)
    expect(json.recomendacion.redaccion.fuente).toBe('plantilla')
    expect(json.recomendacion.modulos.every((m: any) => m.motivo.length > 0)).toBe(true)
    // El alta avanza igual: la propuesta existe y se guarda.
    expect(json.estado).toBe('propuesta')
    expect(mocks.implantacionTenant.upsert).toHaveBeenCalledTimes(1)
  })

  it('con la IA caída, el orden de los módulos sigue siendo el del motor', async () => {
    const caida = await (await POST(post({ descubrimiento: DESCUBRIMIENTO }))).json()

    mocks.llamar.mockImplementation(respuestaDelModelo)
    const conIA = await (await POST(post({ descubrimiento: DESCUBRIMIENTO }))).json()

    expect(conIA.recomendacion.modulos.map((m: any) => m.id)).toEqual(
      caida.recomendacion.modulos.map((m: any) => m.id),
    )
  })

  it('con IA usa sus motivos y suma las contradicciones sin tocar los módulos', async () => {
    mocks.llamar.mockImplementation(respuestaDelModelo)

    const res = await POST(post({ descubrimiento: DESCUBRIMIENTO }))
    const json = await res.json()

    expect(json.recomendacion.redaccion.fuente).toBe('ia')
    expect(json.recomendacion.modulos[0].motivo).toBe(
      `Motivo redactado para ${json.recomendacion.modulos[0].id}.`,
    )
    expect(json.recomendacion.riesgos).toContain('Dices vender servicios y cerrar en menos de 7 días.')

    // Lo guardado es la propuesta ya redactada: GET la reaprovecha.
    const guardada = mocks.implantacionTenant.upsert.mock.calls[0][0].update.recomendacion
    expect(guardada.redaccion.fuente).toBe('ia')
  })

  it('con el cupo agotado no llama al modelo, avisa y guarda sin el aviso', async () => {
    mocks.llamar.mockImplementation(respuestaDelModelo)
    mocks.cupo.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 20,
      resetAt: new Date('2026-11-03T00:00:00.000Z'),
    })

    const res = await POST(post({ descubrimiento: DESCUBRIMIENTO }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.llamar).not.toHaveBeenCalled()
    expect(json.recomendacion.redaccion.fuente).toBe('plantilla')
    expect(json.recomendacion.redaccion.aviso).toMatch(/20 reescrituras/)
    // La propuesta sigue completa: el tope cambia el texto, no el alta.
    expect(json.recomendacion.modulos.length).toBeGreaterThan(0)
    expect(json.estado).toBe('propuesta')

    // El aviso es de esta respuesta: no se guarda para no repetirlo mañana.
    const guardada = mocks.implantacionTenant.upsert.mock.calls[0][0].update.recomendacion
    expect(guardada.redaccion.aviso).toBeUndefined()
  })

  it('sin propuesta no consume cupo', async () => {
    const res = await POST(post({ descubrimiento: { respuestas: {}, noSe: [], notas: '', version: 1 } }))

    expect(res.status).toBe(200)
    expect(mocks.cupo).not.toHaveBeenCalled()
  })

  it('la redacción guardada no cambia qué módulos se pueden aceptar', async () => {
    mocks.llamar.mockImplementation(respuestaDelModelo)

    const res = await POST(post({ descubrimiento: DESCUBRIMIENTO }))
    const json = await res.json()

    expect(json.recomendacion.modulos[0].incluidoEnPlan).toBe(false)
    expect(json.recomendacion.redaccion.motivos).toHaveProperty(json.recomendacion.modulos[0].id)
  })
})

describe('GET /api/implantacion · la redacción no cuesta una llamada por pantalla', () => {
  it('no llama al modelo y devuelve los motivos plantilla', async () => {
    const res = await GET(get())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.llamar).not.toHaveBeenCalled()
    expect(json.recomendacion.redaccion.fuente).toBe('plantilla')
  })

  it('reaprovecha la redacción guardada al volver a la propuesta', async () => {
    mocks.implantacionTenant.findUnique.mockResolvedValue(
      registro({
        recomendacion: {
          modulos: [],
          redaccion: {
            motivos: { catalogo: 'Tu catálogo de servicios, sin inventar precios en cada llamada.' },
            contradicciones: [],
            fuente: 'ia',
            generadoEn: '2026-11-02T10:00:00.000Z',
          },
        },
      }),
    )

    const res = await GET(get())
    const json = await res.json()
    const catalogo = json.recomendacion.modulos.find((m: any) => m.id === 'catalogo')

    expect(mocks.llamar).not.toHaveBeenCalled()
    expect(catalogo.motivo).toBe('Tu catálogo de servicios, sin inventar precios en cada llamada.')
    expect(json.recomendacion.redaccion.fuente).toBe('ia')
  })
})
