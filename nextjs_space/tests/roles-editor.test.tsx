// @vitest-environment jsdom
/**
 * Personalización del alta: el editor de equipo y permisos.
 *
 * La prueba recorre lo que hace el cliente: quita un rol de la propuesta, crea
 * los que deja, ve que uno ya existía —y que solo se completa— y deshace con
 * confirmación. Lo que no puede pasar es que el primer clic de «Deshacer» borre
 * roles: quitar accesos es una pulsación de más, no un roce.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { RolesEditor } from '@/components/implantacion/RolesEditor'

const ROLES = [
  {
    id: 'direccion',
    nombre: 'Dirección',
    descripcion: 'Quien responde por la cuenta.',
    hace: ['Ve el embudo entero', 'Invita a personas'],
    propuesto: true,
    motivo: 'Alguien tiene que ver la cuenta entera.',
    senales: ['siempre'],
    paraEncajar: null,
    permisos: { leads: { ver: true, ver_todos: true } },
    veTodo: true,
  },
  {
    id: 'comercial',
    nombre: 'Comercial',
    descripcion: 'Trabaja su cartera.',
    hace: ['Crea y edita sus oportunidades'],
    propuesto: true,
    motivo: 'Cada comercial con su cartera.',
    senales: ['equipo_multi'],
    paraEncajar: null,
    permisos: { leads: { ver: true } },
    veTodo: false,
  },
  {
    id: 'administracion',
    nombre: 'Administración',
    descripcion: 'Entra a facturar y cobrar.',
    hace: ['Ve las oportunidades para facturarlas'],
    propuesto: false,
    motivo: 'Se propone cuando hay facturas de por medio.',
    senales: [],
    paraEncajar: 'Se propone cuando hay facturas de por medio.',
    permisos: { leads: { ver: true, ver_todos: true } },
    veTodo: true,
  },
]

function respuesta(json: unknown, ok = true) {
  return { ok, json: async () => json, status: ok ? 200 : 400 } as unknown as Response
}

const fetchMock = vi.fn()

const GET_BASE = {
  propuesta: { roles: ROLES, equipoEstimado: 2, avisos: [] },
  seleccion: [
    { id: 'direccion', veTodo: true },
    { id: 'comercial', veTodo: false },
  ],
  resumen: { roles: 2, conEmbudoCompleto: 1, nombres: ['Dirección', 'Comercial'], texto: '2 roles.' },
  enCuenta: [],
  aplicadoEn: null,
  deshacerDisponible: false,
  equipo: { estimado: 2, limiteUsuarios: 5 },
  avisos: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'

    if (metodo === 'GET') return respuesta(GET_BASE)

    if (metodo === 'POST') {
      const cuerpo = JSON.parse(String(init?.body ?? '{}'))
      return respuesta({
        ok: true,
        resultados: cuerpo.seleccion.map((s: any) => ({
          id: s.id,
          nombre: s.id === 'direccion' ? 'Dirección' : 'Comercial',
          estado: 'creado',
          roleId: `r-${s.id}`,
          anadidos: ['leads.ver'],
          usuarios: 0,
        })),
        avisos: [],
        aplicadoEn: '2026-11-01T10:00:00.000Z',
      })
    }

    return respuesta({
      ok: true,
      borrados: ['r-direccion'],
      conservados: [{ roleId: 'r-comercial', nombre: 'Comercial', usuarios: 2 }],
      ausentes: [],
    })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('RolesEditor', () => {
  it('propone los roles del perfil y crea solo los marcados', async () => {
    const onAplicado = vi.fn()
    const usuario = userEvent.setup()
    render(<RolesEditor onAplicado={onAplicado} />)

    await screen.findByText('Dirección')
    expect(screen.getByText(/Alguien tiene que ver la cuenta entera/)).toBeTruthy()

    // Quitar un rol de la propuesta: no se crea.
    await usuario.click(screen.getByLabelText('Crear el rol Comercial'))
    await usuario.click(screen.getByRole('button', { name: /Crear roles en mi cuenta/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/implantacion/roles',
        expect.objectContaining({ method: 'POST' }),
      ),
    )

    const cuerpo = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body)
    expect(cuerpo.seleccion).toEqual([{ id: 'direccion', veTodo: true }])

    await screen.findByText(/Roles aplicados/i)
    expect(onAplicado).toHaveBeenCalled()
  })

  it('deja cambiar el alcance: «solo su cartera» viaja como permiso, no como etiqueta', async () => {
    const usuario = userEvent.setup()
    render(<RolesEditor />)

    await screen.findByText('Comercial')
    const boton = screen.getByRole('button', { name: 'Alcance de Comercial' })
    expect(boton.getAttribute('aria-pressed')).toBe('false')
    expect(boton.textContent).toContain('Solo ve su cartera')

    await usuario.click(boton)

    const cambiado = screen.getByRole('button', { name: 'Alcance de Comercial' })
    expect(cambiado.getAttribute('aria-pressed')).toBe('true')
    expect(cambiado.textContent).toContain('Ve todo el embudo')

    await usuario.click(screen.getByRole('button', { name: /Crear roles en mi cuenta/i }))

    const cuerpo = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body)
    expect(cuerpo.seleccion).toContainEqual({ id: 'comercial', veTodo: true })
  })

  it('avisa de un rol que ya existe y dice que solo se completa', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      respuesta(
        (init?.method ?? 'GET') === 'GET'
          ? {
              ...GET_BASE,
              enCuenta: [{ id: 'comercial', roleId: 'r1', nombre: 'Comercial', usuarios: 3 }],
            }
          : { ok: true, resultados: [], avisos: [] },
      ),
    )

    render(<RolesEditor />)

    await screen.findByText(/Ya existe/)
    expect(screen.getByText(/3 personas/)).toBeTruthy()
  })

  it('enseña los roles que no encajan con lo que haría falta para que encajaran', async () => {
    render(<RolesEditor />)

    await screen.findByText('Administración')
    expect(screen.getByText('Opcional')).toBeTruthy()
    expect(screen.getByText(/Se propone cuando hay facturas de por medio/)).toBeTruthy()
  })

  it('deshacer pide confirmación y cuenta lo que se queda porque tiene personas', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      respuesta(
        (init?.method ?? 'GET') === 'GET'
          ? { ...GET_BASE, deshacerDisponible: true, aplicadoEn: '2026-11-01T10:00:00.000Z' }
          : {
              ok: true,
              borrados: ['r-direccion'],
              conservados: [{ roleId: 'r-comercial', nombre: 'Comercial', usuarios: 2 }],
              ausentes: [],
            },
      ),
    )

    const usuario = userEvent.setup()
    render(<RolesEditor />)

    await screen.findByRole('button', { name: /^Deshacer$/i })
    await usuario.click(screen.getByRole('button', { name: /^Deshacer$/i }))

    // Primer clic: nada se borra todavía.
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)

    await usuario.click(screen.getByRole('button', { name: /Sí, borrar los roles del alta/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/implantacion/roles',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )

    await screen.findByText(/se queda porque hay personas usándolo/i)
    expect(screen.getByText(/«Comercial»: 2 personas/)).toBeTruthy()
  })
})
