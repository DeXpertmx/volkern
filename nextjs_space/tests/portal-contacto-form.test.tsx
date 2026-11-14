// @vitest-environment jsdom
//
// Formulario de contacto de la portada del portal.
//
// Al unificar datos y estado del envío en un solo objeto hay que fijar lo que
// viaja al endpoint: el `slug` de la cuenta (para que el lead nazca en la
// oficina correcta), el consentimiento y el resto de campos tal cual.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import PortalContactForm from '@/app/p/[tenantSlug]/PortalContactForm'

const respuestaOk = { ok: true, json: async () => ({ success: true }) }

function stubFetch() {
  const fetchMock = vi.fn(async () => respuestaOk as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PortalContactForm', () => {
  it('envía slug, campos y consentimiento, y confirma el envío', async () => {
    const usuario = userEvent.setup({ pointerEventsCheck: 0 })
    const fetchMock = stubFetch()

    render(<PortalContactForm tenantSlug="casas-del-sur" brandingColor="#2563eb" />)

    await usuario.type(screen.getByLabelText(/Nombre/), 'Ana Pérez')
    await usuario.type(screen.getByLabelText(/Email/), 'ana@test.com')
    await usuario.type(screen.getByLabelText(/Teléfono/), '600123456')
    await usuario.type(screen.getByLabelText(/Qué estás buscando/), 'Busco piso')
    await usuario.click(screen.getByRole('checkbox'))

    await usuario.click(screen.getByRole('button', { name: 'Enviar consulta' }))

    expect(await screen.findByText('Mensaje enviado')).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/public/real-estate/contact')
    expect(JSON.parse(String(init.body))).toEqual({
      slug: 'casas-del-sur',
      name: 'Ana Pérez',
      email: 'ana@test.com',
      phone: '600123456',
      message: 'Busco piso',
      consent: true,
    })
  })

  it('muestra el error del servidor y no limpia el formulario', async () => {
    const usuario = userEvent.setup({ pointerEventsCheck: 0 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: 'Nombre y email son obligatorios' }),
      })) as unknown as typeof fetch
    )

    render(<PortalContactForm tenantSlug="vre" brandingColor="#2563eb" />)

    await usuario.type(screen.getByLabelText(/Nombre/), 'Ana')
    await usuario.type(screen.getByLabelText(/Email/), 'ana@test.com')
    await usuario.click(screen.getByRole('checkbox'))
    await usuario.click(screen.getByRole('button', { name: 'Enviar consulta' }))

    expect(await screen.findByText('Nombre y email son obligatorios')).toBeDefined()
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('Ana')
  })
})
