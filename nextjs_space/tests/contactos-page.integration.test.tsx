// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Polyfill PointerEvent for Radix UI + jsdom compatibility
beforeAll(() => {
  if (!global.ResizeObserver) {
    (global as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!global.PointerEvent) {
    (global as any).PointerEvent = class PointerEvent extends Event {
      button = 0
      pointerType = 'mouse'
      isPrimary = true
      hasPointerCapture() { return false }
      releasePointerCapture() {}
      constructor(type: string, init?: any) {
        super(type, init)
      }
    } as any
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

const mockApiFetch = vi.fn()
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  useParams: vi.fn(() => ({})),
}))

vi.mock('next/link', () => ({
  default: ({ children, ...props }: any) => React.createElement('a', props, children),
}))

import ContactosPage from '@/app/dashboard/contactos/page'

const mockContacts = [
  {
    id: '1', nombre: 'Juan Pérez', email: 'juan@test.com', telefono: '123456789',
    tipo: 'person', cargo: 'CEO', ubicacion: null, direccion: null, ciudad: null,
    codigoPostal: null, pais: null, linkedin: null, notas: null, tags: 'cliente',
    perfilFiscal: null, _count: { deals: 2, persons: 0 }, fechaCreacion: new Date().toISOString(),
    company: null,
  },
  {
    id: '2', nombre: 'María García', email: 'maria@test.com', telefono: null,
    tipo: 'company', cargo: null, ubicacion: null, direccion: null, ciudad: null,
    codigoPostal: null, pais: null, linkedin: null, notas: null, tags: null,
    perfilFiscal: null, _count: { deals: 0, persons: 3 },
    fechaCreacion: new Date().toISOString(),
  },
]

function mockResponse(data: any) {
  return { ok: true, json: async () => data }
}

function prepararMocksIniciales(contactos: any[] = mockContacts) {
  // Ambas peticiones iniciales son concurrentes: resolver según la URL evita
  // que sus respuestas queden cruzadas en el mock secuencial.
  mockApiFetch.mockImplementation((url: string) =>
    Promise.resolve(mockResponse(url.includes('tipo=company') ? [] : contactos))
  )
}

describe('ContactosPage integración', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockReset()
    localStorage.clear()
    prepararMocksIniciales()
  })

  it('debe mostrar loading inicialmente y luego los contactos', async () => {
    render(<ContactosPage />)
    expect(screen.getByText('Cargando contactos...')).toBeDefined()
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeDefined())
    expect(screen.getByText('María García')).toBeDefined()
    expect(screen.getByText('Total Contactos')).toBeDefined()
  })

  it('debe filtrar contactos por búsqueda', async () => {
    render(<ContactosPage />)
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeDefined())
    const searchInput = screen.getByPlaceholderText(/Buscar por nombre/i)
    await userEvent.type(searchInput, 'María')
    await waitFor(() => {
      expect(screen.queryByText('Juan Pérez')).toBeNull()
      expect(screen.getByText('María García')).toBeDefined()
    })
  })

  it('el botón Limpiar filtros debe restaurar los filtros', async () => {
    render(<ContactosPage />)
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeDefined())
    const searchInput = screen.getByPlaceholderText(/Buscar por nombre/i)
    await userEvent.type(searchInput, 'María')
    await userEvent.click(screen.getByText('Limpiar filtros'))
    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeDefined()
      expect(screen.getByText('María García')).toBeDefined()
    })
    expect((searchInput as HTMLInputElement).value).toBe('')
  })

  it('debe mostrar estado vacío cuando no hay contactos', async () => {
    mockApiFetch.mockReset()
    prepararMocksIniciales([])
    render(<ContactosPage />)
    await waitFor(() => expect(screen.getByText('No hay contactos')).toBeDefined())
    expect(screen.getByText('Crear Primer Contacto')).toBeDefined()
  })

  it('el formulario de contacto crea el país y el teléfono usando selectores', async () => {
    const usuario = userEvent.setup()
    render(<ContactosPage />)
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeDefined())
    await usuario.click(screen.getByRole('button', { name: 'Nuevo Contacto' }))
    await usuario.type(screen.getByLabelText('Nombre Completo *'), 'Ana Contacto')
    await usuario.type(screen.getByLabelText('Email *'), 'ana@example.com')
    await usuario.selectOptions(screen.getByLabelText('País del teléfono'), 'MEX')
    await usuario.type(screen.getByLabelText('Teléfono'), '5512345678')
    await usuario.selectOptions(screen.getByLabelText('País de contacto'), 'MEX')

    mockApiFetch.mockImplementation((url: string, opciones?: RequestInit) => {
      if (opciones?.method === 'POST') return Promise.resolve(mockResponse({ id: 'new-contact' }))
      return Promise.resolve(mockResponse(url.includes('tipo=company') ? [] : mockContacts))
    })
    await usuario.click(screen.getByRole('button', { name: 'Crear Contacto' }))

    await waitFor(() => {
      const llamada = mockApiFetch.mock.calls.find(([, opciones]) => (opciones as RequestInit | undefined)?.method === 'POST')
      expect(llamada).toBeDefined()
      const payload = JSON.parse(String((llamada![1] as RequestInit).body))
      expect(payload.telefono).toBe('+525512345678')
      expect(payload.pais).toBe('México')
      expect(payload).not.toHaveProperty('paisTlfn')
    })
  })

  it('debe persistir searchTerm en localStorage', async () => {
    render(<ContactosPage />)
    await waitFor(() => expect(screen.getByText('Juan Pérez')).toBeDefined())
    const searchInput = screen.getByPlaceholderText(/Buscar por nombre/i)
    await userEvent.type(searchInput, 'test')

    await waitFor(() => {
      const saved = localStorage.getItem('volkern-contacts-filters')
      expect(saved).not.toBeNull()
      expect(JSON.parse(saved!).searchTerm).toBe('test')
    })
  })
})
