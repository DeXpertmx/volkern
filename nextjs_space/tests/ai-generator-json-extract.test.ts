import { describe, it, expect } from 'vitest'
import { extractJsonFromContent } from '../lib/assistant/json-extract'

const VALID = { pages: [{ frames: [{ component: { type: 'wrapper', components: [] } }] }] }

describe('extractJsonFromContent', () => {
  it('parsea JSON puro', () => {
    expect(extractJsonFromContent(JSON.stringify(VALID))).toEqual(VALID)
  })

  it('tolera JSON envuelto en bloque de código markdown con ```json', () => {
    const content = '```json\n' + JSON.stringify(VALID, null, 2) + '\n```'
    expect(extractJsonFromContent(content)).toEqual(VALID)
  })

  it('tolera JSON envuelto en ``` sin lenguaje', () => {
    const content = '```\n' + JSON.stringify(VALID) + '\n```'
    expect(extractJsonFromContent(content)).toEqual(VALID)
  })

  it('tolera texto antes y después del JSON (explicaciones del modelo)', () => {
    const content = 'Aquí tienes tu landing:\n\n' + JSON.stringify(VALID) + '\n\nEspero que te guste.'
    expect(extractJsonFromContent(content)).toEqual(VALID)
  })

  it('tolera fences en líneas propias con texto alrededor', () => {
    const content = 'Respuesta:\n```json\n' + JSON.stringify(VALID) + '\n```\nFin.'
    expect(extractJsonFromContent(content)).toEqual(VALID)
  })

  it('extrae el JSON cuando hay basura antes del primer {', () => {
    const content = '¡Perfecto! El proyecto es:\n' + JSON.stringify(VALID)
    expect(extractJsonFromContent(content)).toEqual(VALID)
  })

  it('respeta strings con llaves y corchetes dentro (no corta mal el bloque)', () => {
    const withBraces = { pages: [{ note: 'dato { raro } y [otro]', ok: true }] }
    const content = '```json\n' + JSON.stringify(withBraces) + '\n```'
    expect(extractJsonFromContent(content)).toEqual(withBraces)
  })

  it('devuelve null si no hay JSON válido', () => {
    expect(extractJsonFromContent('')).toBeNull()
    expect(extractJsonFromContent('la IA respondió con texto plano sin JSON')).toBeNull()
    expect(extractJsonFromContent('{ json incompleto')).toBeNull()
  })

  it('devuelve null si el JSON está truncado sin cerrar', () => {
    const truncated = '{"pages":[{"frames":[{"component":{"type":"wrapper"'
    expect(extractJsonFromContent(truncated)).toBeNull()
  })

  it('parsea un array JSON si el modelo responde con array', () => {
    const arr = [{ a: 1 }, { b: 2 }]
    expect(extractJsonFromContent(JSON.stringify(arr))).toEqual(arr)
  })

  it('continúa buscando si encuentra primero un candidato roto', () => {
    const content = 'texto { roto } respuesta real: ' + JSON.stringify(VALID)
    expect(extractJsonFromContent(content)).toEqual(VALID)
  })
})
