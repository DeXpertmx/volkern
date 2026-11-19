/**
 * Etapa B — Clasificación de riesgo y confirmaciones.
 *
 * La clase A/B/C/D se decide en backend, nunca la declara el modelo: una
 * herramienta C (impacto externo) o D (destructiva) exige aprobación y no se
 * ejecuta directa. Hoy el chat sólo expone A y B; las C/D llegan en la etapa
 * siguiente, pero la clasificación y el contrato de «acción pendiente» ya
 * están probados para que nadie las exponga sin su flujo.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  clasificarRiesgo,
  requiereAprobacion,
} from '@/lib/agents/riesgo-herramientas'
import { construirSalidaEstructurada } from '@/lib/agents/salida-estructurada'

vi.mock('@/lib/db', async () => {
  const { prismaActual } = await import('../ayuda/prisma-en-memoria')
  const delegado = new Proxy({}, { get: (_t, prop: string) => (prismaActual.prisma as any)[prop] })
  return { prisma: delegado, default: delegado, globalPrisma: delegado, getTenantDb: async () => delegado }
})

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithToolLoop: async () => ({ choices: [{ message: { content: '' } }] }),
  callAssistantWithFallback: async () => ({ choices: [{ message: { content: '' } }] }),
}))

describe('clasificación centralizada', () => {
  it('las lecturas son clase A y se ejecutan directas', () => {
    const riesgo = clasificarRiesgo('buscar_propiedades', 'ver')
    expect(riesgo.clase).toBe('A')
    expect(riesgo.requiereAprobacion).toBe(false)
  })

  it('las escrituras reversibles son clase B y se ejecutan con trazabilidad', () => {
    const riesgo = clasificarRiesgo('crear_tarea', 'editar')
    expect(riesgo.clase).toBe('B')
    expect(riesgo.requiereAprobacion).toBe(false)
  })

  it('el impacto externo es clase C y exige aprobación', () => {
    const riesgo = clasificarRiesgo('send_message')
    expect(riesgo.clase).toBe('C')
    expect(riesgo.requiereAprobacion).toBe(true)
    expect(riesgo.requiereReautenticacion).toBe(false)
  })

  it('lo destructivo es clase D y exige aprobación y reautenticación', () => {
    const riesgo = clasificarRiesgo('cancel_invoice')
    expect(riesgo.clase).toBe('D')
    expect(riesgo.requiereAprobacion).toBe(true)
    expect(riesgo.requiereReautenticacion).toBe(true)
  })

  it('requiereAprobacion refleja sólo C y D', () => {
    expect(requiereAprobacion('A')).toBe(false)
    expect(requiereAprobacion('B')).toBe(false)
    expect(requiereAprobacion('C')).toBe(true)
    expect(requiereAprobacion('D')).toBe(true)
  })
})

describe('el registro no expone hoy nada de clase C/D', () => {
  it('todas las herramientas del chat son A (lectura) o B (escritura)', async () => {
    const { herramientasDelRegistro } = await import('@/lib/agents/tool-registry')
    const definiciones = herramientasDelRegistro()
    expect(definiciones.length).toBeGreaterThan(0)
    for (const definicion of definiciones) {
      expect(['A', 'B']).toContain(definicion.riesgo)
    }
  })
})

describe('acciones pendientes de aprobación', () => {
  it('una acción pendiente va a `pendientes`, separada de las ejecutadas', () => {
    const salida = construirSalidaEstructurada(
      [
        { tool: 'crear_tarea', estado: 'ok', resultado: { ok: true, id: 't-1', titulo: 'Llamar' } },
        { tool: 'send_message', estado: 'pendiente', error: 'Esta acción requiere aprobación antes de ejecutarse.' },
      ],
      'Tarea creada; el envío queda pendiente de aprobación.'
    )

    expect(salida.acciones.map((a) => a.tool)).toEqual(['crear_tarea'])
    expect(salida.pendientes.map((a) => a.tool)).toEqual(['send_message'])
    expect(salida.pendientes[0].estado).toBe('pendiente')
  })
})
