// @vitest-environment jsdom
//
// El widget de informes pintaba igual la propuesta del alta y lo que el cliente
// ya había fijado: con la propuesta sin aplicar, la lista aparecía vacía y
// parecía un problema de datos cuando lo que faltaba era terminar el alta. Esta
// prueba fija las dos caras: aviso con enlace directo cuando está pendiente, y
// silencio cuando ya está aplicado.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

import { PanelInformes } from '@/components/dashboard/PanelInformes'

const fetchMock = vi.fn()

const INFORME_VACIO = {
  id: 'embudo_etapas',
  etiqueta: 'Etapas del embudo',
  valor: '—',
  detalle: 'Todavía no hay oportunidades abiertas.',
  vacio: true,
  primerPaso: 'Crea la primera oportunidad y el embudo se llena solo.',
  enlace: '/dashboard/pipeline',
  demuestra: 'Dónde se atasca tu venta.',
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PanelInformes — propuesta sin aplicar', () => {
  it('avisa y enlaza al alta cuando los informes son la propuesta', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        seleccion: { informes: ['embudo_etapas'], plantillas: ['email_seguimiento'] },
        aplicadoEn: null,
        pendienteDeAplicar: true,
        informes: [INFORME_VACIO],
      }),
    })

    render(<PanelInformes />)

    const aviso = await screen.findByText(/los propone tu alta/i)
    expect(aviso).toBeTruthy()

    const enlace = screen.getByRole('link', { name: /terminar el alta/i })
    expect(enlace.getAttribute('href')).toBe('/dashboard/implantacion')
    // El informe se sigue viendo: el aviso explica por qué está vacío.
    expect(screen.getByText('Etapas del embudo')).toBeTruthy()
  })

  it('no avisa cuando la selección ya está aplicada', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        seleccion: { informes: ['embudo_etapas'], plantillas: ['email_seguimiento'] },
        aplicadoEn: '2026-10-31T09:00:00.000Z',
        pendienteDeAplicar: false,
        informes: [INFORME_VACIO],
      }),
    })

    render(<PanelInformes />)

    await waitFor(() => expect(screen.getByText('Etapas del embudo')).toBeTruthy())
    expect(screen.queryByText(/los propone tu alta/i)).toBeNull()
    expect(screen.queryByRole('link', { name: /terminar el alta/i })).toBeNull()
  })

  it('sin informes ni propuesta, invita a elegirlos una sola vez', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ informes: [], aplicadoEn: null, pendienteDeAplicar: false }),
    })

    render(<PanelInformes />)

    expect(await screen.findByText(/todavía no has fijado informes/i)).toBeTruthy()
    expect(screen.queryByText(/los propone tu alta/i)).toBeNull()
  })
})
