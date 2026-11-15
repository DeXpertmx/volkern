// Vigencia del catálogo público.
//
// Una ficha que nadie guarda en meses deja de listarse; el umbral es configurable
// por cuenta y nunca puede quedar en cero (eso vaciaría el portal).
import { describe, it, expect } from 'vitest'
import {
  DIAS_VIGENCIA_POR_DEFECTO,
  MAX_DIAS_VIGENCIA,
  MIN_DIAS_VIGENCIA,
  corteVigencia,
  normalizarDiasVigencia,
} from '@/lib/real-estate/portal-vigencia'
import { rutasPortalDeCuenta } from '@/lib/real-estate/portal-seo'

describe('días de vigencia', () => {
  it('usa 90 días cuando no hay configuración válida', () => {
    expect(DIAS_VIGENCIA_POR_DEFECTO).toBe(90)
    expect(normalizarDiasVigencia(undefined)).toBe(90)
    expect(normalizarDiasVigencia('')).toBe(90)
    expect(normalizarDiasVigencia('abc')).toBe(90)
    expect(normalizarDiasVigencia(0)).toBe(90)
    expect(normalizarDiasVigencia(-5)).toBe(90)
  })

  it('acepta el valor guardado como texto y lo acota', () => {
    expect(normalizarDiasVigencia('30')).toBe(30)
    expect(normalizarDiasVigencia(45.4)).toBe(45)
    expect(normalizarDiasVigencia(1)).toBe(MIN_DIAS_VIGENCIA)
    expect(normalizarDiasVigencia(9999)).toBe(MAX_DIAS_VIGENCIA)
  })

  it('calcula el corte hacia atrás desde la fecha dada', () => {
    const ahora = new Date('2026-11-15T12:00:00Z')
    // El corte se calcula en días de calendario: el cambio de hora puede mover
    // la hora exacta, así que se comprueba la fecha y el margen de un día.
    const corte = corteVigencia(90, ahora)
    expect(corte.toISOString().slice(0, 10)).toBe('2026-08-17')
    const dias = (ahora.getTime() - corte.getTime()) / 86_400_000
    expect(dias).toBeGreaterThan(89)
    expect(dias).toBeLessThan(91)

    expect(corteVigencia(7, ahora).toISOString().slice(0, 10)).toBe('2026-11-08')
  })
})

describe('rutas a revalidar', () => {
  it('incluye portada, catálogo y ficha con su imagen OG', () => {
    expect(
      rutasPortalDeCuenta({ slug: 'vre-norte', propiedadId: 'inm-1' })
    ).toEqual([
      '/p/vre-norte',
      '/p/vre-norte/propiedades',
      '/p/vre-norte/propiedades/inm-1',
      '/p/vre-norte/propiedades/inm-1/opengraph-image',
    ])
  })

  it('sin inmueble concreto invalida portada y catálogo', () => {
    expect(rutasPortalDeCuenta({ slug: 'vre-norte' })).toEqual([
      '/p/vre-norte',
      '/p/vre-norte/propiedades',
    ])
  })

  it('cubre el alias del portal sin repetir rutas', () => {
    const rutas = rutasPortalDeCuenta({ slug: 'vre-norte', alias: 'norte', propiedadId: 'inm-1' })
    expect(rutas).toHaveLength(8)
    expect(rutas).toContain('/p/norte/propiedades/inm-1')
    expect(new Set(rutas).size).toBe(rutas.length)

    const mismoAlias = rutasPortalDeCuenta({ slug: 'vre-norte', alias: 'vre-norte', propiedadId: 'inm-1' })
    expect(mismoAlias).toHaveLength(4)
  })
})
