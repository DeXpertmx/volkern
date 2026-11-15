// @vitest-environment jsdom
//
// Beacon de analítica del portal.
//
// React monta los efectos dos veces en desarrollo y el portal se sirve cacheado:
// sin deduplicar, una visita contaría doble y el informe de la oficina mentiría.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import React from 'react'

import PortalAnalyticsBeacon from '@/components/real-estate/PortalAnalyticsBeacon'

let enviados: Array<{ url: string; cuerpo: any }> = []

beforeEach(() => {
  enviados = []
  sessionStorage.clear()
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (url: string, blob: Blob) => {
      enviados.push({ url, cuerpo: blob })
      return true
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('beacon de visitas', () => {
  it('envía la visita una sola vez aunque el efecto se repita', async () => {
    const { unmount } = render(
      <PortalAnalyticsBeacon slug="vre-norte" tipo="visita_portada" />
    )

    await waitFor(() => expect(enviados).toHaveLength(1))
    expect(enviados[0].url).toBe('/api/public/portal/evento')

    unmount()
    render(<PortalAnalyticsBeacon slug="vre-norte" tipo="visita_portada" />)
    await new Promise((r) => setTimeout(r, 50))
    expect(enviados).toHaveLength(1)
  })

  it('una ficha distinta sí registra su propia visita', async () => {
    render(<PortalAnalyticsBeacon slug="vre-norte" tipo="visita_ficha" propiedadId="inmueble-1" />)
    await waitFor(() => expect(enviados).toHaveLength(1))

    render(<PortalAnalyticsBeacon slug="vre-norte" tipo="visita_ficha" propiedadId="inmueble-2" />)
    await waitFor(() => expect(enviados).toHaveLength(2))

  })

  it('si el navegador no puede usar sendBeacon, cae en fetch con el mismo cuerpo', async () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: () => false,
    })
    const fetchMock = vi.fn(async () => ({ ok: true }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    render(<PortalAnalyticsBeacon slug="vre-norte" tipo="clic_contacto" propiedadId="inmueble-9" />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/public/portal/evento')
    expect(JSON.parse(String(init.body))).toEqual({
      slug: 'vre-norte',
      tipo: 'clic_contacto',
      propiedadId: 'inmueble-9',
    })
  })
})
