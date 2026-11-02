// @vitest-environment jsdom
//
// La tarjeta de cierre es la puerta al último paso: no puede firmar con algo
// abierto, no puede firmar sin criterio ni sin confirmar las plantillas, y
// retirar la firma tiene que enviarse tal cual para que el alta vuelva a datos.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CierreGoLive } from '@/components/implantacion/CierreGoLive'
import type { FirmaGoLive, TareaChecklist } from '@/lib/implantacion/estado'

const CRITERIO = 'Veinte oportunidades creadas y la primera cotización enviada'

const FIRMA: FirmaGoLive = {
  criterioExito: CRITERIO,
  plantillasRevisadas: true,
  firmadoEn: '2026-11-01T09:00:00.000Z',
  firmadoPor: 'u1',
}

const tarea = (
  id: string,
  titulo: string,
  pendientes: Record<string, boolean> = {},
): TareaChecklist => ({
  id,
  titulo,
  detalle: '',
  dependeDe: null,
  completada: !pendientes[id],
})

const checklist = (pendientes: Record<string, boolean> = {}): TareaChecklist[] => [
  tarea('descubrimiento', 'Descubrimiento contestado', pendientes),
  tarea('modulos', 'Módulos elegidos', pendientes),
  tarea('embudo', 'Embudo aprobado', pendientes),
  tarea('roles', 'Equipo y permisos', pendientes),
  tarea('fiscal', 'Fiscal listo para facturar', pendientes),
  tarea('marca_canales', 'Marca y canales', pendientes),
  tarea('datos', 'Datos cargados', pendientes),
  tarea('informes', 'Informes fijados', pendientes),
  tarea('plantillas', 'Plantillas revisadas', pendientes),
  tarea('go_live', 'Go-live firmado', pendientes),
]

const fetchMock = vi.fn()

const respuesta = (json: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 409, json: async () => json }) as unknown as Response

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(async () =>
    respuesta({ estado: 'listo', firma: FIRMA, checklist: checklist() }),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CierreGoLive', () => {
  it('no deja firmar con una línea abierta y dice cuál es', () => {
    render(
      <CierreGoLive
        checklist={checklist({ informes: true })}
        estado="datos"
        firma={null}
      />,
    )

    expect(screen.getByText('1 pendientes')).toBeTruthy()
    expect(screen.getByTestId('pendiente-firma').textContent).toContain('Informes fijados')
    expect(
      (screen.getByRole('button', { name: /firmar el go-live/i }) as HTMLButtonElement).disabled,
    ).toBe(true)
    // Mirar no escribe nada.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('firma cuando hay criterio y las plantillas están confirmadas', async () => {
    const usuario = userEvent.setup()
    const onCambiado = vi.fn()
    render(
      <CierreGoLive
        checklist={checklist()}
        estado="datos"
        firma={null}
        onCambiado={onCambiado}
      />,
    )

    const boton = screen.getByRole('button', { name: /firmar el go-live/i }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)

    await usuario.type(screen.getByLabelText(/criterio de éxito/i), CRITERIO)
    await usuario.click(screen.getByLabelText(/he revisado la cotización/i))

    await waitFor(() => expect(boton.disabled).toBe(false))
    await usuario.click(boton)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/implantacion')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({
      firma: { criterioExito: CRITERIO, plantillasRevisadas: true },
    })
    expect(onCambiado).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'listo', firma: FIRMA }),
    )
  })

  it('no firma sin confirmar las plantillas aunque el criterio esté escrito', async () => {
    const usuario = userEvent.setup()
    render(<CierreGoLive checklist={checklist()} estado="datos" firma={null} />)

    await usuario.type(screen.getByLabelText(/criterio de éxito/i), CRITERIO)

    expect(
      (screen.getByRole('button', { name: /firmar el go-live/i }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con el alta en personalización explica por qué no se puede firmar', () => {
    render(<CierreGoLive checklist={checklist()} estado="personalizacion" firma={null} />)

    expect(screen.getByText(/La firma se abre en el paso de datos/i)).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: /firmar el go-live/i }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('si el servidor rechaza la firma se explica y no se pinta como firmada', async () => {
    fetchMock.mockImplementation(async () =>
      respuesta({ error: 'Todavía falta para firmar: Informes fijados.' }, false),
    )
    const usuario = userEvent.setup()
    render(<CierreGoLive checklist={checklist()} estado="datos" firma={null} />)

    await usuario.type(screen.getByLabelText(/criterio de éxito/i), CRITERIO)
    await usuario.click(screen.getByLabelText(/he revisado la cotización/i))
    await usuario.click(screen.getByRole('button', { name: /firmar el go-live/i }))

    expect(await screen.findByText(/Todavía falta para firmar/i)).toBeTruthy()
    expect(screen.queryByText(/Go-live firmado/i)).toBeNull()
    expect(screen.getByTestId('cierre-golive')).toBeTruthy()
  })

  it('muestra el criterio firmado y retira la firma solo tras confirmar', async () => {
    const usuario = userEvent.setup()
    const onCambiado = vi.fn()
    // La API responde como de verdad: el alta vuelve a datos, sin firma y con
    // las dos últimas líneas otra vez abiertas.
    fetchMock.mockImplementation(async () =>
      respuesta({ estado: 'datos', firma: null, checklist: checklist({ plantillas: true, go_live: true }) }),
    )
    render(
      <CierreGoLive checklist={checklist()} estado="listo" firma={FIRMA} onCambiado={onCambiado} />,
    )

    expect(screen.getByText('Go-live firmado')).toBeTruthy()
    expect(screen.getByText(`«${CRITERIO}»`)).toBeTruthy()
    expect(screen.getByText(/15 de noviembre de 2026/i)).toBeTruthy()

    await usuario.click(screen.getByRole('button', { name: /retirar la firma/i }))
    // Primer clic: pide confirmación, no escribe nada.
    expect(fetchMock).not.toHaveBeenCalled()

    await usuario.click(screen.getByRole('button', { name: /sí, retirarla/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ retirarFirma: true })
    expect(onCambiado).toHaveBeenCalledWith(expect.objectContaining({ firma: null }))
  })
})
