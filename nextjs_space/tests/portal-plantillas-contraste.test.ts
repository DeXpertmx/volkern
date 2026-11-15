// Contraste de la marca del portal y plantillas.
//
// El panel deja elegir cualquier color; estas funciones son las que evitan que
// un amarillo claro deje el titular del hero ilegible.
import { describe, it, expect } from 'vitest'
import {
  aclarar,
  colorTextoEnClaro,
  colorTextoSobre,
  fondoConTextoBlanco,
  fondoHeroMarca,
  oscurecer,
  ratioContraste,
} from '@/lib/real-estate/contraste'
import { normalizarPlantilla, tokensPortal } from '@/lib/real-estate/portal-templates'

describe('contraste de la marca', () => {
  it('deja intacto un color oscuro que ya admite texto blanco', () => {
    expect(colorTextoSobre('#b45309')).toBe('#ffffff')
    expect(fondoConTextoBlanco('#b45309')).toBe('#b45309')
    expect(ratioContraste('#b45309', '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('oscurece un amarillo claro hasta que la etiqueta blanca se lee', () => {
    const ajustado = fondoConTextoBlanco('#facc15')
    expect(ajustado).not.toBe('#facc15')
    expect(ratioContraste(ajustado, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('elige texto oscuro sobre fondos claros', () => {
    expect(colorTextoSobre('#facc15')).toBe('#111827')
  })

  it('el hero de marca cumple contraste en los dos extremos del degradado', () => {
    for (const color of ['#b45309', '#facc15', '#3b82f6', '#ffffff', '#000000', 'no-es-un-color']) {
      const { base, fin, texto } = fondoHeroMarca(color)
      expect(ratioContraste(base, texto)).toBeGreaterThanOrEqual(4.5)
      expect(ratioContraste(fin, texto)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('los enlaces de marca se leen sobre blanco', () => {
    expect(ratioContraste(colorTextoEnClaro('#facc15'), '#ffffff')).toBeGreaterThanOrEqual(4.5)
    // Un color que ya contrasta sobre blanco no se toca.
    expect(colorTextoEnClaro('#b45309')).toBe('#b45309')
  })

  it('aclarar y oscurecer se mueven hacia su extremo', () => {
    expect(aclarar('#000000', 1)).toBe('#ffffff')
    expect(ratioContraste(oscurecer('#ffffff', 1), '#ffffff')).toBeGreaterThan(15)
  })
})

describe('plantillas del portal', () => {
  it('acepta los valores válidos, con o sin comillas del JSON', () => {
    expect(normalizarPlantilla('foto')).toBe('foto')
    expect(normalizarPlantilla('"marca"')).toBe('marca')
    expect(normalizarPlantilla(' marca ')).toBe('marca')
  })

  it('cada plantilla impone sus tokens a las tres páginas', () => {
    const foto = tokensPortal('foto')
    const marca = tokensPortal('marca')

    expect(foto.hero).toBe('foto')
    expect(marca.hero).toBe('marca')
    expect(foto.radio).not.toBe(marca.radio)
    expect(foto.radioControl).not.toBe(marca.radioControl)
    expect(foto.titulo).not.toBe(marca.titulo)
    expect(foto.tituloPrincipal).toContain('font-bold')
    expect(marca.tituloPrincipal).toContain('font-black')
  })

  it('cae en foto cuando falta o no se reconoce', () => {
    expect(normalizarPlantilla(undefined)).toBe('foto')
    expect(normalizarPlantilla(null)).toBe('foto')
    expect(normalizarPlantilla('cartelera')).toBe('foto')
    expect(normalizarPlantilla(42)).toBe('foto')
  })
})
