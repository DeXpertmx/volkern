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
  useSession: vi.fn(() => ({ data: { user: { id: 'test-user', name: 'Test User' } } })),
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
import TareasPage from '@/app/dashboard/tareas/page'

const tomorrow = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)

const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)

function makeTask(overrides: any = {}) {
  return {
    id: 'task-1',
    tipo: 'llamada',
    titulo: 'Seguimiento llamada',
    descripcion: 'Llamar para confirmar propuesta',
    fechaVencimiento: tomorrow.toISOString(),
    completada: false,
    asignadoA: 'test-user',
    fechaCreacion: new Date().toISOString(),
    lead: { id: 'lead-1', nombre: 'Juan Pérez', empresa: 'TechCorp' },
    asignadoUsuario: { id: 'test-user', name: 'Test User', email: 'test@test.com' },
    ...overrides,
  }
}

const mockTasks = [
  makeTask({ id: '1', titulo: 'Llamada seguimiento', tipo: 'llamada' }),
  makeTask({ id: '2', titulo: 'Enviar cotización', tipo: 'email', completada: true }),
  makeTask({
    id: '3', titulo: 'Reunión con cliente', tipo: 'reunion',
    fechaVencimiento: yesterday.toISOString(),
    lead: { id: 'lead-2', nombre: 'María García', empresa: null },
    descripcion: null,
  }),
  makeTask({ id: '4', titulo: 'Recordatorio cumpleaños', tipo: 'recordatorio' }),
]

function mockResponse(data: any) {
  return { ok: true, json: async () => data }
}

describe('TareasPage integración', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockApiFetch.mockResolvedValue(mockResponse(mockTasks))

    // Mock window.confirm to return true
    vi.spyOn(window, 'confirm').mockImplementation(() => true)
  })

  it('debe mostrar loading y luego la lista de tareas', async () => {
    render(<TareasPage />)

    // Wait for tasks to load
    await waitFor(() => {
      expect(screen.getByText('Llamada seguimiento')).toBeDefined()
    })

    expect(screen.getByText('Enviar cotización')).toBeDefined()
    expect(screen.getByText('Reunión con cliente')).toBeDefined()
    expect(screen.getByText('Recordatorio cumpleaños')).toBeDefined()
    expect(screen.getByText('Tareas Globales')).toBeDefined()
  })

  it('debe mostrar las tarjetas de estadísticas', async () => {
    render(<TareasPage />)

    await waitFor(() => {
      expect(screen.getByText('Llamada seguimiento')).toBeDefined()
    })

    // Pendientes: 3 (ids: 1, 3, 4), Vencidas: 1 (id: 3), Para Hoy: 0
    const statsCards = screen.getAllByText(/^\d+$/)
    const statsValues = statsCards.map(el => el.textContent)

    // Looking for '3' (pending), '1' (overdue), '0' (today)
    const pendingCount = screen.getByText('3')
    expect(pendingCount).toBeDefined()

    // Verify stat labels exist
    expect(screen.getByText('Tareas Pendientes')).toBeDefined()
    expect(screen.getByText('Vencidas')).toBeDefined()
    expect(screen.getByText('Para Hoy')).toBeDefined()
  })

  it('debe mostrar el badge "Vencida" en tareas vencidas', async () => {
    render(<TareasPage />)

    await waitFor(() => {
      expect(screen.getByText('Reunión con cliente')).toBeDefined()
    })

    // Tarea vencida should have a "Vencida" badge
    const vencidaBadges = screen.getAllByText('Vencida')
    expect(vencidaBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('debe mostrar el lead asociado a cada tarea', async () => {
    render(<TareasPage />)

    await waitFor(() => {
      expect(screen.getByText('Llamada seguimiento')).toBeDefined()
    })

    // Multiple elements may match the lead name (link text + metadata)
    const juanRefs = screen.getAllByText(/Lead: Juan Pérez/)
    expect(juanRefs.length).toBeGreaterThanOrEqual(1)

    const mariaRefs = screen.getAllByText(/Lead: María García/)
    expect(mariaRefs.length).toBeGreaterThanOrEqual(1)
  })

  it('debe mostrar tachado el título de tareas completadas', async () => {
    render(<TareasPage />)

    await waitFor(() => {
      expect(screen.getByText('Enviar cotización')).toBeDefined()
    })

    const completedTask = screen.getByText('Enviar cotización')
    // The completed task should have line-through styling
    expect(completedTask.className).toContain('line-through')
  })

  it('debe mostrar estado vacío cuando no hay tareas', async () => {
    mockApiFetch.mockReset()
    mockApiFetch.mockResolvedValue(mockResponse([]))

    render(<TareasPage />)

    await waitFor(() => {
      expect(screen.getByText('No se encontraron tareas')).toBeDefined()
    })
  })

  it('debe cambiar entre pestañas de estado (Pendientes/Completadas/Todas)', async () => {
    render(<TareasPage />)

    await waitFor(() => {
      expect(screen.getByText('Llamada seguimiento')).toBeDefined()
    })

    // Click "Completadas" tab - should only show completed tasks
    const completadasTab = screen.getByText('Completadas')
    await userEvent.click(completadasTab)

    // The API will be called again with status=completed
    // Since our mock always returns all tasks, in a real scenario it would filter
    // We just verify the tab switch triggers an API re-fetch
    await waitFor(() => {
      // The last call should include status=completed
      const calls = mockApiFetch.mock.calls
      const lastUrl = calls[calls.length - 1][0]
      expect(lastUrl).toContain('status=completed')
    })
  })

  it('debe mostrar el filtro de tipo de tarea con valor por defecto', async () => {
    render(<TareasPage />)

    await waitFor(() => {
      expect(screen.getByText('Llamada seguimiento')).toBeDefined()
    })

    // Verify the Select trigger shows "Todos los tipos" (matching SelectItem text when tipo='all')
    expect(screen.getByText('Todos los tipos')).toBeDefined()

    // Verify the initial API call does NOT include tipo filter (default is 'all')
    const firstCall = mockApiFetch.mock.calls[0][0]
    expect(firstCall).not.toContain('tipo=')
  })

  it('debe mostrar el filtro de asignación con valor por defecto "Mis tareas"', async () => {
    render(<TareasPage />)

    await waitFor(() => {
      expect(screen.getByText('Llamada seguimiento')).toBeDefined()
    })

    // Verify the Select trigger shows "Mis tareas" (default when assignedToMe=true)
    expect(screen.getByText('Mis tareas')).toBeDefined()

    // Verify the initial API call includes assignedToMe=true
    const firstCall = mockApiFetch.mock.calls[0][0]
    expect(firstCall).toContain('assignedToMe=true')
  })
})
