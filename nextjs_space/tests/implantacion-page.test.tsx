// @vitest-environment jsdom
//
// El flujo del alta guiada son dos llamadas encadenadas (POST del
// descubrimiento → PATCH de la elección) y un estado de selección que se puede
// romper sin que el motor falle. Esta prueba recorre lo que hace el cliente:
// contesta, ve las tarjetas, acepta una, descarta otra y confirma — y comprueba
// exactamente qué se envía al servidor en cada paso.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))

import ImplantacionPage from '@/app/dashboard/implantacion/page'

const fetchMock = vi.fn()

const MODULOS = [
  {
    id: 'cotizaciones',
    etiqueta: 'Cotizaciones',
    icono: '📄',
    motivo: 'Del catálogo al PDF en un clic.',
    requisito: 'Catálogo cargado e impuestos configurados.',
    limite: 'No hace firma electrónica cualificada.',
    incluidoEnPlan: true,
    peso: 0.92,
    senales: ['dolor_cotizaciones_lentas'],
  },
  {
    id: 'contratos',
    etiqueta: 'Contratos',
    icono: '📜',
    motivo: 'Cuando dice que sí, se firma desde la propuesta.',
    requisito: 'Una plantilla revisada por tu asesoría.',
    limite: 'No sustituye la revisión legal.',
    incluidoEnPlan: false,
    peso: 0.8,
    senales: ['tras_propuesta_papel'],
  },
]

const RECOMENDACION = {
  modulos: MODULOS,
  nucleo: { ids: ['leads', 'pipeline'], nota: 'Leads, contactos y embudo ya vienen encendidos.' },
  embudo: {
    nombre: 'Ventas',
    etapas: [
      { nombre: 'Contacto', criterio: 'Ha respondido y sabe qué quiere', probabilidad: 10 },
      { nombre: 'Propuesta', criterio: 'Tiene la propuesta en su correo', probabilidad: 50 },
      { nombre: 'Cerrado', criterio: 'Firmado o descartado con motivo', probabilidad: 100 },
    ],
  },
  informes: ['embudo_etapas'],
  plantillas: ['cotizacion', 'email_seguimiento'],
  riesgos: ['Contratos no entra en tu plan actual: se puede activar como addon.'],
  limites: { plan: 'basico', embudos: 1, usuarios: 5 },
  preguntasSinResponder: [],
  omitidos: 2,
}

const CHECKLIST = [
  { id: 'descubrimiento', titulo: 'Descubrimiento contestado', detalle: 'Qué vende y a quién.', dependeDe: null, completada: true },
  { id: 'modulos', titulo: 'Módulos elegidos', detalle: 'Cada módulo aceptado o descartado.', dependeDe: 'descubrimiento', completada: true },
  { id: 'datos', titulo: 'Datos cargados', detalle: 'Con informe de calidad.', dependeDe: 'embudo', completada: false },
]

const CATALOGOS = {
  informes: { embudo_etapas: { etiqueta: 'Embudo por etapa', demuestra: 'Dónde se cae el volumen.' } },
  plantillas: {
    cotizacion: { etiqueta: 'Cotización', nota: 'Condiciones y validez.' },
    email_seguimiento: { etiqueta: 'Email de seguimiento', nota: 'Para el «no contestó».' },
  },
}

const base = (over: Record<string, unknown> = {}) => ({
  estado: 'descubrimiento',
  etiquetas: { descubrimiento: 'Cuéntanos tu negocio', propuesta: 'Lo que te sirve', seleccion: 'Elige módulos' },
  descubrimiento: { respuestas: {}, noSe: [], notas: '' },
  resumen: { contestadas: 0, noSe: 0, pendientes: 12, total: 12 },
  recomendacion: null,
  aceptados: [],
  descartados: [],
  checklist: CHECKLIST.map((t) => ({ ...t, completada: false })),
  cuenta: { plan: 'basico', nombrePlan: 'Básico', limiteEmbudos: 1, limiteUsuarios: 5, modulosActivos: [] },
  catalogos: CATALOGOS,
  minimoRespuestas: 3,
  ...over,
})

const json = (cuerpo: unknown, ok = true) => Promise.resolve({ ok, json: async () => cuerpo })

/**
 * El alta pide dos endpoints: el estado del alta y los entregables del paso de
 * propuesta. Las respuestas se enrutan por URL y las del alta van en cola, para
 * que montar el selector no se coma la respuesta del POST ni del PATCH.
 */
const ENTREGABLES = {
  seleccion: { informes: ['embudo_etapas'], plantillas: ['email_seguimiento'] },
  recomendada: { informes: ['embudo_etapas'], plantillas: ['cotizacion', 'email_seguimiento'] },
  catalogo: {
    informes: [
      {
        id: 'embudo_etapas',
        etiqueta: 'Embudo por etapa',
        demuestra: 'Dónde se cae el volumen.',
        enlace: '/dashboard/pipeline',
        primerPaso: 'Crea la primera oportunidad.',
      },
    ],
    plantillas: [
      {
        id: 'email_seguimiento',
        etiqueta: 'Email de seguimiento',
        nota: 'Para el «no contestó».',
        tipo: 'email',
        enlace: '/dashboard/emails',
        seCreaSola: true,
        primerPaso: 'Edítala con tu firma.',
      },
    ],
  },
  topes: { informes: 4, plantillas: 4, minInformes: 2, minPlantillas: 1 },
  resumen: { informes: 1, plantillas: 1, seCreanSolas: 1, manuales: 0, completa: false },
  aplicadoEn: null,
  informes: [],
}

