// @vitest-environment node
/**
 * Personalización del alta: reglas del plan de embudo.
 *
 * Lo que se cubre aquí es lo que acaba en el tablero del cliente: que un
 * embudo con una sola etapa no se cree, que dos columnas no se llamen igual, y
 * que las probabilidades signifiquen algo (suben etapa a etapa y la última
 * cierra al 100 %). Cuando algo se corrige, tiene que decirlo: `avisos` es lo
 * que la pantalla pinta en ámbar.
 */

import { describe, it, expect } from 'vitest'
import {
  MAX_ETAPAS,
  MIN_ETAPAS,
  embudoPropuesto,
  normalizarEmbudo,
  resumenEmbudo,
  type EmbudoPlan,
} from '@/lib/implantacion/plan'

const PROPUESTA: EmbudoPlan = {
  nombre: 'Ventas',
  etapas: [
    { nombre: 'Contacto', criterio: 'Ha respondido y sabemos qué quiere', probabilidad: 10 },
    { nombre: 'Propuesta', criterio: 'Tiene la propuesta en su correo', probabilidad: 35 },
    { nombre: 'Decisión', criterio: 'Hay una fecha para el sí o el no', probabilidad: 65 },
    { nombre: 'Cerrado', criterio: 'Firmado o descartado con motivo escrito', probabilidad: 100 },
  ],
}

describe('embudoPropuesto', () => {
  it('lee el embudo que se guardó con la recomendación', () => {
    const propuesto = embudoPropuesto({ embudo: PROPUESTA, informes: [] })
    expect(propuesto).toEqual(PROPUESTA)
  })

  it('sin recomendación no inventa un embudo', () => {
    expect(embudoPropuesto(null)).toBeNull()
    expect(embudoPropuesto({ informe: [] })).toBeNull()
  })
})

