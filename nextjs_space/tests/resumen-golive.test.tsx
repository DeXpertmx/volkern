// @vitest-environment jsdom
//
// El resumen del go-live es la puerta al paso de datos: lo que importa es que
// no se abra con una pieza a medias y que avance de uno en uno (la API rechaza
// saltarse pasos). Se comprueba también qué se envía al servidor.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResumenGoLive } from '@/components/implantacion/ResumenGoLive'
import type { TareaChecklist } from '@/lib/implantacion/estado'

const PIEZAS: TareaChecklist[] = [
  { id: 'embudo', titulo: 'Embudo aprobado', detalle: 'El embudo existe en tu cuenta.', dependeDe: 'modulos', completada: true },
  { id: 'roles', titulo: 'Equipo y permisos', detalle: '3 roles en tu cuenta, con sus permisos.', dependeDe: 'embudo', completada: true },
  {
    id: 'fiscal',
    titulo: 'Fiscal listo para facturar',
    detalle: 'Falta los impuestos.',
    dependeDe: 'roles',
    completada: false,
  },
  {
    id: 'marca_canales',
    titulo: 'Marca y canales',
    detalle: 'Marca aplicada y 2 canales con su tarea de puesta en marcha.',
    dependeDe: 'fiscal',
    completada: true,
  },
  { id: 'datos', titulo: 'Datos cargados', detalle: '…', dependeDe: 'marca_canales', completada: false },
]

const conTodoAplicado = () => PIEZAS.map((tarea) => ({ ...tarea, completada: true }))

const respuesta = (json: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 400, json: async () => json }) as unknown as Response

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    const cuerpo = JSON.parse(String(init?.body ?? '{}'))
    return respuesta({ estado: cuerpo.estado, checklist: conTodoAplicado() })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ResumenGoLive', () => {
  it('junta las cuatro piezas y dice cuál falta, sin abrir el paso', async () => {
    render(<ResumenGoLive checklist={PIEZAS} estado="personalizacion" />)

    expect(screen.getByText('Resumen del go-live')).toBeTruthy()
    expect(screen.getByText('3 de 4 aplicadas')).toBeTruthy()
    expect(screen.getByText('Falta 1 de 4: Fiscal listo para facturar.')).toBeTruthy()
    // El detalle es el del checklist (comprobado en la cuenta), no una promesa.
    expect(screen.getByText('Falta los impuestos.')).toBeTruthy()

    const boton = screen.getByRole('button', { name: /pasar a datos/i }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    expect(screen.getByText(/se abre con las cuatro piezas aplicadas/i)).toBeTruthy()
    // Nada se escribe por mirar el resumen.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con las cuatro aplicadas avanza al paso de datos y deja el acceso a la carga', async () => {
    const usuario = userEvent.setup()
    const onAvanzado = vi.fn()
    render(<ResumenGoLive checklist={conTodoAplicado()} estado="personalizacion" onAvanzado={onAvanzado} />)

    expect(screen.getByText('4 de 4 aplicadas')).toBeTruthy()

    await usuario.click(screen.getByRole('button', { name: /pasar a datos/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/implantacion')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ estado: 'datos' })

    expect(onAvanzado).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'datos' }),
    )
    const enlace = await screen.findByRole('link', { name: /cargar empresas, contactos y catálogo/i })
    expect(enlace.getAttribute('href')).toBe('/dashboard/importar')
    expect(screen.getByText(/Alta en el paso de datos/)).toBeTruthy()
  })

  it('si el alta sigue en la elección avanza de uno en uno, sin saltarse el paso', async () => {
    const usuario = userEvent.setup()
    const onAvanzado = vi.fn()
    render(<ResumenGoLive checklist={conTodoAplicado()} estado="seleccion" onAvanzado={onAvanzado} />)

    await usuario.click(screen.getByRole('button', { name: /pasar a datos/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).estado)).toEqual([
      'personalizacion',
      'datos',
    ])
    expect(onAvanzado).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'datos' }))
  })

  it('quien ya está en datos solo ve el acceso a la carga', async () => {
    render(<ResumenGoLive checklist={conTodoAplicado()} estado="datos" />)

    expect(await screen.findByText(/Alta en el paso de datos/)).toBeTruthy()
    const boton = screen.getByRole('button', { name: /pasar a datos/i }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('si el servidor rechaza el avance se explica y no se pinta como hecho', async () => {
    fetchMock.mockImplementation(async () => respuesta({ error: 'No se puede pasar de «seleccion» a «datos»' }, false))
    const usuario = userEvent.setup()
    render(<ResumenGoLive checklist={conTodoAplicado()} estado="personalizacion" />)

    await usuario.click(screen.getByRole('button', { name: /pasar a datos/i }))

    expect(await screen.findByText(/No se puede pasar de «seleccion» a «datos»/)).toBeTruthy()
    expect(screen.queryByText(/Alta en el paso de datos/)).toBeNull()
    expect((screen.getByRole('button', { name: /pasar a datos/i }) as HTMLButtonElement).disabled).toBe(false)
  })
})
