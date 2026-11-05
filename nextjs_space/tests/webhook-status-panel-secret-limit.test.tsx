// @vitest-environment jsdom
//
// Panel de estado del webhook: la sección «Secret del webhook (por IP)» debe
// mostrar las IPs bloqueadas (con su cuenta atrás) y las que acumulan fallos
// sin llegar al bloqueo, para poder ver desde la UI quién está siendo cortado
// antes de tocar la base de datos.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { WebhookStatusPanel } from '@/components/dashboard/WebhookStatusPanel'

const metricsBase = {
  today: { telegram: 3, evolution: 1, total: 4 },
  topChats: [],
  byDay: [],
  lastRejectedAt: null,
  lastRejectedChannel: null,
  lastRejected: null,
}

function respuesta(secretLimit: unknown, isAdmin = false) {
  return {
    metrics: metricsBase,
    secretLimit,
    isAdmin,
    processUptime: 120,
    processPid: 4242,
    timestamp: new Date().toISOString(),
  }
}

function stubFetch(payload: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => payload,
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

let desmontar: (() => void) | null = null

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  desmontar?.()
  desmontar = null
  vi.unstubAllGlobals()
})

describe('WebhookStatusPanel — secret del webhook por IP', () => {
  it('muestra las IPs bloqueadas con su cuenta atrás y las que solo acumulan fallos', async () => {
    stubFetch(
      respuesta({
        bloqueadas: [{ ip: '203.0.113.9', fallos: 7, restanteSegundos: 600 }],
        fallos: [{ ip: '198.51.100.7', fallos: 2, restanteSegundos: 45 }],
        totalBloqueadas: 1,
        totalFallos: 2,
      })
    )

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    expect(await screen.findByText('Secret del webhook (por IP)')).toBeTruthy()
    expect(await screen.findByText('203.0.113.9')).toBeTruthy()
    expect(await screen.findByText('bloqueada tras 7 secrets inválidos')).toBeTruthy()
    expect(await screen.findByText('10 min')).toBeTruthy()

    expect(await screen.findByText('198.51.100.7')).toBeTruthy()
    expect(await screen.findByText('2 fallos')).toBeTruthy()
    expect(await screen.findByText(/aún sin bloquear · ventana 45 s/)).toBeTruthy()
  })

  it('sin bloqueos ni fallos muestra el estado tranquilo', async () => {
    stubFetch(
      respuesta({ bloqueadas: [], fallos: [], totalBloqueadas: 0, totalFallos: 0 })
    )

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    expect(await screen.findByText('Sin secrets inválidos ni IPs bloqueadas.')).toBeTruthy()
  })

  it('tolera una respuesta sin secretLimit (API anterior)', async () => {
    stubFetch(respuesta(undefined))

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    expect(await screen.findByText('Sin secrets inválidos ni IPs bloqueadas.')).toBeTruthy()
  })
})

describe('WebhookStatusPanel — historial de auditoría', () => {
  const vacio = { bloqueadas: [], fallos: [], totalBloqueadas: 0, totalFallos: 0 }

  function conHistorial(historial: unknown[]) {
    return {
      metrics: metricsBase,
      secretLimit: vacio,
      historial,
      isAdmin: true,
      processUptime: 120,
      processPid: 4242,
      timestamp: new Date().toISOString(),
    }
  }

  it('muestra los desbloqueos y reinicios recientes con su autor y fallos descartados', async () => {
    const ahora = new Date().toISOString()
    stubFetch(
      conHistorial([
        {
          id: 'a1',
          accion: 'telegram_secret_ip_desbloqueada',
          objetivo: '203.0.113.9',
          descripcion: 'Desbloqueo manual de la IP 203.0.113.9 por Bruno Hess',
          autor: 'Bruno Hess',
          fallosDescartados: 7,
          fecha: ahora,
        },
        {
          id: 'a2',
          accion: 'webhook_metrics_reset',
          objetivo: 'rate-limit',
          descripcion: 'Reinicio de las métricas del día',
          autor: 'Bruno Hess',
          fallosDescartados: 0,
          fecha: ahora,
        },
      ])
    )

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    expect(await screen.findByText('Últimas acciones (auditoría)')).toBeTruthy()
    expect(screen.getByText('Desbloqueo de 203.0.113.9')).toBeTruthy()
    expect(screen.getByText('Bruno Hess · 7 fallos descartados')).toBeTruthy()
    expect(screen.getByText('Reinicio de métricas')).toBeTruthy()
    // El reinicio no descarta fallos: solo se muestra el autor.
    expect(screen.getByText('Bruno Hess')).toBeTruthy()
  })

  it('sin historial no se muestra la sección', async () => {
    stubFetch(conHistorial([]))

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    expect(await screen.findByText('Sin secrets inválidos ni IPs bloqueadas.')).toBeTruthy()
    expect(screen.queryByText('Últimas acciones (auditoría)')).toBeNull()
  })

  it('tolera una respuesta sin historial (API anterior)', async () => {
    stubFetch(respuesta(undefined))

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    expect(await screen.findByText('Sin secrets inválidos ni IPs bloqueadas.')).toBeTruthy()
    expect(screen.queryByText('Últimas acciones (auditoría)')).toBeNull()
  })

  it('si el audit log no guardó al autor, lo dice en vez de dejar el hueco', async () => {
    stubFetch(
      conHistorial([
        {
          id: 'c1',
          accion: 'telegram_secret_ip_desbloqueada',
          objetivo: '198.51.100.7',
          descripcion: 'x',
          autor: null,
          fallosDescartados: 1,
          fecha: new Date().toISOString(),
        },
      ])
    )

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    expect(
      await screen.findByText('Autor no registrado · 1 fallo descartado')
    ).toBeTruthy()
  })
})

