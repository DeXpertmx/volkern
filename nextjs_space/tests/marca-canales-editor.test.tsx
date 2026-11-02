// @vitest-environment jsdom
/**
 * Personalización del alta: el editor de marca y canales.
 *
 * La prueba recorre lo que hace el cliente: ve lo que ya está en uso, marca un
 * canal que no venía sugerido, cambia el color y aplica. Después deshace y
 * comprueba que lo que el equipo ya había hecho no se borra.
 *
 * Lo que no puede pasar es que una casilla sin marcar acabe creando trabajo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MarcaCanalesEditor } from '@/components/implantacion/MarcaCanalesEditor'

const CANALES = [
  {
    id: 'referido',
    nombre: 'Referidos y boca a boca',
    comoEntra: 'Alguien te presenta y tú das de alta al cliente.',
    primerPaso: 'Al crear cada lead, poner el canal «referido» y en «fuente» quién lo trajo.',
    requiere: null,
    propuesto: false,
    motivo: '',
    paraEncajar: 'Márcalo si también llegan clientes por aquí.',
    leads: 3,
    conectado: false,
  },
  {
    id: 'web',
    nombre: 'Formulario en tu web',
    comoEntra: 'Rellenan un formulario y el lead se crea sin que nadie lo copie.',
    primerPaso: 'Publicar el formulario y conectarlo a la cuenta.',
    requiere: 'Un formulario publicado en tu web',
    propuesto: true,
    motivo: 'Tu web ya recibe visitas: un formulario conectado convierte esa visita en un lead.',
    paraEncajar: null,
    leads: 0,
    conectado: false,
  },
  {
    id: 'whatsapp',
    nombre: 'WhatsApp',
    comoEntra: 'Escriben al número del negocio y la conversación entra sola.',
    primerPaso: 'Conectar el número de WhatsApp Business.',
    requiere: 'Un número de WhatsApp Business',
    propuesto: false,
    motivo: '',
    paraEncajar: 'Márcalo si también llegan clientes por aquí.',
    leads: 0,
    conectado: true,
  },
]

const GET_BASE = {
  propuesta: {
    nombre: {
      propuesto: 'Estudio Norte',
      actual: null,
      cambia: true,
      motivo: 'Tu cuenta se llama «Estudio Norte».',
    },
    color: {
      propuesto: '#1d4ed8',
      actual: null,
      cambia: true,
      motivo: 'Servicios: el azul es la convención del sector.',
    },
    paleta: [
      { hex: '#1d4ed8', nombre: 'Azul profesional', motivo: 'Servicios: criterio profesional.' },
      { hex: '#0f766e', nombre: 'Verde profundo', motivo: 'Alojamiento: calma y confianza.' },
    ],
    falta: ['Nombre comercial: el que aparece en propuestas', 'Logo: no lo generamos, se sube en Identidad Visual'],
  },
  canales: CANALES,
  origenDeclarado: ['web'],
  seleccion: { nombre: 'Estudio Norte', color: '#1d4ed8', canales: ['web'] },
  resumen: { canales: 1, nombreCambia: true, colorCambia: true, texto: 'nombre y color, con 1 canal.' },
  aplicadoEn: null,
  deshacerDisponible: false,
  avisos: [],
}

function respuesta(json: unknown, ok = true) {
  return { ok, json: async () => json, status: ok ? 200 : 400 } as unknown as Response
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'

    if (metodo === 'GET') return respuesta(GET_BASE)

    if (metodo === 'POST') {
      const cuerpo = JSON.parse(String(init?.body ?? '{}'))
      return respuesta({
        ok: true,
        resultado: {
          nombre: { anterior: null, actual: cuerpo.nombre, cambiado: true },
          color: { anterior: null, actual: cuerpo.color, cambiado: true },
          canales: cuerpo.canales.map((canal: string) => ({
            canal,
            id: `task-${canal}`,
            estado: 'creada',
          })),
          borradas: [],
          conservadas: [],
        },
        avisos: [],
      })
    }

    return respuesta({
      ok: true,
      borradas: [{ canal: 'web', id: 'task-web' }],
      conservadas: [{ canal: 'evento', id: 'task-evento' }],
      ausentes: [],
      restaurado: { nombre: null, color: null },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MarcaCanalesEditor', () => {
  it('aplica el nombre, el color y solo los canales marcados', async () => {
    const onAplicado = vi.fn()
    const usuario = userEvent.setup()
    render(<MarcaCanalesEditor onAplicado={onAplicado} />)

    await screen.findByText('Formulario en tu web')

    await usuario.click(screen.getByLabelText('Marcar el canal Referidos y boca a boca'))
    await usuario.click(screen.getByRole('button', { name: /Aplicar marca y canales/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/implantacion/marca',
        expect.objectContaining({ method: 'POST' }),
      ),
    )

    const cuerpo = JSON.parse(
      fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body,
    )
    expect(cuerpo).toEqual({
      nombre: 'Estudio Norte',
      color: '#1d4ed8',
      canales: ['web', 'referido'],
    })

    await screen.findByText(/Aplicado en tu cuenta/i)
    expect(screen.getByText(/2 tareas de puesta en marcha/i)).toBeTruthy()
    expect(onAplicado).toHaveBeenCalled()
  })

  it('enseña lo que ya está en uso y lo que no se ha propuesto, sin crearlo', async () => {
    render(<MarcaCanalesEditor />)

    await screen.findByText('Formulario en tu web')
    // Un canal con leads en la cuenta se ve tal cual, aunque no venga sugerido.
    expect(screen.getByText(/3 leads ya con este canal/)).toBeTruthy()
    expect(screen.getByText(/Conectado/)).toBeTruthy()
    // Y el que no encaja explica qué haría falta en vez de marcarse solo.
    expect(screen.getAllByText(/Márcalo si también llegan clientes por aquí/).length).toBeGreaterThan(0)

    const referido = screen.getByLabelText('Marcar el canal Referidos y boca a boca') as HTMLInputElement
    expect(referido.checked).toBe(false)
  })

  it('el logo no se genera: dice dónde subirlo', async () => {
    render(<MarcaCanalesEditor />)

    await screen.findByText(/Tu logo no lo generamos/)
    expect(screen.getByRole('link', { name: /Abrir configuración/i }).getAttribute('href')).toBe(
      '/dashboard/configuracion',
    )
  })

  it('deshacer pide confirmación y respeta las tareas que ya están hechas', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET'
      if (metodo === 'GET') return respuesta({ ...GET_BASE, deshacerDisponible: true })
      return respuesta({
        ok: true,
        borradas: [{ canal: 'web', id: 'task-web' }],
        conservadas: [{ canal: 'evento', id: 'task-evento' }],
        ausentes: [],
        restaurado: { nombre: null, color: null },
      })
    })

    const usuario = userEvent.setup()
    render(<MarcaCanalesEditor />)

    await usuario.click(await screen.findByRole('button', { name: /^Deshacer$/i }))
    await usuario.click(screen.getByRole('button', { name: /Sí, deshacer la marca del alta/i }))

    await screen.findByText(/1 tarea se queda porque ya está hecha/i)
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE'),
    ).toBe(true)
  })
})