const PLAN = {
  propuesta: { nombre: 'Ventas', etapas: RECOMENDACION.embudo.etapas },
  embudo: { nombre: 'Ventas', etapas: RECOMENDACION.embudo.etapas },
  resumen: { etapas: 3, sinCriterio: 0, completo: true, texto: '3 etapas.' },
  aplicado: null,
  aplicadoEn: null,
  limites: { maximo: 1, usados: 0, tier: 'Básico' },
  topes: { minEtapas: 2, maxEtapas: 8 },
  puedeAplicar: true,
}

const ROLES = {
  propuesta: {
    roles: [
      {
        id: 'direccion',
        nombre: 'Dirección',
        descripcion: 'Quien responde por la cuenta.',
        hace: ['Ve el embudo entero'],
        propuesto: true,
        motivo: 'Alguien tiene que ver la cuenta entera.',
        senales: ['siempre'],
        paraEncajar: null,
        permisos: { leads: { ver: true, ver_todos: true } },
        veTodo: true,
      },
    ],
    equipoEstimado: 2,
    avisos: [],
  },
  seleccion: [{ id: 'direccion', veTodo: true }],
  resumen: { roles: 1, conEmbudoCompleto: 1, nombres: ['Dirección'], texto: '1 rol: Dirección.' },
  enCuenta: [],
  aplicadoEn: null,
  deshacerDisponible: false,
  equipo: { estimado: 2, limiteUsuarios: 5 },
  avisos: [],
}

const FISCAL = {
  propuesta: {
    pais: 'ES',
    requiereEstado: false,
    moneda: { actual: 'EUR', recomendada: 'EUR', coincide: true, motivo: 'Tu cuenta factura en EUR.' },
    tasas: [
      {
        codigo: 'IVA_ES_GENERAL',
        nombre: 'IVA general ES',
        porcentaje: 21,
        motivo: 'El tipo general de España.',
        porDefecto: true,
        requiereAsesoria: false,
        propuesto: true,
        paraEncajar: null,
      },
    ],
    faltanDatosEmisor: [],
    notas: [],
    avisos: [],
  },
  seleccion: { moneda: 'EUR', tasas: ['IVA_ES_GENERAL'] },
  resumen: { tasas: 1, moneda: 'EUR', cambiaMoneda: false, texto: '1 impuesto, en EUR.' },
  enCuenta: [],
  monedas: [{ codigo: 'EUR', nombre: 'Euro', simbolo: '€' }],
  paises: [{ codigo: 'ES', nombre: 'España' }],
  monedaActual: 'EUR',
  aplicadoEn: null,
  deshacerDisponible: false,
  avisos: [],
}

let colaAlta: unknown[] = []

/** Llamadas al endpoint del alta, sin las de entregables. */
const llamadasAlta = () =>
  fetchMock.mock.calls.filter(([url]) => url === '/api/implantacion') as [string, RequestInit][]

