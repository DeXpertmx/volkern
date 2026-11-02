// @vitest-environment node
/**
 * Siguiente pregunta del cuestionario (R3).
 *
 * Se prueba que el orden de atención sea una función del descubrimiento, no del
 * azar: se propone la pregunta que más cambia la propuesta, lo contestado no se
 * repite y «no lo sé» cuenta como respuesta.
 */

import { describe, it, expect } from 'vitest'
import { prioridadPregunta, siguientePregunta } from '@/lib/implantacion/adaptativo'
import { PREGUNTAS, type Descubrimiento } from '@/lib/implantacion/descubrimiento'

const d = (over: Partial<Descubrimiento> = {}): Descubrimiento => ({
  respuestas: {},
  noSe: [],
  notas: '',
  version: 1,
  ...over,
})

describe('siguientePregunta', () => {
  it('con el cuestionario vacío empieza por el dolor', () => {
    expect(siguientePregunta(d())?.id).toBe('dolor')
  })

  it('con el dolor contestado pasa a lo que define el catálogo', () => {
    expect(siguientePregunta(d({ respuestas: { dolor: ['leads_frios'] } }))?.id).toBe('que_vende')
  })

  it('«no lo sé» cuenta como contestada: no se vuelve a proponer', () => {
    expect(siguientePregunta(d({ noSe: ['dolor'] }))?.id).toBe('que_vende')
  })

  it('baja de prioridad cuando ya está lo que más cambia la propuesta', () => {
    const siguiente = siguientePregunta(
      d({
        respuestas: {
          dolor: ['leads_frios'],
          que_vende: ['servicios'],
          a_quien: ['empresas'],
          ciclo: ['menos_7d'],
          equipo: ['solo'],
          tras_propuesta: ['llamo_yo'],
        },
      }),
    )

    expect(siguiente?.id).toBe('coste_error')
  })

  it('no depende del orden en que se contestó', () => {
    const primera = siguientePregunta(
      d({ respuestas: { ciclo: ['menos_7d'], dolor: ['prevision'], equipo: ['solo'] } }),
    )
    const segunda = siguientePregunta(
      d({ respuestas: { equipo: ['solo'], dolor: ['prevision'], ciclo: ['menos_7d'] } }),
    )

    expect(primera?.id).toBe(segunda?.id)
  })

  it('devuelve null cuando ya está todo respondido', () => {
    const respuestas = Object.fromEntries(PREGUNTAS.map((p) => [p.id, [p.opciones[0].valor]]))

    expect(siguientePregunta(d({ respuestas }))).toBeNull()
  })

  it('devuelve null si todo está marcado como «no lo sé»', () => {
    expect(siguientePregunta(d({ noSe: PREGUNTAS.map((p) => p.id) }))).toBeNull()
  })

  it('el dolor pesa más que el canal de origen', () => {
    expect(prioridadPregunta('dolor')).toBeGreaterThan(prioridadPregunta('origen'))
    expect(prioridadPregunta('que_vende')).toBeGreaterThan(prioridadPregunta('panel'))
  })
})
