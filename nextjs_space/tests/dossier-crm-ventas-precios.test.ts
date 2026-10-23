import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import {
  CRM_TIERS,
  CRM_VOLUME_BANDS,
  CRM_MAX_SELF_SERVE_SEATS,
  CRM_TRIAL_DAYS,
  calcularPrecioCrm,
  type CrmInterval,
} from '@/lib/crm-pricing'

/*
 * El dossier comercial se genera con `node` a secas, así que lee la escalera de
 * `lib/crm-pricing.ts` con un extractor propio (scripts/dossier-crm-ventas).
 * Este test es la unión entre ambos: si la escalera cambia y el extractor no la
 * sigue, el dossier deja de coincidir con lo que se cobra y esta suite falla.
 */
const require = createRequire(import.meta.url)
const escalera = require('../scripts/dossier-crm-ventas/escalera.cjs')
const precios = require('../scripts/dossier-crm-ventas/precios.cjs')

const ASIENTOS = [1, 2, 5, 9, 10, 24, 25, 49, 50, 99, 100, 249, 250, 499, 500, 999, 1000]

describe('dossier comercial de CRM: precios', () => {
  it('lee los niveles, los tramos y la prueba desde lib/crm-pricing.ts', () => {
    expect(
      escalera.escalera.tiers.map((t: any) => [t.id, t.name, t.monthly, t.annualMonthly, t.audience]),
    ).toEqual(CRM_TIERS.map((t) => [t.id, t.name, t.monthly, t.annualMonthly, t.audience]))

    expect(escalera.escalera.tiers.map((t: any) => t.limits)).toEqual(
      CRM_TIERS.map((t) => t.limits),
    )

    expect(escalera.escalera.bands).toEqual(
      CRM_VOLUME_BANDS.map(({ from, to, discount, label }) => ({ from, to, discount, label })),
    )

    expect(escalera.TRIAL).toBe(CRM_TRIAL_DAYS)
    expect(escalera.MAX_ASIENTOS).toBe(CRM_MAX_SELF_SERVE_SEATS)
    expect(escalera.ENTRADA).toBe(Math.min(...CRM_TIERS.map((t) => t.annualMonthly)))
  })

  it('calcula el mismo precio medio que el cobro en todo el rango de asientos', () => {
    for (const tier of CRM_TIERS) {
      for (const interval of ['monthly', 'yearly'] as CrmInterval[]) {
        for (const seats of ASIENTOS) {
          const esperado = calcularPrecioCrm({ tier: tier.id, interval, seats }).perUser
          expect(
            escalera.precioMedioPorUsuario(tier.id, interval, seats),
            `${tier.id} · ${interval} · ${seats} asientos`,
          ).toBe(esperado)
        }
      }
    }
  })

  it('la página de precio anuncia los tres niveles y no vende el Esencial como si lo incluyera todo', () => {
    const html: string = precios.paginaPrecio((n: number) => `<!-- pie ${n} -->`)

    for (const tier of CRM_TIERS) {
      expect(html).toContain(tier.name)
      expect(html).toContain(`${tier.annualMonthly} €`)
    }
    expect(escalera.miles(1000)).toBe('1.000')
    expect(html).toContain(`Hasta ${escalera.miles(CRM_MAX_SELF_SERVE_SEATS)} asientos`)
    expect(html).toContain(`${CRM_TRIAL_DAYS} días`)

    // La fila de IA solo puede abrirla el nivel que la tiene en `limits`.
    const filaIa = html.split('<tr>').find((f) => f.includes('IA: siguiente acción y riesgo'))
    expect(filaIa).toBeTruthy()
    const nivelesConIa = CRM_TIERS.filter((t) => t.limits.ai).length
    expect(filaIa!.match(/<span class="si">✓<\/span>/g)).toHaveLength(nivelesConIa)
    expect(filaIa!.match(/<span class="no">—<\/span>/g)).toHaveLength(CRM_TIERS.length - nivelesConIa)
  })
})