describe('normalizarEmbudo', () => {
  it('un embudo válido pasa tal cual, sin avisos', () => {
    const { embudo, avisos } = normalizarEmbudo(PROPUESTA, PROPUESTA)
    expect(embudo).toEqual(PROPUESTA)
    expect(avisos).toEqual([])
  })

  it('descarta etapas sin nombre y lo dice', () => {
    const { embudo, avisos } = normalizarEmbudo(
      {
        nombre: 'Ventas',
        etapas: [
          { nombre: 'Contacto', criterio: 'Responde', probabilidad: 10 },
          { nombre: '   ', criterio: 'Nada', probabilidad: 40 },
          { nombre: 'Cerrado', criterio: 'Firma', probabilidad: 100 },
        ],
      },
      PROPUESTA,
    )

    expect(embudo?.etapas.map((e) => e.nombre)).toEqual(['Contacto', 'Cerrado'])
    expect(avisos.join(' ')).toContain('sin nombre')
  })

  it('no deja dos etapas con el mismo nombre', () => {
    const { embudo, avisos } = normalizarEmbudo(
      {
        nombre: 'Ventas',
        etapas: [
          { nombre: 'Contacto', criterio: 'Responde', probabilidad: 10 },
          { nombre: 'contacto', criterio: 'Otra vez', probabilidad: 40 },
          { nombre: 'Cerrado', criterio: 'Firma', probabilidad: 100 },
        ],
      },
      PROPUESTA,
    )

    expect(embudo?.etapas.map((e) => e.nombre)).toEqual(['Contacto', 'Cerrado'])
    expect(avisos.join(' ')).toContain('repetida')
  })

  it('iguala las probabilidades cuando una baja respecto a la anterior', () => {
    const { embudo, avisos } = normalizarEmbudo(
      {
        nombre: 'Ventas',
        etapas: [
          { nombre: 'Contacto', criterio: 'Responde', probabilidad: 50 },
          { nombre: 'Propuesta', criterio: 'La tiene', probabilidad: 20 },
          { nombre: 'Cerrado', criterio: 'Firma', probabilidad: 100 },
        ],
      },
      PROPUESTA,
    )

    expect(embudo?.etapas.map((e) => e.probabilidad)).toEqual([50, 50, 100])
    expect(avisos.join(' ')).toContain('bajaba')
  })

  it('pone la última etapa al 100 %: es la que cierra', () => {
    const { embudo, avisos } = normalizarEmbudo(
      {
        nombre: 'Ventas',
        etapas: [
          { nombre: 'Contacto', criterio: 'Responde', probabilidad: 10 },
          { nombre: 'Ganada', criterio: 'Firma', probabilidad: 90 },
        ],
      },
      PROPUESTA,
    )

    expect(embudo?.etapas[1].probabilidad).toBe(100)
    expect(avisos.join(' ')).toContain('100')
  })

  it('acota probabilidades fuera de 0–100', () => {
    const { embudo, avisos } = normalizarEmbudo(
      {
        nombre: 'Ventas',
        etapas: [
          { nombre: 'Contacto', criterio: 'Responde', probabilidad: -20 },
          { nombre: 'Ganada', criterio: 'Firma', probabilidad: 400 },
        ],
      },
      PROPUESTA,
    )

    expect(embudo?.etapas.map((e) => e.probabilidad)).toEqual([0, 100])
    expect(avisos.join(' ')).toContain('0–100')
  })

  it('con una sola etapa recompone desde la propuesta y lo dice', () => {
    const { embudo, avisos } = normalizarEmbudo(
      { nombre: 'Pipeline nuevo', etapas: [{ nombre: 'Contacto', criterio: 'Responde', probabilidad: 10 }] },
      PROPUESTA,
    )

    expect(embudo?.nombre).toBe('Pipeline nuevo')
    expect(embudo?.etapas).toHaveLength(MIN_ETAPAS)
    expect(embudo?.etapas[0].nombre).toBe('Contacto')
    expect(embudo?.etapas[1].nombre).toBe('Propuesta')
    expect(avisos.join(' ')).toContain('recompuesto')
  })

  it('sin propuesta de la que tirar no inventa: devuelve null con el motivo', () => {
    const { embudo, avisos } = normalizarEmbudo(
      { nombre: 'Ventas', etapas: [{ nombre: 'Contacto', criterio: '', probabilidad: 10 }] },
      null,
    )

    expect(embudo).toBeNull()
    expect(avisos.join(' ')).toContain('al menos 2 etapas')
  })

  it('recorta por encima del máximo de etapas', () => {
    const etapas = Array.from({ length: MAX_ETAPAS + 2 }, (_, i) => ({
      nombre: `Etapa ${i + 1}`,
      criterio: 'Criterio',
      probabilidad: Math.min(90, i * 10),
    }))

    const { embudo, avisos } = normalizarEmbudo({ nombre: 'Largo', etapas }, PROPUESTA)

    expect(embudo?.etapas).toHaveLength(MAX_ETAPAS)
    expect(avisos.join(' ')).toContain(String(MAX_ETAPAS))
  })

  it('acepta nombres sueltos y reparte probabilidades por posición', () => {
    const { embudo } = normalizarEmbudo({ nombre: 'Rápido', etapas: ['Contacto', 'Propuesta', 'Cerrado'] }, null)

    expect(embudo?.etapas.map((e) => e.nombre)).toEqual(['Contacto', 'Propuesta', 'Cerrado'])
    expect(embudo?.etapas.map((e) => e.probabilidad)).toEqual([0, 50, 100])
  })

  it('avisa de las etapas sin criterio de salida sin bloquear', () => {
    const { embudo, avisos } = normalizarEmbudo(
      {
        nombre: 'Ventas',
        etapas: [
          { nombre: 'Contacto', criterio: '', probabilidad: 10 },
          { nombre: 'Cerrado', criterio: 'Firma', probabilidad: 100 },
        ],
      },
      PROPUESTA,
    )

    expect(embudo).not.toBeNull()
    expect(avisos.join(' ')).toContain('criterio de salida')
  })

  it('sin nombre usa el de la propuesta', () => {
    const { embudo } = normalizarEmbudo({ nombre: '   ', etapas: PROPUESTA.etapas }, PROPUESTA)
    expect(embudo?.nombre).toBe('Ventas')
  })
})

describe('resumenEmbudo', () => {
  it('cuenta las etapas y las que no dicen cuándo salir', () => {
    const resumen = resumenEmbudo({
      nombre: 'Ventas',
      etapas: [
        { nombre: 'Contacto', criterio: 'Responde', probabilidad: 10 },
        { nombre: 'Propuesta', criterio: '', probabilidad: 50 },
        { nombre: 'Cerrado', criterio: 'Firma', probabilidad: 100 },
      ],
    })

    expect(resumen).toMatchObject({ etapas: 3, sinCriterio: 1, completo: false })
    expect(resumen.texto).toContain('1 sin criterio')
  })

  it('marca completo cuando todas tienen criterio', () => {
    expect(resumenEmbudo(PROPUESTA)).toMatchObject({ etapas: 4, sinCriterio: 0, completo: true })
  })
})
