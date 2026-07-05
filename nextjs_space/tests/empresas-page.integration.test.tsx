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

const mockApiFetch = vi.fn()
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  useParams: vi.fn(() => ({})),
}))

// Import after mocks
import EmpresasPage from '@/app/dashboard/empresas/page'

const mockCompanies = [
  {
    id: '1', nombre: 'TechCorp', email: 'info@techcorp.com', telefono: '555-0100',
    ubicacion: 'CDMX', linkedin: null, tags: 'tecnología, saas', notas: null,
    _count: { persons: 5, deals: 3 },
  },
  {
    id: '2', nombre: 'BuildCorp', email: 'contacto@buildcorp.com', telefono: null,
    ubicacion: null, linkedin: 'https://linkedin.com/company/buildcorp', tags: null, notas: null,
    _count: { persons: 2, deals: 0 },
  },
]

function mockResponse(data: any) {
  return { ok: true, json: async () => data }
}

describe('EmpresasPage integración', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockApiFetch.mockResolvedValue(mockResponse(mockCompanies))
  })

  it('debe mostrar loading y luego la lista de empresas', async () => {
    render(<EmpresasPage />)

    // Wait for companies to load
    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeDefined()
    })

    expect(screen.getByText('BuildCorp')).toBeDefined()
    expect(screen.getByText('info@techcorp.com')).toBeDefined()
  })

  it('debe mostrar las tarjetas de estadísticas', async () => {
    render(<EmpresasPage />)

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeDefined()
    })

    expect(screen.getByText('Total Empresas')).toBeDefined()
    expect(screen.getByText('Contactos Totales')).toBeDefined()
    expect(screen.getByText('Deals Asociados')).toBeDefined()

    expect(screen.getByText('2')).toBeDefined() // Total Empresas
    expect(screen.getByText('7')).toBeDefined()  // 5 + 2 contactos
    expect(screen.getByText('3')).toBeDefined()  // 3 deals
  })

  it('debe filtrar empresas por búsqueda (nombre)', async () => {
    render(<EmpresasPage />)

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeDefined()
    })

    const searchInput = screen.getByPlaceholderText(/Buscar empresas/i)
    await userEvent.type(searchInput, 'Build')

    await waitFor(() => {
      expect(screen.queryByText('TechCorp')).toBeNull()
      expect(screen.getByText('BuildCorp')).toBeDefined()
    })
  })

  it('debe filtrar empresas por búsqueda (email)', async () => {
    render(<EmpresasPage />)

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeDefined()
    })

    const searchInput = screen.getByPlaceholderText(/Buscar empresas/i)
    await userEvent.type(searchInput, 'contacto@buildcorp')

    await waitFor(() => {
      expect(screen.queryByText('TechCorp')).toBeNull()
      expect(screen.getByText('BuildCorp')).toBeDefined()
    })
  })

  it('debe mostrar estado vacío cuando no hay empresas', async () => {
    mockApiFetch.mockReset()
    mockApiFetch.mockResolvedValue(mockResponse([]))

    render(<EmpresasPage />)

    await waitFor(() => {
      expect(screen.getByText('No hay empresas registradas')).toBeDefined()
    })

    expect(screen.getByText('Crear Primera Empresa')).toBeDefined()
  })

  it('debe mostrar estado sin resultados cuando la búsqueda no encuentra nada', async () => {
    render(<EmpresasPage />)

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeDefined()
    })

    const searchInput = screen.getByPlaceholderText(/Buscar empresas/i)
    await userEvent.type(searchInput, 'EmpresaInexistenteXYZ')

    await waitFor(() => {
      expect(screen.getByText('No se encontraron empresas')).toBeDefined()
    })
  })

  it('debe abrir el diálogo de crear empresa al hacer clic en Nueva Empresa', async () => {
    render(<EmpresasPage />)

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeDefined()
    })

    const newButton = screen.getByText('Nueva Empresa')
    await userEvent.click(newButton)

    await waitFor(() => {
      expect(screen.getByText('Crear Nueva Empresa')).toBeDefined()
    })

    // Verify form fields exist
    expect(screen.getByLabelText('Nombre de la Empresa *')).toBeDefined()
    expect(screen.getByLabelText('Email Corporativo *')).toBeDefined()
    expect(screen.getByLabelText('Teléfono')).toBeDefined()
    expect(screen.getByText('Crear Empresa')).toBeDefined()
  })

  it('debe mostrar los tags correctamente en las tarjetas de empresa', async () => {
    render(<EmpresasPage />)

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeDefined()
    })

    // Tags should be visible
    expect(screen.getByText('tecnología')).toBeDefined()
    expect(screen.getByText('saas')).toBeDefined()

    // BuildCorp has no tags
    expect(screen.getByText('BuildCorp')).toBeDefined()
  })
})
