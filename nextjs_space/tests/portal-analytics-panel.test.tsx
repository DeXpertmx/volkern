// @vitest-environment jsdom
//
// Panel de rendimiento del portal: la matriz ve su fila y las de sus oficinas.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

const fila = (nombre: string, esMatriz: boolean, plantilla: 'foto' | 'marca', portada: number, leads: number) => ({
  tenantId: nombre.toLowerCase(),
  nombre,
  esMatriz,
  plantilla,
  metricas: {
    visitasPortada: portada,
    visitasFichas: portada * 2,
    clicsContacto: leads,
    leads,
    operaciones: 1,
    porPlantilla: {
      foto: { visitasPortada: 0, visitasFichas: 0, clicsContacto: 0 },
      marca: { visitasPortada: 0, visitasFichas: 0, clicsContacto: 0 },
    },
  },
})

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        filas: [
          fila('Matriz', true, 'marca', 100, 4),
          fila('VRE Norte', false, 'foto', 50, 1),
        ],
        red: {
          visitasPortada: 150,
          visitasFichas: 300,
          clicsContacto: 5,
          leads: 5,
          operaciones: 2,
          porPlantilla: {
            foto: { visitasPortada: 50, visitasFichas: 100, clicsContacto: 1 },
            marca: { visitasPortada: 100, visitasFichas: 200, clicsContacto: 4 },
          },
        },
      }),
    })) as unknown as typeof fetch
  )
})

import PortalAnalyticsPanel from '@/components/real-estate/PortalAnalyticsPanel'

describe('panel de analítica del portal', () => {
  it('muestra matriz y oficinas con su plantilla y los leads', async () => {
    render(<PortalAnalyticsPanel />)

    const nombreMatriz = (await screen.findAllByText('Matriz'))[0]
    expect(nombreMatriz).toBeTruthy()
    expect(screen.getByText('VRE Norte')).toBeTruthy()
    expect(screen.getByText('marca')).toBeTruthy()
    expect(screen.getByText('foto')).toBeTruthy()

    const filaMatriz = nombreMatriz.closest('tr')!
    expect(filaMatriz.textContent).toContain('100')
    expect(filaMatriz.textContent).toContain('4')

    expect(screen.getByText(/Por plantilla: foto/)).toBeTruthy()
  })
})
