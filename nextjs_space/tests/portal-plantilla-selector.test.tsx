// @vitest-environment jsdom
//
// Selector de plantilla del portal en el panel del módulo inmobiliario.
//
// La vista previa de cada plantilla se pinta con el color real de la cuenta
// (lo trae `_tenantBranding` en /api/configuracion) y la elección se guarda en
// la configuración del tenant como `plantilla_portal`.
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

beforeAll(() => {
  if (!global.ResizeObserver) {
    ;(global as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  if (!global.PointerEvent) {
    ;(global as any).PointerEvent = class PointerEvent extends Event {
      button = 0
      pointerType = 'mouse'
      isPrimary = true
      hasPointerCapture() {
        return false
      }
      releasePointerCapture() {}
      constructor(type: string, init?: any) {
        super(type, init)
      }
    }
  }
  if (!global.HTMLElement.prototype.hasPointerCapture) {
    global.HTMLElement.prototype.hasPointerCapture = () => false
  }
  if (!global.HTMLElement.prototype.releasePointerCapture) {
    global.HTMLElement.prototype.releasePointerCapture = () => {}
  }
})

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: { user: { id: 'test-user' } } })),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => ({
    get: (clave: string) => (clave === 'tab' ? 'portal' : null),
    toString: () => 'tab=portal',
  })),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  usePathname: vi.fn(() => '/dashboard/real-estate'),
}))

// framer-motion estubeado: importan los datos en pantalla, no la animación.
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: Record<string, unknown>) => {
        const { initial, animate, transition, ...rest } = props
        void initial
        void animate
        void transition
        return React.createElement('div', rest)
      },
    }
  ),
}))

import RealEstateConfigDashboard from '@/components/hubs/RealEstateConfigDashboard'

const configGuardada = {
  portalEnabled: true,
  portalSlug: '',
  plantilla_portal: 'foto',
  _tenantSlug: 'ocasion-casa',
  _tenantBranding: { primaryColor: '#b45309', logoUrl: null, companyName: 'Ocasión Casa' },
  exportFormats: ['xml', 'csv'],
}

function stubFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const ruta = String(url)
    if (ruta.includes('/api/real-estate/dashboard-stats')) {
      return { ok: true, json: async () => ({ stats: { total: 4 } }) } as unknown as Response
    }
    if (ruta.includes('/api/configuracion') && init?.method === 'POST') {
      return { ok: true, json: async () => ({ success: true }) } as unknown as Response
    }
    if (ruta.includes('/api/real-estate/portal/analytics')) {
      return { ok: true, json: async () => ({ filas: [], red: null }) } as unknown as Response
    }
    if (ruta.includes('/api/real-estate/portal/branding')) {
      return {
        ok: true,
        json: async () => ({
          logoUrl: '',
          primaryColor: '#b45309',
          companyName: 'VRE Norte',
          claim: '',
          telefono: '',
          nombreCuenta: 'VRE Norte',
          plantilla: 'foto',
        }),
      } as unknown as Response
    }
    return { ok: true, json: async () => configGuardada } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
  return fetchMock
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('selector de plantilla del portal', () => {
  it('ofrece las dos plantillas y guarda la elegida', async () => {
    const fetchMock = stubFetch()
    render(<RealEstateConfigDashboard />)

    expect(await screen.findByText('Plantilla de la portada')).toBeTruthy()

    const foto = screen.getByRole('button', { name: /Hero con foto/ })
    const marca = screen.getByRole('button', { name: /Hero de marca/ })
    expect(foto.getAttribute('aria-pressed')).toBe('true')
    expect(marca.getAttribute('aria-pressed')).toBe('false')

    await userEvent.click(marca)
    expect(marca.getAttribute('aria-pressed')).toBe('true')

    // `Guardar Cambios` es el de la configuración; el editor de marca tiene el suyo.
    const guardar = screen.getByRole('button', { name: 'Guardar Cambios' })
    await userEvent.click(guardar)

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/configuracion' && init?.method === 'POST'
      )
      expect(post).toBeTruthy()
      const cuerpo = JSON.parse(String((post![1] as RequestInit).body))
      expect(cuerpo.data.plantilla_portal).toBe('marca')
    })
  })

  it('respeta la plantilla ya guardada al abrir el panel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const ruta = String(url)
        if (ruta.includes('/api/real-estate/dashboard-stats')) {
          return { ok: true, json: async () => ({ stats: { total: 4 } }) } as unknown as Response
        }
        if (ruta.includes('/api/real-estate/portal/analytics')) {
          return { ok: true, json: async () => ({ filas: [], red: null }) } as unknown as Response
        }
        return {
          ok: true,
          json: async () => ({ ...configGuardada, plantilla_portal: '"marca"' }),
        } as unknown as Response
      }) as unknown as typeof fetch
    )

    render(<RealEstateConfigDashboard />)
    const marca = await screen.findByRole('button', { name: /Hero de marca/ })
    await waitFor(() => expect(marca.getAttribute('aria-pressed')).toBe('true'))
  })
})
