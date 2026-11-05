// @vitest-environment jsdom
//
// Recordatorio descartable de Telegram en el panel.
//
// Debe aparecer solo cuando la empresa omitió Telegram en el alta, sigue sin
// conectar el bot y nadie ha descartado el aviso. El descarte se guarda en el
// tenant (no en localStorage), así que se comprueba que se envía al servidor.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { TelegramReminder } from '@/components/dashboard/TelegramReminder'

const fetchMock = vi.fn()

function stub(estado: Record<string, unknown> | null, ok = true) {
  fetchMock.mockImplementation(async (_url: string, opciones?: RequestInit) => {
    if (opciones?.method === 'POST') {
      return { ok: true, json: async () => ({ success: true }) }
    }
    if (!ok) return { ok: false, status: 500, json: async () => ({}) }
    return { ok: true, json: async () => estado }
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('TelegramReminder', () => {
  it('avisa con el texto de las dos funciones y enlaza a Integraciones', async () => {
    stub({ telegramOmitido: true, telegramAvisoDescartado: false, telegramConnected: false })

    render(<TelegramReminder />)

    expect(
      await screen.findByText(/Dejaste Telegram para después/)
    ).toBeTruthy()
    expect(screen.getByText(/registrar un gasto, agendar una cita o/)).toBeTruthy()

    const enlace = screen.getByRole('link', { name: /Conectar Telegram/ }) as HTMLAnchorElement
    expect(enlace.getAttribute('href')).toBe('/dashboard/integraciones')
  })

  it('descartarlo lo envía al servidor y lo oculta al instante', async () => {
    stub({ telegramOmitido: true, telegramAvisoDescartado: false, telegramConnected: false })
    const user = userEvent.setup()

    render(<TelegramReminder />)
    await screen.findByText(/Dejaste Telegram para después/)

    await user.click(screen.getByLabelText('Descartar el recordatorio de Telegram'))

    expect(screen.queryByText(/Dejaste Telegram para después/)).toBeNull()

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, opciones]) => opciones?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(post![1].body).step).toBe('dismiss-telegram-reminder')
    })
  })

  it('«Silenciar 7 días» lo oculta y envía su propio step', async () => {
    stub({ telegramOmitido: true, telegramAvisoDescartado: false, telegramConnected: false })
    const user = userEvent.setup()

    render(<TelegramReminder />)
    await screen.findByText(/Dejaste Telegram para después/)

    await user.click(screen.getByLabelText('Silenciar el recordatorio de Telegram 7 días'))

    expect(screen.queryByText(/Dejaste Telegram para después/)).toBeNull()

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, opciones]) => opciones?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(post![1].body).step).toBe('snooze-telegram-reminder')
    })
  })

  it('no aparece si está silenciado', async () => {
    stub({
      telegramOmitido: true,
      telegramAvisoDescartado: false,
      telegramAvisoSilenciado: true,
      telegramConnected: false,
    })

    render(<TelegramReminder />)

    await waitFor(() => expect(screen.queryByText(/Dejaste Telegram/)).toBeNull())
  })

  it('si el descarte falla, el aviso vuelve', async () => {
    fetchMock.mockImplementation(async (_url: string, opciones?: RequestInit) => {
      if (opciones?.method === 'POST') {
        return { ok: false, status: 500, json: async () => ({}) }
      }
      return {
        ok: true,
        json: async () => ({
          telegramOmitido: true,
          telegramAvisoDescartado: false,
          telegramConnected: false,
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<TelegramReminder />)
    await screen.findByText(/Dejaste Telegram para después/)
    await user.click(screen.getByLabelText('Descartar el recordatorio de Telegram'))

    expect(await screen.findByText(/Dejaste Telegram para después/)).toBeTruthy()
  })

  it('dice cuánto tiempo lleva pendiente desde que se omitió', async () => {
    stub({
      telegramOmitido: true,
      telegramAvisoDescartado: false,
      telegramConnected: false,
      telegramOmitidoEn: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    })

    render(<TelegramReminder />)

    expect(
      await screen.findByText(/Dejaste Telegram para después hace 12 días:/)
    ).toBeTruthy()
  })

  it('redondea a meses cuando lleva más de un mes pendiente', async () => {
    stub({
      telegramOmitido: true,
      telegramAvisoDescartado: false,
      telegramConnected: false,
      telegramOmitidoEn: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    })

    render(<TelegramReminder />)

    expect(await screen.findByText(/hace un mes:/)).toBeTruthy()
  })

  it('sin marca legible el aviso sigue teniendo sentido', async () => {
    stub({
      telegramOmitido: true,
      telegramAvisoDescartado: false,
      telegramConnected: false,
      telegramOmitidoEn: 'ayer',
    })

    render(<TelegramReminder />)

    const aviso = await screen.findByText(/Dejaste Telegram para después:/)
    expect(aviso.textContent).not.toContain('hace')
  })

  it('no aparece si el bot ya está conectado', async () => {
    stub({ telegramOmitido: true, telegramAvisoDescartado: false, telegramConnected: true })

    render(<TelegramReminder />)

    await waitFor(() => expect(screen.queryByText(/Dejaste Telegram/)).toBeNull())
  })

  it('no aparece si se descartó o si nunca se omitió', async () => {
    stub({ telegramOmitido: true, telegramAvisoDescartado: true, telegramConnected: false })
    const { unmount } = render(<TelegramReminder />)
    await waitFor(() => expect(screen.queryByText(/Dejaste Telegram/)).toBeNull())
    unmount()

    stub({ telegramOmitido: false, telegramAvisoDescartado: false, telegramConnected: false })
    render(<TelegramReminder />)
    await waitFor(() => expect(screen.queryByText(/Dejaste Telegram/)).toBeNull())
  })

  it('si el estado no se puede leer, no muestra nada', async () => {
    stub(null, false)

    render(<TelegramReminder />)

    await waitFor(() => expect(screen.queryByText(/Dejaste Telegram/)).toBeNull())
  })
})

describe('TelegramReminder — layout móvil', () => {
  //
  // jsdom no calcula layout (no hay CSS ni `getBoundingClientRect` real), así
  // que lo único comprobable es el contrato de clases del que depende el
  // apilado. Lo que se vigila: a 360 px las tres acciones (conectar,
  // silenciar, X) no caben en la misma fila que la frase, así que la fila
  // tiene que apilarse hasta `sm` y las acciones poder partirse, sin texto
  // partido a mitad de etiqueta.
  it('apila el texto y las acciones hasta el breakpoint sm', async () => {
    stub({ telegramOmitido: true, telegramAvisoDescartado: false, telegramConnected: false })

    render(<TelegramReminder />)

    const aviso = await screen.findByText(/Dejaste Telegram para después/)
    const silenciar = screen.getByLabelText('Silenciar el recordatorio de Telegram 7 días')
    const acciones = silenciar.parentElement as HTMLElement
    const fila = acciones.parentElement as HTMLElement

    // La fila que contiene aviso + acciones se apila en móvil y solo es fila
    // desde `sm`.
    expect(fila.className).toContain('flex-col')
    expect(fila.className).toContain('sm:flex-row')

    // Las acciones no empujan al texto: pueden partirse en varias líneas.
    expect(acciones.className).toContain('flex-wrap')
    // Y solo reservan su ancho completo a partir de `sm`.
    expect(acciones.className).toContain('sm:flex-shrink-0')

    // El aviso puede encogerse y partirse (no `whitespace-nowrap`).
    expect(aviso.className).not.toContain('whitespace-nowrap')

    // Las etiquetas de los botones no se rompen a mitad de frase.
    expect(silenciar.className).toContain('whitespace-nowrap')
    // El enlace envuelve al botón: la clase vive en el botón, no en el <a>.
    const cta = screen
      .getByRole('link', { name: /Conectar Telegram/ })
      .querySelector('button') as HTMLButtonElement
    expect(cta.className).toContain('whitespace-nowrap')
  })

  it('las tres acciones siguen existiendo y son operables en móvil', async () => {
    stub({ telegramOmitido: true, telegramAvisoDescartado: false, telegramConnected: false })
    const user = userEvent.setup()

    render(<TelegramReminder />)
    await screen.findByText(/Dejaste Telegram para después/)

    // Nada de acciones escondidas tras hover: son botones/enlaces reales, y
    // silenciar sigue funcionando con el layout apilado.
    const silenciar = screen.getByRole('button', { name: /Silenciar/ }) as HTMLButtonElement
    expect(silenciar.disabled).toBe(false)
    expect(screen.getByRole('link', { name: /Conectar Telegram/ })).toBeTruthy()

    await user.click(silenciar)
    expect(screen.queryByText(/Dejaste Telegram para después/)).toBeNull()
  })
})
