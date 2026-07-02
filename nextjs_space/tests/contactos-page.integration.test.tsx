// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Polyfill PointerEvent for Radix UI + jsdom compatibility
beforeAll(() => {
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
    HTMLElement.prototype.hasPointerCapture = () => false
  }
  if (!global.HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {}
  }
})

// --- Mocks ---

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

// Import after mocks
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

describe('ContactosPage integración', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockApiFetch
      .mockResolvedValueOnce(mockResponse(mockContacts))
      .mockResolvedValueOnce(mockResponse([]))
  })

  it('debe mostrar loading inicialmente y luego los contactos', async () => {
    render(<ContactosPage />)

    // Loading state
    expect(screen.getByText('Cargando contactos...')).toBeDefined()

    // Wait for contacts to load
    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeDefined()
    })

    expect(screen.getByText('María García')).toBeDefined()
    expect(screen.getByText('Total Contactos')).toBeDefined()
  })

  it('debe filtrar contactos por búsqueda', async () => {
    render(<ContactosPage />)

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeDefined()
    })

    const searchInput = screen.getByPlaceholderText(/Buscar por nombre/i)
    await userEvent.type(searchInput, 'María')

    await waitFor(() => {
      expect(screen.queryByText('Juan Pérez')).toBeNull()
      expect(screen.getByText('María García')).toBeDefined()
    })
  })

  it('el botón Limpiar filtros debe restaurar los filtros', async () => {
    render(<ContactosPage />)

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeDefined()
    })

    // Apply a search filter
    const searchInput = screen.getByPlaceholderText(/Buscar por nombre/i)
    await userEvent.type(searchInput, 'María')

    // Click clear filters
    const clearButton = screen.getByText('Limpiar filtros')
    await userEvent.click(clearButton)

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeDefined()
      expect(screen.getByText('María García')).toBeDefined()
    })

    expect((searchInput as HTMLInputElement).value).toBe('')
  })

  it('debe mostrar estado vacío cuando no hay contactos', async () => {
    mockApiFetch
      .mockReset()
      .mockResolvedValueOnce(mockResponse([]))
      .mockResolvedValueOnce(mockResponse([]))

    render(<ContactosPage />)

    await waitFor(() => {
      expect(screen.getByText('No hay contactos')).toBeDefined()
    })

    expect(screen.getByText('Crear Primer Contacto')).toBeDefined()
  })

  it('debe persistir searchTerm en localStorage', async () => {
    render(<ContactosPage />)

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeDefined()
    })

    // Type in search
    const searchInput = screen.getByPlaceholderText(/Buscar por nombre/i)
    await userEvent.type(searchInput, 'test')

    // Check localStorage was written
    await waitFor(() => {
      const saved = localStorage.getItem('volkern-contacts-filters')
      expect(saved).not.toBeNull()
      const parsed = JSON.parse(saved!)
      expect(parsed.searchTerm).toBe('test')
    })
  })
})
