// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

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

vi.mock('next/link', () => ({
  default: ({ children, ...props }: any) => React.createElement('a', props, children),
}))

// Import after mocks
import { LeadsContent } from '@/components/leads-content'

const mockLeads = [
  {
    id: '1', nombre: 'Carlos López', email: 'carlos@test.com', telefono: '555-0101',
    empresa: 'TechCorp', estado: 'nuevo', scoreValue: 85, fechaCreacion: '2026-06-15T10:00:00Z',
    asignadoUsuario: null, citas: [], score: { categoria: 'ia_evaluation' },
  },
  {
    id: '2', nombre: 'Ana Ruiz', email: 'ana@test.com', telefono: null,
    empresa: null, estado: 'contactado', scoreValue: 45, fechaCreacion: '2026-06-10T10:00:00Z',
    asignadoUsuario: null, citas: [], score: null,
  },
]

function mockResponse(data: any) {
  return { ok: true, json: async () => data }
}

describe('LeadsContent integración', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockApiFetch.mockResolvedValue(mockResponse(mockLeads))
  })

  it('debe mostrar loading y luego la tabla con leads', async () => {
    render(<LeadsContent />)

    // Wait for leads to load (loading → table)
    await waitFor(() => {
      expect(screen.getByText('Carlos López')).toBeDefined()
    })

    expect(screen.getByText('Ana Ruiz')).toBeDefined()
    expect(screen.getByText('TechCorp')).toBeDefined()
  })

  it('debe mostrar los filtros principales', async () => {
    render(<LeadsContent />)

    await waitFor(() => {
      expect(screen.getByText('Filtros')).toBeDefined()
    })

    expect(screen.getByPlaceholderText('Buscar por nombre o email...')).toBeDefined()
    expect(screen.getByText('Limpiar filtros')).toBeDefined()
    expect(screen.getByText('Mis Leads')).toBeDefined()
  })

  it('debe llamar a la API con filtro de empresa', async () => {
    render(<LeadsContent />)

    await waitFor(() => {
      expect(screen.getByText('Carlos López')).toBeDefined()
    })

    const empresaInput = screen.getByPlaceholderText('Filtrar por empresa...')
    fireEvent.change(empresaInput, { target: { value: 'Tech' } })

    // Wait for fetch to settle
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls
      const lastUrl = calls[calls.length - 1][0]
      expect(lastUrl).toContain('empresa=Tech')
    })
  })

  it('debe cambiar de pestaña a Estadísticas', async () => {
    render(<LeadsContent />)

    await waitFor(() => {
      expect(screen.getByText('Carlos López')).toBeDefined()
    })

    const statsTab = screen.getByText('Estadísticas')
    await userEvent.click(statsTab)

    await waitFor(() => {
      expect(screen.getByText('No hay estadísticas disponibles')).toBeDefined()
    })
  })

  it('el botón Limpiar filtros debe restaurar los filtros a default', async () => {
    render(<LeadsContent />)

    await waitFor(() => {
      expect(screen.getByText('Carlos López')).toBeDefined()
    })

    // Set search filter
    const searchInput = screen.getByPlaceholderText('Buscar por nombre o email...')
    await userEvent.type(searchInput, 'Carlos')

    // Click clear filters
    const clearButton = screen.getByText('Limpiar filtros')
    await userEvent.click(clearButton)

    // Search should be cleared
    expect((searchInput as HTMLInputElement).value).toBe('')
  })

  it('debe persistir empresaFilter en localStorage', async () => {
    render(<LeadsContent />)

    await waitFor(() => {
      expect(screen.getByText('Carlos López')).toBeDefined()
    })

    const empresaInput = screen.getByPlaceholderText('Filtrar por empresa...')
    fireEvent.change(empresaInput, { target: { value: 'TestCorp' } })

    await waitFor(() => {
      const saved = localStorage.getItem('volkern-leads-filters')
      expect(saved).not.toBeNull()
      const parsed = JSON.parse(saved!)
      expect(parsed.empresaFilter).toBe('TestCorp')
    })
  })

  it('debe restaurar searchTerm desde localStorage al cargar', async () => {
    localStorage.setItem('volkern-leads-filters', JSON.stringify({
      searchTerm: 'Carlos',
      selectedEstado: 'all',
      selectedAssignment: 'all',
      empresaFilter: '',
      fechaDesde: '',
      fechaHasta: '',
      activeTab: 'mis-leads',
    }))

    render(<LeadsContent />)

    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText('Buscar por nombre o email...')
      expect((searchInput as HTMLInputElement).value).toBe('Carlos')
    })
  })

  it('debe hacer clicable toda la fila para abrir la ficha del lead', async () => {
    render(<LeadsContent />)

    await waitFor(() => {
      expect(screen.getByText('Carlos López')).toBeDefined()
    })

    const row = screen.getByText('Carlos López').closest('tr')
    expect(row).not.toBeNull()
    expect(row?.className).toContain('cursor-pointer')
    expect(row?.getAttribute('tabindex')).toBe('0')
  })

  it('debe mostrar estado vacío cuando no hay leads', async () => {
    mockApiFetch.mockReset()
    mockApiFetch.mockResolvedValue(mockResponse([]))

    render(<LeadsContent />)

    await waitFor(() => {
      expect(screen.getByText('No hay leads')).toBeDefined()
    })
  })
})
