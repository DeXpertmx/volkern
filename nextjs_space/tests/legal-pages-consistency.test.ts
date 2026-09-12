import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { TRIAL_DAYS } from '@/lib/plans'
import { VERTICAL_PLANS, VERTICAL_PLAN_PRICES } from '@/lib/vertical-plans'

/**
 * GUARDIA DE LAS PÁGINAS LEGALES
 *
 * Por qué existe: los términos y la política de reembolsos publican dos cosas
 * que son parámetros reales de la aplicación —los precios de las verticales y
 * los días de prueba gratuita— y estaban escritos a mano. Eso es exactamente lo
 * que permitió que la portada anunciara 49 € mientras el cobro leía otra tabla,
 * y que los términos publicaran una lista de precios que nadie cotejaba.
 *
 * Estas pruebas no comparan texto contra texto: comparan lo PUBLICADO contra la
 * fuente real (`lib/vertical-plans.ts` y `TRIAL_DAYS`). Si alguien cambia el
 * precio de una vertical o la duración de la prueba y olvida la política, esto
 * falla con el número concreto.
 *
 * Los plazos legales que NO son parámetros del producto —el plazo de
 * desistimiento y los de soporte— no se atan a `TRIAL_DAYS` a propósito: son
 * derecho aplicable, no configuración. Solo se exige que las páginas coincidan
 * entre sí, que es el fallo real que puede colarse.
 */

const APP_ROOT = path.resolve(__dirname, '..')

/** Las cuatro páginas legales públicas. */
const PAGINAS_LEGALES = [
  'app/terms/page.tsx',
  'app/reembolsos/page.tsx',
  'app/privacy/page.tsx',
  'app/security/page.tsx',
]

/** Además de las legales, la página de precios publica importes en su cabecera. */
const SUPERFICIES_CON_PRECIOS = [...PAGINAS_LEGALES, 'app/precios/page.tsx']

function leer(rel: string): string {
  const abs = path.join(APP_ROOT, rel)
  expect(fs.existsSync(abs), `falta ${rel}`).toBe(true)
  return fs.readFileSync(abs, 'utf8')
}

describe('páginas legales — los días de prueba son los de la aplicación', () => {
  it('cada mención a la prueba gratuita publica TRIAL_DAYS', () => {
    // Dos formas de decirlo conviven en las páginas:
    //   "prueba gratuita de 14 días"   y   "14 días de prueba gratuita"
    // Se evita a propósito casar "14 días naturales", que es el plazo legal de
    // desistimiento y no la duración de la prueba.
    const patron =
      /(\d+)\s*d[íi]as?\s*(?:de\s*)?(?:prueba|gratis|gratuita)|(?:prueba|gratis|gratuita)\s*(?:de\s*)?(\d+)\s*d[íi]as?/gi

    let menciones = 0
    for (const rel of PAGINAS_LEGALES) {
      const src = leer(rel)
      for (const m of src.matchAll(patron)) {
        const publicados = Number(m[1] ?? m[2])
        expect(
          publicados,
          `${rel} anuncia ${publicados} días de prueba y la aplicación usa ${TRIAL_DAYS}`,
        ).toBe(TRIAL_DAYS)
        menciones++
      }
    }

    // Si el texto cambia de redacción y deja de casar, el test debe avisar en vez
    // de pasar en vacío: una guardia que no encuentra nada no protege de nada.
    expect(menciones, 'no se encontró ninguna mención a los días de prueba: ¿cambió la redacción?').toBeGreaterThan(0)
  })
})

describe('páginas legales — los precios son los de la fuente única', () => {
  it('todo importe publicado existe en lib/vertical-plans.ts', () => {
    const vigentes = new Set<number>(Object.values(VERTICAL_PLAN_PRICES))
    const patrones = [/(\d+)\s*€/g, /€\s*(\d+)/g]

    const ajenos: string[] = []
    for (const rel of SUPERFICIES_CON_PRECIOS) {
      const src = leer(rel)
      for (const patron of patrones) {
        for (const m of src.matchAll(patron)) {
          if (!vigentes.has(Number(m[1]))) {
            ajenos.push(`${rel}: ${m[1]} €`)
          }
        }
      }
    }

    expect(
      ajenos,
      `estas superficies publican importes que no son ninguna vertical vigente:\n${ajenos.join('\n')}`,
    ).toEqual([])
  })

  it('los términos construyen la lista de precios desde la fuente única', () => {
    const src = leer('app/terms/page.tsx')

    expect(src, 'los términos no leen la fuente única de precios').toContain('VERTICAL_PLANS')
    // Un precio suelto dentro del texto de la política es la divergencia clásica.
    expect(src, 'los términos escriben un precio a mano').not.toMatch(/>\s*\d+\s*€\s*\/\s*mes/)
  })

  it('la página de precios no vuelve a escribir importes ni días a mano', () => {
    const src = leer('app/precios/page.tsx')

    expect(src, 'los metadatos de /precios no leen la fuente única').toContain('VERTICAL_PLANS')
    expect(src, 'los metadatos de /precios no leen los días de prueba reales').toContain('TRIAL_DAYS')
    expect(src, 'los metadatos de /precios escriben un importe a mano').not.toMatch(/€\s*\d+/)
  })
})

describe('páginas legales — coherencia interna de los plazos', () => {
  it('el plazo de desistimiento es el mismo en los términos y en reembolsos', () => {
    // Este plazo es derecho aplicable, no un parámetro del producto, así que no
    // se ata a TRIAL_DAYS. Lo que sí es un fallo real es que las dos páginas que
    // lo publican digan números distintos.
    const declarados: number[] = []

    for (const rel of ['app/terms/page.tsx', 'app/reembolsos/page.tsx']) {
      const src = leer(rel)
      const encontrados = [...src.matchAll(/(\d+)\s*d[íi]as\s*naturales/gi)].map((m) => Number(m[1]))
      expect(encontrados.length, `${rel} no declara el plazo de desistimiento`).toBeGreaterThan(0)
      declarados.push(...encontrados)
    }

    expect(
      Array.from(new Set(declarados)),
      `las páginas legales publican plazos de desistimiento distintos: ${declarados.join(', ')}`,
    ).toHaveLength(1)
  })
})
