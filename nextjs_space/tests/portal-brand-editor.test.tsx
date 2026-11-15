// @vitest-environment jsdom
//
// Editor de marca del portal: precarga lo guardado, enseña la vista previa y al
// guardar manda los campos (es lo que dispara la limpieza de caché y la
// revalidación en el servidor).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const marcaInicial = {
  logoUrl: '',
  primaryColor: '#b45309',
  companyName: 'VRE Norte',
  claim: 'Inmobiliaria de barrio',
  telefono: '34612345678',
  nombreCuenta: 'VRE Norte',
  plantilla: 'marca',
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      return { ok: true, json: async () => ({ ...marcaInicial, ...body }) } as unknown as Response
    }
    return { ok: true, json: async () => marcaInicial } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
})

// El subidor real habla con /api/upload; aquí sólo importa que el campo exista.
vi.mock('@/components/ui/image-uploader', () => ({
  ImageUploader: () => <div data-testid="logo-uploader" />,
}))

import PortalBrandEditor from '@/components/real-estate/PortalBrandEditor'

describe('editor de marca', () => {
  it('precarga los valores y los enseña en la vista previa', async () => {
    render(<PortalBrandEditor plantilla="marca" />)

    expect(await screen.findByDisplayValue('VRE Norte')).toBeTruthy()
    expect(screen.getByDisplayValue('Inmobiliaria de barrio')).toBeTruthy()
    expect(screen.getByDisplayValue('34612345678')).toBeTruthy()
    expect(screen.getAllByDisplayValue('#b45309').length).toBeGreaterThan(0)

    // Empresa y claim aparecen en la miniatura, y el WhatsApp activa su botón.
    expect(screen.getAllByText('VRE Norte').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Inmobiliaria de barrio').length).toBeGreaterThan(0)
    expect(screen.getByText('Escribir por WhatsApp')).toBeTruthy()
    expect(screen.getByTestId('logo-uploader')).toBeTruthy()
  })

  it('al guardar envía los campos y confirma la publicación', async () => {
    const user = userEvent.setup()
    render(<PortalBrandEditor plantilla="marca" />)

    const claim = await screen.findByDisplayValue('Inmobiliaria de barrio')
    await user.clear(claim)
    await user.type(claim, 'Trato directo en Ruzafa')

    await user.click(screen.getByRole('button', { name: /Guardar marca/i }))

    await waitFor(() => expect(screen.getByText('Publicado')).toBeTruthy())

    const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT')
    expect(put).toBeTruthy()
    expect(JSON.parse(String((put![1] as RequestInit).body))).toMatchObject({
      companyName: 'VRE Norte',
      claim: 'Trato directo en Ruzafa',
      primaryColor: '#b45309',
      telefono: '34612345678',
    })
  })
})