describe('WebhookStatusPanel — filtros del historial', () => {
  const unaAccion = [
    {
      id: 'a1',
      accion: 'telegram_secret_ip_desbloqueada',
      objetivo: '203.0.113.9',
      descripcion: 'Desbloqueo manual',
      autor: 'Bruno Hess',
      fallosDescartados: 7,
      fecha: new Date().toISOString(),
    },
  ]

  function payload(historial: unknown[]) {
    return {
      metrics: metricsBase,
      secretLimit: { bloqueadas: [], fallos: [], totalBloqueadas: 0, totalFallos: 0 },
      historial,
      isAdmin: false,
      processUptime: 120,
      processPid: 4242,
      timestamp: new Date().toISOString(),
    }
  }

  function stubFetchConRespuesta(historial: unknown[]) {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => payload(historial) }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const urlsPedidas = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.map(([url]) => String(url))

  it('el chip de tipo de acción recarga con ?accion= en el servidor', async () => {
    const fetchMock = stubFetchConRespuesta(unaAccion)

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    const chip = await screen.findByRole('button', { name: 'Reinicios' })
    fireEvent.click(chip)

    await waitFor(() =>
      expect(urlsPedidas(fetchMock).some((u) => u.includes('accion=reinicio'))).toBe(true)
    )
    // El chip queda marcado como activo.
    expect(chip.getAttribute('aria-pressed')).toBe('true')
  })

  it('el filtro por autor viaja codificado tras el retardo del teclado', async () => {
    const fetchMock = stubFetchConRespuesta(unaAccion)

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    const input = await screen.findByLabelText('Filtrar el historial por autor')
    fireEvent.change(input, { target: { value: 'José Pérez' } })

    await waitFor(
      () => expect(urlsPedidas(fetchMock).some((u) => u.includes('autor=Jos%C3%A9+P%C3%A9rez'))).toBe(true),
      { timeout: 2000 }
    )
  })

  it('limpiar el autor vuelve a pedir sin ese filtro', async () => {
    const fetchMock = stubFetchConRespuesta(unaAccion)

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    const input = await screen.findByLabelText('Filtrar el historial por autor')
    fireEvent.change(input, { target: { value: 'bruno' } })
    await waitFor(() =>
      expect(urlsPedidas(fetchMock).some((u) => u.includes('autor=bruno'))).toBe(true)
    )

    fireEvent.click(screen.getByLabelText('Limpiar el filtro por autor'))

    await waitFor(() =>
      expect(urlsPedidas(fetchMock).at(-1)).toBe('/api/webhook-status')
    )
  })

  it('sin resultados con filtros avisa y permite quitarlos', async () => {
    // Hay historial sin filtros; al filtrar por desbloqueos no queda nada.
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => payload(String(url).includes('accion=') ? [] : unaAccion),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    expect(await screen.findByText('Desbloqueo de 203.0.113.9')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desbloqueos' }))

    expect(await screen.findByText('Sin acciones con esos filtros.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }))

    // Vuelve a pedir sin filtros y el chip «Todo» queda activo.
    await waitFor(() =>
      expect(urlsPedidas(fetchMock).at(-1)).toBe('/api/webhook-status')
    )
    expect(
      screen.getByRole('button', { name: 'Todo' }).getAttribute('aria-pressed')
    ).toBe('true')
    expect(screen.queryByText('Sin acciones con esos filtros.')).toBeNull()
  })

  it('al cargar no envía filtros ni duplica la petición inicial', async () => {
    const fetchMock = stubFetchConRespuesta(unaAccion)

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    expect(await screen.findByText('Desbloqueo de 203.0.113.9')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 60))
    expect(urlsPedidas(fetchMock)).toEqual(['/api/webhook-status'])
  })
})

describe('WebhookStatusPanel — paginación del historial', () => {
  const accion = (id: string, objetivo: string) => ({
    id,
    accion: 'telegram_secret_ip_desbloqueada',
    objetivo,
    descripcion: 'd',
    autor: 'Bruno Hess',
    fallosDescartados: 1,
    fecha: new Date().toISOString(),
  })

  const pagina1 = accion('ck1', '203.0.113.9')
  const pagina2 = accion('ck9', '198.51.100.7')

  function conCursor(
    historial: unknown[],
    cursor: string | null,
    hayMas: boolean
  ) {
    return {
      metrics: metricsBase,
      secretLimit: { bloqueadas: [], fallos: [], totalBloqueadas: 0, totalFallos: 0 },
      historial,
      historialCursor: cursor,
      historialHayMas: hayMas,
      isAdmin: false,
      processUptime: 120,
      processPid: 4242,
      timestamp: new Date().toISOString(),
    }
  }

  function stubPorPagina() {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('cursor=')
        ? { ok: true, json: async () => conCursor([pagina2], null, false) }
        : { ok: true, json: async () => conCursor([pagina1], 'ck8', true) }
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const urls = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.map(([url]) => String(url))

  it('pide la página siguiente con el cursor y desactiva el botón al final', async () => {
    const fetchMock = stubPorPagina()

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    expect(await screen.findByText('Página 1')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Página siguiente del historial'))

    await waitFor(() => expect(urls(fetchMock).some((u) => u.includes('cursor=ck8'))).toBe(true))
    expect(await screen.findByText('Página 2')).toBeTruthy()
    expect(await screen.findByText('Desbloqueo de 198.51.100.7')).toBeTruthy()
    expect(
      screen.getByLabelText('Página siguiente del historial').hasAttribute('disabled')
    ).toBe(true)
  })

  it('«Anterior» vuelve a pedir la primera página sin cursor', async () => {
    const fetchMock = stubPorPagina()

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    fireEvent.click(await screen.findByLabelText('Página siguiente del historial'))
    await screen.findByText('Página 2')

    fireEvent.click(screen.getByLabelText('Página anterior del historial'))

    await waitFor(() => {
      const ultima = urls(fetchMock).at(-1)!
      expect(ultima).toBe('/api/webhook-status')
    })
    expect(await screen.findByText('Página 1')).toBeTruthy()
  })

  it('cambiar de filtro invalida la paginación y vuelve a la primera página', async () => {
    const fetchMock = stubPorPagina()

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    fireEvent.click(await screen.findByLabelText('Página siguiente del historial'))
    await screen.findByText('Página 2')

    fireEvent.click(screen.getByRole('button', { name: 'Reinicios' }))

    await waitFor(() => {
      const ultima = urls(fetchMock).at(-1)!
      expect(ultima).toContain('accion=reinicio')
      expect(ultima).not.toContain('cursor=')
    })
    expect(await screen.findByText('Página 1')).toBeTruthy()
  })

  it('sin más páginas no se muestra el paginador', async () => {
    stubFetch(
      (() => {
        return {
          metrics: metricsBase,
          secretLimit: { bloqueadas: [], fallos: [], totalBloqueadas: 0, totalFallos: 0 },
          historial: [pagina1],
          historialCursor: null,
          historialHayMas: false,
          isAdmin: false,
          processUptime: 120,
          processPid: 4242,
          timestamp: new Date().toISOString(),
        }
      })()
    )

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    expect(await screen.findByText('Desbloqueo de 203.0.113.9')).toBeTruthy()
    expect(screen.queryByText(/Página 1/)).toBeNull()
  })
})

describe('WebhookStatusPanel — desbloqueo manual de IPs', () => {
  const bloqueo = {
    bloqueadas: [{ ip: '203.0.113.9', fallos: 7, restanteSegundos: 600 }],
    fallos: [],
    totalBloqueadas: 1,
    totalFallos: 7,
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('un admin ve el botón de desbloquear y lo envía como DELETE con la IP', async () => {
    const fetchMock = stubFetch(respuesta(bloqueo, true))
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    const boton = await screen.findByRole('button', { name: /Desbloquear/ })
    expect(boton.getAttribute('title')).toContain('203.0.113.9')

    fireEvent.click(boton)

    await waitFor(() => {
      const llamada = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes('ip=') && init?.method === 'DELETE'
      )
      expect(llamada).toBeTruthy()
      expect(String(llamada![0])).toBe('/api/webhook-status?ip=203.0.113.9')
    })

    // Tras desbloquear se refresca el estado para que la fila desaparezca.
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1))
  })

  it('quien no es admin no ve el botón de desbloquear', async () => {
    stubFetch(respuesta(bloqueo, false))

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    expect(await screen.findByText('203.0.113.9')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Desbloquear/ })).toBeNull()
  })

  it('si se cancela la confirmación no se envía nada', async () => {
    const fetchMock = stubFetch(respuesta(bloqueo, true))
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    fireEvent.click(await screen.findByRole('button', { name: /Desbloquear/ }))

    await new Promise((r) => setTimeout(r, 20))
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')
    ).toBe(false)
  })

  it('si el desbloqueo es rechazado, el motivo se muestra en el panel', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? { ok: false, status: 403, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => respuesta(bloqueo, true) }
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { unmount } = render(<WebhookStatusPanel />)
    desmontar = unmount

    fireEvent.click(await screen.findByRole('button', { name: /Desbloquear/ }))

    expect(await screen.findByText('Desbloquear: HTTP 403')).toBeTruthy()
    // El bloqueo sigue visible: no se refrescó con datos falsos.
    expect(screen.getByText('203.0.113.9')).toBeTruthy()
  })
})
