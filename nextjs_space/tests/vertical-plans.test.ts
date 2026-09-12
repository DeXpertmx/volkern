import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import {
  VERTICAL_PLANS,
  VERTICAL_PLAN_IDS,
  VERTICAL_PLAN_PRICES,
  getVerticalPlan,
  getVerticalPlanPrice,
} from '@/lib/vertical-plans'
import { PLAN_LIMITS, PLAN_MODULES, PLAN_PRICES } from '@/lib/plans'

/**
 * GUARDIA DE PRECIOS DE VERTICAL
 *
 * Por qué existe: el precio de una vertical llegó a estar escrito a mano en
 * cuatro sitios (la portada, /precios, los términos legales y la tabla
 * `PLAN_PRICES`). Producción acabó anunciando 49 € en la portada mientras el
 * cobro dependía de una tabla legacy cuyos Stripe Price IDs no existían en el
 * VPS, de modo que pulsar un plan devolvía un 500.
 *
 * Estas pruebas fijan la regla: el precio vive en `lib/vertical-plans.ts` y todo
 * lo demás lo lee de ahí. Si alguien vuelve a escribir un precio en una
 * superficie pública, este archivo lo delata.
 */

const APP_ROOT = path.resolve(__dirname, '..')

/** Superficies que anuncian precios y NO deben contener literales numéricos. */
const SUPERFICIES_ANUNCIADAS = [
  'components/public/PricingPage.tsx',
  'components/public/ProductosLanding.tsx',
]

describe('verticales comerciales — fuente única', () => {
  it('hay 8 verticales y sus identificadores son únicos', () => {
    expect(VERTICAL_PLANS).toHaveLength(8)
    expect(new Set(VERTICAL_PLAN_IDS).size).toBe(8)
  })

  it('cada vertical tiene precio publicado mayor que cero', () => {
    for (const v of VERTICAL_PLANS) {
      expect(v.price).toBeGreaterThan(0)
    }
  })

  it('cada vertical tiene slug público, nombre y módulos', () => {
    for (const v of VERTICAL_PLANS) {
      expect(v.slug.length).toBeGreaterThan(0)
      expect(v.name.length).toBeGreaterThan(0)
      expect(v.modules.length).toBeGreaterThan(0)
    }
  })

  it('getVerticalPlanPrice devuelve el precio publicado y null si no es una vertical', () => {
    for (const v of VERTICAL_PLANS) {
      expect(getVerticalPlanPrice(v.id)).toBe(v.price)
    }
    for (const v of VERTICAL_PLANS) {
      expect(getVerticalPlan(v.id)?.id).toBe(v.id)
    }
    expect(getVerticalPlanPrice('esencial')).toBeNull()
    expect(getVerticalPlanPrice('inventado')).toBeNull()
    expect(getVerticalPlan('esencial')).toBeNull()
  })
})

describe('verticales comerciales — lo anunciado y lo cobrado no divergen', () => {
  it('el precio de cobro (PLAN_PRICES) es el precio anunciado', () => {
    for (const v of VERTICAL_PLANS) {
      const cobro = PLAN_PRICES[v.id as keyof typeof PLAN_PRICES]
      expect(cobro).toBeDefined()
      expect(cobro.monthly).toBe(v.price)
      expect(cobro.currency).toBe('eur')
    }
  })

  it('cada vertical resuelve límites y módulos, sin caer al fallback silencioso', () => {
    // Sin estas entradas, `getPlanConfig` devolvería precio 0 y los límites de
    // Esencial en silencio: es el mismo fallo que tenían `growth` y `enterprise`.
    for (const id of VERTICAL_PLAN_IDS) {
      expect(PLAN_LIMITS[id as keyof typeof PLAN_LIMITS]).toBeDefined()
      expect(PLAN_MODULES[id]).toBeDefined()
      expect(PLAN_MODULES[id].length).toBeGreaterThan(0)
    }
  })

  it('el descuento anual de una vertical es del 20 %, la convención ya existente', () => {
    for (const v of VERTICAL_PLANS) {
      const cobro = PLAN_PRICES[v.id as keyof typeof PLAN_PRICES]
      expect(cobro.yearly).toBe(Math.round(v.price * 12 * 0.8))
    }
  })

  it('la tabla de precios por vertical coincide con el mapa de precios', () => {
    for (const v of VERTICAL_PLANS) {
      expect(VERTICAL_PLAN_PRICES[v.id]).toBe(v.price)
    }
    expect(Object.keys(VERTICAL_PLAN_PRICES)).toHaveLength(8)
  })
})

describe('verticales comerciales — ninguna superficie vuelve a escribir un precio', () => {
  it('las páginas que anuncian precios los leen de la fuente única', () => {
    for (const rel of SUPERFICIES_ANUNCIADAS) {
      const abs = path.join(APP_ROOT, rel)
      expect(fs.existsSync(abs), `falta ${rel}`).toBe(true)
      const src = fs.readFileSync(abs, 'utf8')

      // Un literal de precio (price: '49') es exactamente lo que provocó la
      // divergencia: el precio debe venir de getVerticalPlanPrice().
      expect(src, `${rel} escribe un precio a mano`).not.toMatch(/price:\s*'\d+'/)
      expect(src, `${rel} no lee el precio de la fuente única`).toContain('getVerticalPlanPrice')
    }
  })

  it('cada tarjeta anunciada usa un id que existe en la fuente única', () => {
    // Sin esto, añadir una tarjeta con un id desconocido haría que el precio se
    // renderizara como 0 en silencio, que es justo el fallo que se está evitando.
    for (const rel of SUPERFICIES_ANUNCIADAS) {
      const src = fs.readFileSync(path.join(APP_ROOT, rel), 'utf8')
      const ids = [...src.matchAll(/^\s*id:\s*'([a-z_]+)'/gm)].map((m) => m[1])

      expect(ids.length, `${rel} no declara tarjetas`).toBeGreaterThan(0)
      for (const id of ids) {
        expect(getVerticalPlanPrice(id), `${rel}: el id '${id}' no existe en la fuente única`).not.toBeNull()
      }
    }
  })

  it('los términos legales no publican una lista de precios escrita a mano', () => {
    const abs = path.join(APP_ROOT, 'app/terms/page.tsx')
    const src = fs.readFileSync(abs, 'utf8')

    expect(src).toContain('VERTICAL_PLANS')
    // La lista se renderiza desde la fuente única, así que no debe quedar
    // ningún precio suelto en el texto de la política.
    expect(src, 'los términos escriben un precio a mano').not.toMatch(/>\s*\d+\s*€\s*\/\s*mes/)
  })
})