beforeEach(() => {
  vi.resetAllMocks()
  colaAlta = []
  fetchMock.mockImplementation((url: string) => {
    if (url === '/api/implantacion/entregables') return json(ENTREGABLES)
    if (url === '/api/implantacion/plan') return json(PLAN)
    if (url === '/api/implantacion/roles') return json(ROLES)
    if (url === '/api/implantacion/fiscal') return json(FISCAL)
    if (url === '/api/implantacion') return json(colaAlta.shift() ?? base())
    return json({})
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function contestarTresPreguntas(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^servicios/i }))
  await user.click(screen.getByRole('button', { name: /^empresas/i }))
  await user.click(screen.getByRole('button', { name: /menos de 7 días/i }))
}

describe('alta guiada — flujo de descubrimiento y elección', () => {
  it('envía las respuestas, pinta las tarjetas y manda la elección al confirmar', async () => {
    const user = userEvent.setup()
    colaAlta = [
      base(),
      base({
        estado: 'propuesta',
        resumen: { contestadas: 3, noSe: 0, pendientes: 9, total: 12 },
        recomendacion: RECOMENDACION,
        descubrimiento: {
          respuestas: { que_vende: ['servicios'], a_quien: ['empresas'], ciclo: ['menos_7d'] },
          noSe: [],
          notas: '',
        },
      }),
      { estado: 'seleccion', aceptados: ['cotizaciones'], descartados: ['contratos'], checklist: CHECKLIST, aviso: null },
    ]

    render(<ImplantacionPage />)

    // El cuestionario aparece con el botón bloqueado hasta tener material.
    const enviar = await screen.findByRole('button', { name: /ver lo que me sirve/i })
    expect((enviar as HTMLButtonElement).disabled).toBe(true)

    await contestarTresPreguntas(user)
    expect((enviar as HTMLButtonElement).disabled).toBe(false)
    await user.click(enviar)

    // La propuesta explica cada módulo; el fuera de plan se marca, no se esconde.
    const tarjetaCotizaciones = await screen.findByTestId('modulo-cotizaciones')
    const tarjetaContratos = screen.getByTestId('modulo-contratos')
    expect(within(tarjetaCotizaciones).getByText('Incluido')).toBeTruthy()
    expect(within(tarjetaContratos).getByText('Addon aparte')).toBeTruthy()
    expect(within(tarjetaCotizaciones).getByText(/No hace:/)).toBeTruthy()
    expect(within(tarjetaCotizaciones).getByText(/Catálogo cargado/)).toBeTruthy()
    expect(screen.getByText(/Tu embudo propuesto/)).toBeTruthy()
    expect(screen.getByText(/Y 2 módulos más/)).toBeTruthy()

    // Acepta cotizaciones, descarta contratos.
    await user.click(within(tarjetaCotizaciones).getByRole('button', { name: /^añadir$/i }))
    await user.click(within(tarjetaContratos).getByRole('button', { name: /ahora no/i }))

    const confirmar = screen.getByRole('button', { name: /confirmar 1 módulo/i })
    await user.click(confirmar)

    await waitFor(() => expect(llamadasAlta()).toHaveLength(3))

    const [urlGet] = llamadasAlta()[0]
    expect(urlGet).toBe('/api/implantacion')

    const [urlPost, post] = llamadasAlta()[1]
    expect(urlPost).toBe('/api/implantacion')
    expect(post.method).toBe('POST')
    const cuerpoPost = JSON.parse(post.body)
    expect(cuerpoPost.descubrimiento.respuestas.que_vende).toEqual(['servicios'])
    expect(cuerpoPost.descubrimiento.respuestas.a_quien).toEqual(['empresas'])
    expect(cuerpoPost.descubrimiento.respuestas.ciclo).toEqual(['menos_7d'])

    const [urlPatch, patch] = llamadasAlta()[2]
    expect(urlPatch).toBe('/api/implantacion')
    expect(patch.method).toBe('PATCH')
    const cuerpoPatch = JSON.parse(patch.body)
    expect(cuerpoPatch.aceptados).toEqual(['cotizaciones'])
    expect(cuerpoPatch.descartados).toEqual(['contratos'])
  })

  it('«no lo sé» quita la respuesta y viaja como duda explícita', async () => {
    const user = userEvent.setup()
    colaAlta = [base(), base({ estado: 'propuesta', recomendacion: RECOMENDACION })]

    render(<ImplantacionPage />)

    await user.click(await screen.findByRole('button', { name: /^servicios/i }))
    // Marca «no lo sé» en la primera pregunta: la respuesta elegida se descarta.
    await user.click(screen.getAllByRole('button', { name: /no lo sé/i })[0])

    await user.click(screen.getByRole('button', { name: /^empresas/i }))
    await user.click(screen.getByRole('button', { name: /menos de 7 días/i }))
    await user.click(screen.getByRole('button', { name: /ver lo que me sirve/i }))

    await waitFor(() => expect(llamadasAlta()).toHaveLength(2))
    const cuerpo = JSON.parse(llamadasAlta()[1][1].body as string)
    expect(cuerpo.descubrimiento.noSe).toContain('que_vende')
    expect(cuerpo.descubrimiento.respuestas.que_vende).toBeUndefined()
  })

  it('con un alta ya empezada, retoma en la propuesta con lo aceptado marcado', async () => {
    colaAlta = [
      base({
        estado: 'seleccion',
        recomendacion: RECOMENDACION,
        aceptados: ['cotizaciones'],
        descartados: ['contratos'],
      }),
    ]

    render(<ImplantacionPage />)

    expect(await screen.findByText(/Confirmar 1 módulo/i)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /añadido/i }).length).toBe(1)
    expect(screen.getAllByRole('button', { name: /descartado/i }).length).toBe(1)
    // Nada de esto se reenvía solo: el estado se lee, no se escribe.
    expect(llamadasAlta()).toHaveLength(1)
  })

  it('desde la elección se entra a personalizar (embudo y equipo) sin escribir nada', async () => {
    const user = userEvent.setup()
    colaAlta = [
      base({ estado: 'seleccion', recomendacion: RECOMENDACION, aceptados: ['cotizaciones'] }),
    ]

    render(<ImplantacionPage />)

    await user.click(await screen.findByRole('button', { name: /personalizar mi cuenta/i }))

    expect(await screen.findByRole('heading', { name: /personaliza tu embudo/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /crear el embudo en mi cuenta/i })).toBeTruthy()
    // Las otras dos piezas del paso: los roles del equipo y los impuestos.
    expect(await screen.findByText(/tu equipo y sus permisos/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /crear roles en mi cuenta/i })).toBeTruthy()
    expect(await screen.findByText(/impuestos y moneda/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /crear impuestos en mi cuenta/i })).toBeTruthy()
    // Entrar al paso no escribe: el embudo se crea solo al pulsar.
    expect(llamadasAlta()).toHaveLength(1)
  })
})
