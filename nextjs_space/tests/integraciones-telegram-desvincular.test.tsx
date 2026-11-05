// @vitest-environment jsdom
//
// Desvincular el chat de administración desde Ajustes → Integraciones → Telegram.
//
// Lo que se comprueba aquí es el contrato de la confirmación, no el backend (eso
// vive en telegram-enlace-admin-route.test.ts):
//   1. Con un chat vinculado, el bloque de estado ofrece la baja.
//   2. «Cancelar» cierra el diálogo sin llamar al endpoint: desvincular por
//      accidente dejaría a la empresa sin avisos.
//   3. «Sí, desvincular» llama al DELETE una sola vez, avisa y deja el panel en
//      el estado sin vínculo.
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Polyfills que Radix necesita en jsdom (mismo bloque que el resto de tests de UI).
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

const ESTADO_VINCULADO = {
  vinculado: true,
  chatId: '646107192',
  desde: '2026-10-03T09:15:00.000Z',
  botUsername: 'volkern_demo_bot',
}

const respuesta = (data: unknown) => ({ ok: true, json: async () => data })

function stubFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = String(init?.method || 'GET').toUpperCase()

    if (String(url).includes('/api/integraciones/telegram/enlace-admin')) {
      return metodo === 'DELETE' ? respuesta({ desvinculado: true }) : respuesta(ESTADO_VINCULADO)
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

type FetchMock = ReturnType<typeof stubFetch>

const llamadasDelete = (fetchMock: FetchMock) =>
  fetchMock.mock.calls.filter(
    ([url, init]: any[]) =>
      String(url).includes('/api/integraciones/telegram/enlace-admin') &&
      String((init as RequestInit | undefined)?.method || 'GET').toUpperCase() === 'DELETE'
  )

/** Abre el diálogo de configuración de la tarjeta «Telegram Bot». */
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

describe('Integraciones → Telegram — desvincular el chat de administración', () => {
  it('muestra el chat vinculado con su fecha y abre la confirmación sin desvincular', async () => {
    const usuario = userEvent.setup({ pointerEventsCheck: 0 })
    const fetchMock = stubFetch()

    render(<IntegracionesPage />)
    await abrirDialogoTelegram(usuario)

    // El estado se pide al servidor al abrir, no se adivina con el listado.
    // La fecha se comprueba por el año para no atar el test al formato de mes
    // («3 de octubre de 2026»), que depende del ICU del entorno. El rótulo y la
    // fecha son nodos de texto distintos dentro del mismo párrafo.
    expect(screen.getByText('Chat vinculado')).toBeDefined()
    expect(await screen.findByText(/desde el .*2026/)).toBeDefined()
    expect(screen.getByText(/646…92/)).toBeDefined()

    await usuario.click(screen.getByText('Desvincular este chat'))

    const confirmacion = await screen.findByRole('alertdialog')
    expect(
      within(confirmacion).getByText('¿Desvincular el chat de administración?')
    ).toBeDefined()
    expect(within(confirmacion).getByText(/dejará de recibir los avisos/)).toBeDefined()
    // Abrir la confirmación todavía no es desvincular.
    expect(llamadasDelete(fetchMock)).toHaveLength(0)
  })

  it('«Cancelar» cierra sin llamar al endpoint y el chat sigue vinculado', async () => {
    const usuario = userEvent.setup({ pointerEventsCheck: 0 })
    const fetchMock = stubFetch()

    render(<IntegracionesPage />)
    await abrirDialogoTelegram(usuario)

    await usuario.click(await screen.findByText('Desvincular este chat'))
    const confirmacion = await screen.findByRole('alertdialog')
    await usuario.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

    expect(llamadasDelete(fetchMock)).toHaveLength(0)
    expect(toast.success).not.toHaveBeenCalled()
    // Sigue ofreciendo la baja: el vínculo no se ha tocado.
    expect(screen.getByText('Desvincular este chat')).toBeDefined()
  })

  it('«Sí, desvincular» llama al DELETE una vez, avisa y deja el panel sin vínculo', async () => {
    const usuario = userEvent.setup({ pointerEventsCheck: 0 })
    const fetchMock = stubFetch()

    render(<IntegracionesPage />)
    await abrirDialogoTelegram(usuario)

    await usuario.click(await screen.findByText('Desvincular este chat'))
    const confirmacion = await screen.findByRole('alertdialog')
    await usuario.click(within(confirmacion).getByRole('button', { name: 'Sí, desvincular' }))

    await waitFor(() => expect(llamadasDelete(fetchMock)).toHaveLength(1))
    expect(toast.success).toHaveBeenCalledWith(
      'Chat desvinculado',
      expect.objectContaining({ description: expect.stringContaining('dejará de recibir avisos') })
    )

    // El panel refleja la baja: sin vínculo y con el botón para volver a vincular.
    expect(
      await screen.findByText(
        'Todavía no hay ningún chat vinculado: los avisos de la empresa no le llegan a nadie.'
      )
    ).toBeDefined()
    expect(screen.getByRole('button', { name: 'Vincular este chat' })).toBeDefined()
    expect(screen.queryByText('Desvincular este chat')).toBeNull()
  })
})
