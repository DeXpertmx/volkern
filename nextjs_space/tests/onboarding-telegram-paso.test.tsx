// @vitest-environment jsdom
//
// Paso de Telegram del onboarding rápido.
//
// Dos cosas que vigila este test:
//  1) El paso explica las DOS funciones reales del bot —avisos y operación del
//     CRM por chat— en vez de presentarlo como canal de contacto con clientes.
//  2) «Configurar más tarde» es una salida de verdad: termina el onboarding
//     (antes saltaba al dashboard dejando `OnboardingProgress` pendiente para
//     siempre) y dice dónde se conecta el bot después.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()
let searchParamsStub = new URLSearchParams('')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => searchParamsStub,
}))

import OnboardingQuickPage from '@/app/dashboard/onboarding-quick/page'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  searchParamsStub = new URLSearchParams('')
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Recorre el alta hasta el paso 4 (token del bot), con Hospitality elegido. */
async function llegarAlPasoTelegram() {
  const user = userEvent.setup()
  render(<OnboardingQuickPage />)

  await user.click(screen.getByText('Hospitality'))
  await user.click(screen.getByRole('button', { name: /comenzar/i }))

  // Provisioning (paso 2) y salto al paso 3.
  const tarjeta = await screen.findByText('Avisos y operación por chat', {}, { timeout: 3000 })
  await user.click(tarjeta)

  await screen.findByText('Conectar Telegram')
  return user
}

describe('Onboarding — paso de Telegram', () => {
  it('explica las dos funciones del bot, no un canal de contacto con clientes', async () => {
    const user = userEvent.setup()
    render(<OnboardingQuickPage />)

    await user.click(screen.getByText('Hospitality'))
    await user.click(screen.getByRole('button', { name: /comenzar/i }))

    expect(await screen.findByText('Recibe avisos y opera desde Telegram')).toBeTruthy()
    expect(screen.getByText(/el briefing de cada mañana/)).toBeTruthy()
    expect(
      screen.getByText(/registrar un gasto, agendar una cita o consultar un/)
    ).toBeTruthy()
    expect(screen.getByText(/bot propio de tu empresa/)).toBeTruthy()

    // El texto antiguo presentaba el bot como canal de contacto con clientes.
    expect(screen.queryByText(/clientes te contactarán/i)).toBeNull()
  })

  it('en el paso del token dice quién recibe qué y dónde se configura después', async () => {
    await llegarAlPasoTelegram()

    expect(screen.getByText(/chat de administración que configures/)).toBeTruthy()
    expect(screen.getByText(/cada persona vinculada desde su perfil/)).toBeTruthy()
    expect(screen.getByText(/Puedes hacerlo cuando\s+quieras en Integraciones → Telegram/)).toBeTruthy()
    expect(screen.getByText(/el enlace del perfil solo vincula tu chat/)).toBeTruthy()
  })

  it('«Configurar más tarde» completa el onboarding y va al dashboard', async () => {
    const user = await llegarAlPasoTelegram()

    await user.click(screen.getByRole('button', { name: /configurar más tarde/i }))

    await waitFor(() => {
      const completado = fetchMock.mock.calls.some(
        ([url, opciones]) =>
          url === '/api/onboarding/quick' &&
          opciones?.body &&
          JSON.parse(opciones.body).step === 'complete'
      )
      expect(completado).toBe(true)
    })
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'))
  })

  it('en una vertical contable, omitir lleva a la configuración contable sin cerrar el alta', async () => {
    searchParamsStub = new URLSearchParams('vertical=asesoria_contable')
    const user = userEvent.setup()
    render(<OnboardingQuickPage />)

    await user.click(screen.getByRole('button', { name: /comenzar/i }))
    await user.click(await screen.findByText('Avisos y operación por chat', {}, { timeout: 3000 }))
    await screen.findByText('Conectar Telegram')

    await user.click(screen.getByRole('button', { name: /configurar más tarde/i }))

    expect(await screen.findByText('Configuración contable')).toBeTruthy()
    expect(pushMock).not.toHaveBeenCalled()
  })
})
