// @vitest-environment jsdom
//
// «Ver portal» del snippet embebible.
//
// El enlace se construía con el `tenantId` (`/p/<cuid>/propiedades`), un
// segmento que el portal no resuelve: abría un 404 aunque la cuenta tuviera su
// landing publicada. El slug viaja en `/api/configuracion` como `_tenantSlug`.
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { EmbedSnippetCard } from '@/components/real-estate/EmbedSnippetCard'

const respuesta = (data: unknown) => ({ ok: true, json: async () => data }) as unknown as Response

function stubFetch(config: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).includes('/api/integraciones/whatsapp-negocio')
        ? respuesta({ widget: null })
        : respuesta(config)
    ) as unknown as typeof fetch
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EmbedSnippetCard — enlace al portal', () => {
  it('enlaza a /p/<slug>/propiedades con el slug de la cuenta', async () => {
    stubFetch({ _tenantId: 'cmw8ybnlx0000mfizqlex7o69', _tenantSlug: 'ocasion-casa' })

    render(<EmbedSnippetCard tenantId="cmw8ybnlx0000mfizqlex7o69" />)

    const enlace = await screen.findByRole('link', { name: /Ver portal/i })
    expect(enlace.getAttribute('href')).toBe('/p/ocasion-casa/propiedades')
    expect(enlace.getAttribute('target')).toBe('_blank')
  })

  it('no ofrece el enlace mientras no conoce el slug (mejor que un 404)', async () => {
    stubFetch({ _tenantId: 'cmw8ybnlx0000mfizqlex7o69' })

    render(<EmbedSnippetCard tenantId="cmw8ybnlx0000mfizqlex7o69" />)

    await screen.findByText(/¿Prefieres un portal propio\?/)
    expect(screen.queryByRole('link', { name: /Ver portal/i })).toBeNull()
    expect(screen.getByRole('button', { name: /Ver portal/i })).toHaveProperty('disabled', true)
  })
})
