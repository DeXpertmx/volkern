// @vitest-environment jsdom
/**
 * Personalización del alta: el editor del embudo.
 *
 * La prueba recorre lo que hace el cliente: cambia el nombre de una etapa,
 * crea el embudo, lo ve creado y lo deshace con confirmación en dos pasos. Lo
 * que no puede pasar es que el primer clic de «Deshacer» borre algo: borrar un
 * embudo es una pulsación de más, no un roce.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EmbudoEditor } from '@/components/implantacion/EmbudoEditor'

const ETAPAS = [
  { nombre: 'Contacto', criterio: 'Ha respondido y sabemos qué quiere', probabilidad: 10 },
  { nombre: 'Propuesta', criterio: 'Tiene la propuesta en su correo', probabilidad: 35 },
  { nombre: 'Cerrado', criterio: 'Firmado o descartado con motivo escrito', probabilidad: 100 },
]

const LIMITES = { maximo: 3, usados: 0, tier: 'Profesional' }

const APLICADO = {
  pipelineId: 'p1',
  nombre: 'Ventas',
  activo: true,
  etapas: ETAPAS.map((etapa, i) => ({ ...etapa, esEtapaFinal: i === ETAPAS.length - 1 })),
  oportunidades: 0,
}

function respuesta(json: unknown, ok = true) {
  return { ok, json: async () => json, status: ok ? 200 : 400 } as unknown as Response
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'
    expect(String(url)).toContain('/api/implantacion/plan')

    if (metodo === 'GET') {
      return respuesta({
        propuesta: { nombre: 'Ventas', etapas: ETAPAS },
        embudo: { nombre: 'Ventas', etapas: ETAPAS },
        resumen: { etapas: 3, sinCriterio: 0, completo: true, texto: '3 etapas.' },
        aplicado: null,
        aplicadoEn: null,
        limites: LIMITES,
        topes: { minEtapas: 2, maxEtapas: 8 },
        puedeAplicar: true,
      })
    }

    if (metodo === 'POST') {
      const cuerpo = JSON.parse(String(init?.body ?? '{}'))
      return respuesta({
        ok: true,
        embudo: cuerpo.embudo,
        avisos: [],
        accion: 'creado',
        aplicado: { ...APLICADO, etapas: cuerpo.embudo.etapas },
        aplicadoEn: '2026-11-01T10:00:00.000Z',
        limites: { ...LIMITES, usados: 1 },
        resumen: { etapas: cuerpo.embudo.etapas.length, sinCriterio: 0, completo: true, texto: '' },
      })
    }

    return respuesta({ ok: true, aplicado: null, aplicadoEn: null, limites: LIMITES })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('EmbudoEditor', () => {
  it('muestra el embudo propuesto y lo crea con lo que el cliente escribe', async () => {
    const onAplicado = vi.fn()
    const usuario = userEvent.setup()
    render(<EmbudoEditor onAplicado={onAplicado} />)

    const nombreEtapa = await screen.findByLabelText('Nombre', { selector: '#etapa-nombre-0' })
    await waitFor(() => expect((nombreEtapa as HTMLInputElement).value).toBe('Contacto'))

    await usuario.clear(nombreEtapa)
    await usuario.type(nombreEtapa, 'Primer contacto')

    await usuario.click(screen.getByRole('button', { name: /Crear el embudo en mi cuenta/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/implantacion/plan',
      expect.objectContaining({ method: 'POST' }),
    ))

    const cuerpo = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body)
    expect(cuerpo.embudo.nombre).toBe('Ventas')
    expect(cuerpo.embudo.etapas[0]).toMatchObject({ nombre: 'Primer contacto', probabilidad: 10 })

    await screen.findByText(/«Ventas» ya está en tu cuenta/i)
    expect(screen.getByRole('link', { name: /Ver en Pipeline/i }).getAttribute('href')).toBe('/dashboard/pipeline')
    expect(onAplicado).toHaveBeenCalled()
  })

  it('no permite quedarse por debajo del mínimo de etapas', async () => {
    const usuario = userEvent.setup()
    render(<EmbudoEditor />)

    await waitFor(() => expect(screen.getAllByLabelText(/^Nombre$/).length).toBe(3))

    const quitar = screen.getAllByRole('button', { name: /^Quitar la etapa/i })
    await usuario.click(quitar[1])

    await waitFor(() => expect(screen.getAllByLabelText(/^Nombre$/).length).toBe(2))
    // Con dos etapas, quitar deja de estar disponible: un embudo sin salida no se crea.
    for (const boton of screen.getAllByRole('button', { name: /^Quitar la etapa/i })) {
      expect((boton as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('deshacer pide confirmación antes de borrar', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET'
      if (metodo === 'GET') {
        return respuesta({
          propuesta: { nombre: 'Ventas', etapas: ETAPAS },
          embudo: { nombre: 'Ventas', etapas: ETAPAS },
          resumen: null,
          aplicado: APLICADO,
          aplicadoEn: '2026-11-01T10:00:00.000Z',
          limites: { ...LIMITES, usados: 1 },
          topes: { minEtapas: 2, maxEtapas: 8 },
          puedeAplicar: true,
        })
      }
      return respuesta({ ok: true, aplicado: null, aplicadoEn: null, limites: LIMITES })
    })

    const onAplicado = vi.fn()
    const usuario = userEvent.setup()
    render(<EmbudoEditor onAplicado={onAplicado} />)

    await screen.findByText(/«Ventas» ya está en tu cuenta/i)

    await usuario.click(screen.getByRole('button', { name: /^Deshacer$/i }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)

    await usuario.click(screen.getByRole('button', { name: /Sí, borrar el embudo/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/implantacion/plan', expect.objectContaining({ method: 'DELETE' })),
    )
    await screen.findByRole('button', { name: /Crear el embudo en mi cuenta/i })
    expect(onAplicado).toHaveBeenCalled()
  })

  it('con oportunidades dentro no deja deshacer y lo explica', async () => {
    fetchMock.mockImplementation(async () =>
      respuesta({
        propuesta: { nombre: 'Ventas', etapas: ETAPAS },
        embudo: { nombre: 'Ventas', etapas: ETAPAS },
        resumen: null,
        aplicado: { ...APLICADO, oportunidades: 4 },
        aplicadoEn: '2026-11-01T10:00:00.000Z',
        limites: { ...LIMITES, usados: 1 },
        topes: { minEtapas: 2, maxEtapas: 8 },
        puedeAplicar: true,
      }),
    )

    render(<EmbudoEditor />)

    await screen.findByText(/4 oportunidades dentro/i)
    expect((screen.getByRole('button', { name: /^Deshacer$/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/se edita en Pipeline/i)).toBeTruthy()
  })

  it('enseña los ajustes que aplicó el servidor', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return respuesta({
          propuesta: { nombre: 'Ventas', etapas: ETAPAS },
          embudo: { nombre: 'Ventas', etapas: ETAPAS },
          resumen: null,
          aplicado: null,
          aplicadoEn: null,
          limites: LIMITES,
          topes: { minEtapas: 2, maxEtapas: 8 },
          puedeAplicar: true,
        })
      }
      return respuesta({
        ok: true,
        embudo: { nombre: 'Ventas', etapas: ETAPAS },
        avisos: ['La última etapa cierra la venta: se pone al 100 % para que la previsión cuadre.'],
        accion: 'creado',
        aplicado: APLICADO,
        aplicadoEn: '2026-11-01T10:00:00.000Z',
        limites: { ...LIMITES, usados: 1 },
        resumen: null,
      })
    })

    const usuario = userEvent.setup()
    render(<EmbudoEditor />)

    await waitFor(() => expect(screen.getAllByLabelText(/^Nombre$/).length).toBe(3))
    await usuario.click(screen.getByRole('button', { name: /Crear el embudo en mi cuenta/i }))

    await screen.findByText(/Se ha ajustado tu embudo/i)
    expect(screen.getByText(/se pone al 100/i)).toBeTruthy()
  })
})
