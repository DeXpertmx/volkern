import { describe, it, expect } from 'vitest'
import {
  adaptiveLensParams,
  LENS_SIZE_MIN,
  LENS_SIZE_MAX,
  LENS_ZOOM_MIN,
  LENS_ZOOM_MAX,
} from '@/components/finance/ocr-viewer-shared'

describe('adaptiveLensParams', () => {
  it('usa el aumento base cuando la imagen se muestra a su resolución natural', () => {
    // 1000px de fuente mostrados a 1000px CSS → densidad 1 → aumento mínimo
    const { zoom, size } = adaptiveLensParams(1000, 1000)
    expect(zoom).toBe(LENS_ZOOM_MIN)
    expect(size).toBeGreaterThanOrEqual(LENS_SIZE_MIN)
    expect(size).toBeLessThanOrEqual(LENS_SIZE_MAX)
  })

  it('fuente más grande → más aumento (densidad alta)', () => {
    const low = adaptiveLensParams(1200, 800) // densidad 1.5
    const high = adaptiveLensParams(3200, 800) // densidad 4
    expect(high.zoom).toBeGreaterThan(low.zoom)
    expect(high.size).toBeGreaterThan(low.size)
  })

  it('satura el aumento en imágenes de muy alta resolución', () => {
    const { zoom } = adaptiveLensParams(8000, 400)
    expect(zoom).toBe(LENS_ZOOM_MAX)
  })

  it('nunca devuelve un aumento inferior al mínimo', () => {
    const { zoom } = adaptiveLensParams(400, 1600) // imagen pequeña muy estirada
    expect(zoom).toBe(LENS_ZOOM_MIN)
  })

  it('no falla sin datos de resolución', () => {
    const { zoom, size } = adaptiveLensParams(0, 0)
    expect(zoom).toBeGreaterThanOrEqual(LENS_ZOOM_MIN)
    expect(size).toBeGreaterThanOrEqual(LENS_SIZE_MIN)
  })

  it('con el visor ampliado la densidad sigue siendo la de la fuente', () => {
    // El visor con zoom 2 muestra 400 CSS px de una imagen de 1600px.
    // La densidad se calcula sobre el ancho mostrado SIN el zoom del visor
    // (se le pasa ya dividido), por lo que debe dar densidad 4.
    const { zoom } = adaptiveLensParams(1600, 400)
    expect(zoom).toBeGreaterThanOrEqual(4)
  })
})
