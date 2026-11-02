// @vitest-environment jsdom
/**
 * Personalización del alta: el editor de impuestos y moneda.
 *
 * La prueba recorre lo que hace el cliente: quita un tipo de la propuesta, crea
 * el que deja, ve que le falta el NIF para facturar y deshace con confirmación.
 * Lo que no puede pasar es que un tipo especial o una retención se apliquen sin
 * que el cliente los marque.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { FiscalEditor } from '@/components/implantacion/FiscalEditor'

const TASAS = [
  {
    codigo: 'IVA_ES_GENERAL',
    nombre: 'IVA general ES',
    porcentaje: 21,
    motivo: 'El tipo general de España: con él se factura la mayoría de lo que vendes.',
    porDefecto: true,
    requiereAsesoria: false,
    propuesto: true,
    paraEncajar: null,
  },
  {
    codigo: 'IVA_ES_REDUCIDO',
    nombre: 'IVA reducido ES',
    porcentaje: 10,
    motivo: 'Algunos productos y servicios tributan al 10 % en España.',
    porDefecto: false,
    requiereAsesoria: false,
    propuesto: false,
    paraEncajar: 'Márcala si parte de lo que vendes tributa al tipo reducido del 10 %.',
  },
  {
    codigo: 'IRPF_ES_RETENCION',
    nombre: 'Retención IRPF 15 %',
    porcentaje: 15,
    motivo: 'Vendes servicios a empresas.',
    porDefecto: false,
    requiereAsesoria: true,
    propuesto: true,
    paraEncajar: null,
  },
]

const GET_BASE = {
  propuesta: {
    pais: 'ES',
    requiereEstado: false,
    moneda: {
      actual: 'MXN',
      recomendada: 'EUR',
      coincide: false,
      motivo: 'Tu cuenta factura en MXN y facturas desde España, que usa EUR.',
    },
    tasas: TASAS,
    faltanDatosEmisor: ['NIF/CIF'],
    notas: ['Servicios a empresas en España: además del IVA, tu cliente te retiene IRPF.'],
    avisos: [],
  },
  seleccion: { moneda: 'EUR', tasas: ['IVA_ES_GENERAL', 'IRPF_ES_RETENCION'] },
  resumen: { tasas: 2, moneda: 'EUR', cambiaMoneda: true, texto: '2 impuestos y la moneda pasa a EUR.' },
  enCuenta: [],
  monedas: [
    { codigo: 'EUR', nombre: 'Euro', simbolo: '€' },
    { codigo: 'MXN', nombre: 'Peso mexicano', simbolo: '$' },
    { codigo: 'USD', nombre: 'Dólar estadounidense', simbolo: '$' },
  ],
  paises: [{ codigo: 'ES', nombre: 'España' }],
  monedaActual: 'MXN',
  aplicadoEn: null,
  deshacerDisponible: false,
  avisos: [],
}

function respuesta(json: unknown, ok = true) {
  return { ok, json: async () => json, status: ok ? 200 : 400 } as unknown as Response
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'

    if (metodo === 'GET') return respuesta(GET_BASE)

    if (metodo === 'POST') {
      const cuerpo = JSON.parse(String(init?.body ?? '{}'))
      return respuesta({
        ok: true,
        resultado: {
          tasas: cuerpo.tasas.map((codigo: string) => ({
            codigo,
            nombre: codigo === 'IVA_ES_GENERAL' ? 'IVA general ES' : 'IVA reducido ES',
            porcentaje: codigo === 'IVA_ES_GENERAL' ? 21 : 10,
            estado: 'creada',
            id: `t-${codigo}`,
          })),
          moneda: { anterior: 'MXN', actual: 'EUR', cambiada: true },
        },
        avisos: [],
      })
    }

    return respuesta({
      ok: true,
      borradas: ['IVA_ES_GENERAL'],
      conservadas: [{ codigo: 'IVA_ES_REDUCIDO', nombre: 'IVA reducido ES', usos: 2 }],
      ausentes: [],
    })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FiscalEditor', () => {
  it('crea solo los impuestos marcados y con la moneda elegida', async () => {
    const onAplicado = vi.fn()
    const usuario = userEvent.setup()
    render(<FiscalEditor onAplicado={onAplicado} />)

    await screen.findByText('IVA general ES')

    // La retención viene marcada por la propuesta; el cliente la quita.
    await usuario.click(screen.getByLabelText('Crear el impuesto Retención IRPF 15 %'))
    await usuario.click(screen.getByRole('button', { name: /Crear impuestos en mi cuenta/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/implantacion/fiscal',
        expect.objectContaining({ method: 'POST' }),
      ),
    )

    const cuerpo = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body)
    expect(cuerpo).toEqual({ moneda: 'EUR', tasas: ['IVA_ES_GENERAL'] })

    await screen.findByText(/Impuestos aplicados/i)
    expect(screen.getByText(/Moneda de la cuenta: MXN → EUR/)).toBeTruthy()
    expect(onAplicado).toHaveBeenCalled()
  })

  it('cambiar la moneda viaja al servidor y avisa de que no convierte lo ya escrito', async () => {
    const usuario = userEvent.setup()
    render(<FiscalEditor />)

    await screen.findByLabelText('Moneda de facturación')
    await usuario.selectOptions(screen.getByLabelText('Moneda de facturación'), 'USD')

    expect(screen.getByText(/pasará a USD/)).toBeTruthy()

    await usuario.click(screen.getByRole('button', { name: /Crear impuestos en mi cuenta/i }))

    const cuerpo = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body)
    expect(cuerpo.moneda).toBe('USD')
  })

  it('los tipos que no encajan se explican en vez de aplicarse solos', async () => {
    render(<FiscalEditor />)

    await screen.findByText('IVA reducido ES')
    expect(screen.getByText(/Márcala si parte de lo que vendes tributa/)).toBeTruthy()

    const reducido = screen.getByLabelText('Crear el impuesto IVA reducido ES') as HTMLInputElement
    expect(reducido.checked).toBe(false)
  })

  it('avisa de lo que falta del emisor y no lo rellena por su cuenta', async () => {
    render(<FiscalEditor />)

    await screen.findByText(/falta: NIF\/CIF/)
    expect(screen.getByText(/un NIF inventado es peor que uno vacío/)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /Abrir Configuración fiscal/i }).getAttribute('href'),
    ).toBe('/dashboard/configuracion?section=fiscal')
  })

  it('deshacer pide confirmación y cuenta lo que se queda por estar en documentos', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      respuesta(
        (init?.method ?? 'GET') === 'GET'
          ? { ...GET_BASE, deshacerDisponible: true, aplicadoEn: '2026-11-01T10:00:00.000Z' }
          : {
              ok: true,
              borradas: ['IVA_ES_GENERAL'],
              conservadas: [{ codigo: 'IVA_ES_REDUCIDO', nombre: 'IVA reducido ES', usos: 2 }],
              ausentes: [],
            },
      ),
    )

    const usuario = userEvent.setup()
    render(<FiscalEditor />)

    await screen.findByRole('button', { name: /^Deshacer$/i })
    await usuario.click(screen.getByRole('button', { name: /^Deshacer$/i }))

    // Primer clic: nada se borra todavía.
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)

    await usuario.click(screen.getByRole('button', { name: /Sí, borrar los impuestos del alta/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/implantacion/fiscal',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )

    await screen.findByText(/se queda porque ya está en documentos/i)
    expect(screen.getByText(/«IVA reducido ES»: 2 documentos/)).toBeTruthy()
  })
})
