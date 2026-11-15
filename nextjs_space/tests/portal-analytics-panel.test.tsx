// @vitest-environment jsdom
//
// Panel de rendimiento del portal: la matriz ve su fila y las de sus oficinas,
// y el dinero no se suma entre divisas distintas.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

const cierres = (operaciones: number, valorCerrado: number, operacionesOtrasDivisas = 0) => ({
  operaciones,
  valorCerrado,
  operacionesOtrasDivisas,
})

const fila = (
  nombre: string,
  esMatriz: boolean,
  plantilla: 'foto' | 'marca',
  portada: number,
  leads: number,
  moneda: string | null = 'MXN'
) => ({
  tenantId: nombre.toLowerCase(),
  nombre,
  esMatriz,
  plantilla,
  metricas: {
    visitasPortada: portada,
    visitasFichas: portada * 2,
    clicsContacto: leads,
    leads,
    operaciones: 1,
    valorCerrado: moneda === 'MXN' ? 250000 : 100000,
    operacionesOtrasDivisas: 0,
    monedaPrincipal: moneda,
    porMoneda: {
      [moneda || 'MXN']: cierres(1, moneda === 'MXN' ? 250000 : 100000),
    },
    porOrigen: {
      whatsapp: cierres(1, moneda === 'MXN' ? 250000 : 100000),
      qr: cierres(0, 0),
      email: cierres(0, 0),
      redes: cierres(0, 0),
      cartel: cierres(0, 0),
      portal: cierres(0, 0),
    },
    porPlantilla: {
      foto: { visitasPortada: 0, visitasFichas: 0, clicsContacto: 0 },
      marca: { visitasPortada: 0, visitasFichas: 0, clicsContacto: 0 },
    },
  },
})

const redBase = () => ({
  visitasPortada: 150,
  visitasFichas: 300,
  clicsContacto: 5,
  leads: 5,
  operaciones: 2,
  valorCerrado: 500000,
  operacionesOtrasDivisas: 0,
  monedaPrincipal: 'MXN',
  porMoneda: { MXN: cierres(2, 500000) },
  porOrigen: {
    whatsapp: cierres(2, 500000),
    qr: cierres(0, 0),
    email: cierres(0, 0),
    redes: cierres(0, 0),
    cartel: cierres(0, 0),
    portal: cierres(0, 0),
  },
  porPlantilla: {
    foto: { visitasPortada: 50, visitasFichas: 100, clicsContacto: 1 },
    marca: { visitasPortada: 100, visitasFichas: 200, clicsContacto: 4 },
  },
})

const stubAnalitica = (filas: unknown[], red: unknown) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ filas, red }),
    })) as unknown as typeof fetch
  )
}

beforeEach(() => {
  stubAnalitica(
    [fila('Matriz', true, 'marca', 100, 4), fila('VRE Norte', false, 'foto', 50, 1)],
    redBase()
  )
})

import PortalAnalyticsPanel from '@/components/real-estate/PortalAnalyticsPanel'

const filasBase = () => [
  fila('Matriz', true, 'marca', 100, 4),
  fila('VRE Norte', false, 'foto', 50, 1),
]

describe('panel de analítica del portal', () => {
  it('muestra matriz y oficinas con su plantilla y los leads', async () => {
    render(<PortalAnalyticsPanel />)

    const nombreMatriz = (await screen.findAllByText('Matriz'))[0]
    expect(nombreMatriz).toBeTruthy()
    expect(screen.getByText('VRE Norte')).toBeTruthy()
    expect(screen.getByText('marca')).toBeTruthy()
    expect(screen.getByText('foto')).toBeTruthy()

    const filaMatriz = nombreMatriz.closest('tr')!
    expect(filaMatriz.textContent).toContain('100')
    expect(filaMatriz.textContent).toContain('4')

    expect(screen.getByText(/Por plantilla actual: foto/)).toBeTruthy()
  })

  it('muestra cierres, valor cerrado y el desglose por origen', async () => {
    render(<PortalAnalyticsPanel />)

    await screen.findByText('Cierres por origen')
    expect(screen.getAllByText('Valor cerrado').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('WhatsApp')).toBeTruthy()
    expect(screen.getByText('Portal (sin canal)')).toBeTruthy()

    const filaMatriz = screen.getAllByText('Matriz')[0].closest('tr')!
    expect(filaMatriz.textContent).toContain('$250,000')
  })

  it('no suma divisas distintas y lo dice en el panel', async () => {
    stubAnalitica(
      [fila('Matriz', true, 'marca', 100, 4), fila('VRE Norte', false, 'foto', 50, 1, 'EUR')],
      {
        ...redBase(),
        operaciones: 2,
        valorCerrado: 250000,
        operacionesOtrasDivisas: 1,
        monedaPrincipal: 'MXN',
        porMoneda: { MXN: cierres(1, 250000), EUR: cierres(1, 100000) },
        porOrigen: {
          ...redBase().porOrigen,
          whatsapp: cierres(2, 250000, 1),
        },
      }
    )

    render(<PortalAnalyticsPanel />)

    await screen.findByText('Cierres por origen')
    // El KPI dice con qué divisa suma y cuántos cierres deja fuera.
    expect(screen.getByText('Valor cerrado (MXN)')).toBeTruthy()
    expect(screen.getByText(/\+1 en otra divisa, no sumados/)).toBeTruthy()

    // Desglose explícito por divisa, sin inventar un total.
    const desglose = screen.getByText(/Valor cerrado por divisa:/)
    expect(desglose.textContent).toContain('EUR')
    expect(desglose.textContent).toContain('sólo suman MXN')

    // La fila de la oficina europea se etiqueta en euros, no en pesos.
    const filaOficina = screen.getByText('VRE Norte').closest('tr')!
    expect(filaOficina.textContent).toMatch(/100\.000\s€/)
  })
})
