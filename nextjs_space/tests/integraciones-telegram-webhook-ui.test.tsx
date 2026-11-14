// @vitest-environment jsdom
//
// Ajustes → Integraciones → Telegram: estado real del webhook y reparación.
//
// La integración puede decir «conectada» y aun así el bot no recibir nada si su
// webhook no está registrado o apunta a otra aplicación. Este test fija que el
// panel lo muestre (URL, pendientes, último error) y que el botón de reparar
// llame al endpoint y refresque el estado.
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
  useSession: vi.fn(() => ({ data: { user: { id: 'u1', email: 'admin@empresa.test' } } })),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import IntegracionesPage from '@/app/dashboard/integraciones/page'
import { toast } from 'sonner'

const ESPERADA = 'https://volkern.app/api/webhooks/telegram'

const respuesta = (data: unknown) => ({ ok: true, json: async () => data })

/** Primer GET: webhook apuntando a otra aplicación. Tras reparar: registrado. */
function stubFetch() {
  let reparado = false
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = String(init?.method || 'GET').toUpperCase()

    if (String(url).includes('/api/integraciones/telegram/webhook')) {
      if (metodo === 'POST') {
        reparado = true
        return respuesta({ ok: true, url: ESPERADA, descripcion: 'Webhook registrado' })
      }
      return respuesta(
        reparado
          ? { registrado: true, url: ESPERADA, esperada: ESPERADA, pendientes: 0, ultimoError: null, ultimoErrorEn: null, tieneBot: true }
          : {
              registrado: false,
              url: 'https://otra-app.example/hook',
              esperada: ESPERADA,
              pendientes: 7,
              ultimoError: 'Unauthorized',
              ultimoErrorEn: '2026-11-13T10:00:00.000Z',
              tieneBot: true,
            }
      )
    }
    if (String(url).includes('/api/integraciones/telegram/enlace-admin')) {
      return respuesta({ vinculado: false, chatId: null, desde: null })
    }
    if (url === '/api/integraciones') return respuesta([])
    if (String(url).includes('/api/users/me')) return respuesta({ tenant: { id: 't1' } })
    if (String(url).includes('/api/integraciones/evolution')) return respuesta({ configured: false })
    if (String(url).includes('/api/integraciones/anytimebot')) return respuesta({ configured: false })
    if (String(url).includes('google-calendar')) return respuesta({ conectado: false })

    return respuesta({})
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function abrirDialogoTelegram(usuario: ReturnType<typeof userEvent.setup>) {
  const titulo = await screen.findByText('Telegram Bot')
  const tarjeta = titulo.closest('.relative.overflow-hidden')
  expect(tarjeta).not.toBeNull()
  await usuario.click(
    within(tarjeta as HTMLElement).getByRole('button', { name: /Conectar|Configurar/ })
  )
  await screen.findByText('Vincular el chat de administración')
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Integraciones → Telegram — estado del webhook', () => {
  it('avisa de que el bot apunta a otra aplicación y muestra URL, pendientes y último error', async () => {
    const usuario = userEvent.setup({ pointerEventsCheck: 0 })
    stubFetch()

    render(<IntegracionesPage />)
    await abrirDialogoTelegram(usuario)

    expect(await screen.findByText('Webhook del bot')).toBeDefined()
    expect(await screen.findByText('Sin registrar: el bot no recibe ningún mensaje.')).toBeDefined()
    expect(screen.getByText('https://otra-app.example/hook')).toBeDefined()
    expect(screen.getByText(ESPERADA)).toBeDefined()
    expect(screen.getByText('7')).toBeDefined()
    expect(screen.getByText(/Unauthorized/)).toBeDefined()
    expect(screen.getByText(/El bot está atendiendo otra aplicación/)).toBeDefined()
  })

  it('«Reparar webhook» llama al endpoint y el panel pasa a registrado', async () => {
    const usuario = userEvent.setup({ pointerEventsCheck: 0 })
    const fetchMock = stubFetch()

    render(<IntegracionesPage />)
    await abrirDialogoTelegram(usuario)

    await usuario.click(await screen.findByRole('button', { name: /Reparar webhook/ }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]: any[]) =>
            String(url).includes('/api/integraciones/telegram/webhook') &&
            String((init as RequestInit | undefined)?.method).toUpperCase() === 'POST'
        )
      ).toHaveLength(1)
    )

    expect(toast.success).toHaveBeenCalledWith(
      'Webhook reparado',
      expect.objectContaining({ description: expect.stringContaining('Telegram ya entrega') })
    )
    expect(
      await screen.findByText('Registrado: Telegram entrega los mensajes a Volkern.')
    ).toBeDefined()
  })
})
