import { describe, it, expect } from 'vitest'
import {
  CRM_MAX_SELF_SERVE_SEATS,
  CRM_TIERS,
  CRM_VOLUME_BANDS,
  calcularPrecioCrm,
  getCrmTier,
  getCrmVolumeBand,
} from '@/lib/crm-pricing'
import { entitlementsFor } from '@/lib/crm-entitlements'

describe('escalera de CRM', () => {
  it('publica tres niveles con los precios acordados', () => {
    expect(CRM_TIERS.map((t) => [t.id, t.annualMonthly, t.monthly])).toEqual([
      ['esencial', 12, 15],
      ['profesional', 24, 29],
      ['avanzado', 39, 49],
    ])
  })

  it('cobra por asiento en mensual y en anual', () => {
    const mensual = calcularPrecioCrm({ tier: 'esencial', interval: 'monthly', seats: 3 })
    expect(mensual.perUser).toBe(15)
    expect(mensual.billedAmount).toBe(45)

    const anual = calcularPrecioCrm({ tier: 'esencial', interval: 'yearly', seats: 3 })
    expect(anual.perUser).toBe(12)
    expect(anual.billedAmount).toBe(12 * 12 * 3)
  })

  it('publica tramos hasta 1.000 usuarios, no un corte en 99', () => {
    expect(CRM_VOLUME_BANDS.map((b) => [b.from, b.to, b.discount])).toEqual([
      [1, 9, 0],
      [10, 24, 0.1],
      [25, 49, 0.15],
      [50, 99, 0.2],
      [100, 249, 0.25],
      [250, 499, 0.3],
      [500, 999, 0.35],
      [1000, null, 0.4],
    ])
    expect(getCrmVolumeBand(9).discount).toBe(0)
    expect(getCrmVolumeBand(10).discount).toBe(0.1)
    expect(getCrmVolumeBand(99).discount).toBe(0.2)
    expect(getCrmVolumeBand(100).discount).toBe(0.25)
    expect(getCrmVolumeBand(1000).discount).toBe(0.4)
  })

  it('aplica el descuento por tramos, no a todos los asientos', () => {
    // 9 asientos a 29 € + 1 asiento con el 10 % → 287,10 €, no 261 €.
    const diez = calcularPrecioCrm({ tier: 'profesional', interval: 'monthly', seats: 10 })
    expect(diez.brackets.map((b) => [b.from, b.to, b.perUserMonth])).toEqual([
      [1, 9, 29],
      [10, 10, 26.1],
    ])
    expect(diez.billedAmount).toBe(287.1)
    expect(diez.perUser).toBe(28.71)
    expect(diez.discount).toBe(0.01)

    const total = diez.brackets.reduce((sum, b) => sum + b.amount, 0)
    expect(Math.round(total * 100)).toBe(Math.round(diez.billedAmount * 100))
    expect(diez.brackets.reduce((sum, b) => sum + b.seats, 0)).toBe(10)
  })

  it('da precios reales a 100 y a 1.000 usuarios', () => {
    const cien = calcularPrecioCrm({ tier: 'avanzado', interval: 'yearly', seats: 100 })
    expect(cien.custom).toBe(false)
    expect(cien.perUser).toBe(32.96)
    expect(cien.billedAmount).toBe(39546)

    const mil = calcularPrecioCrm({ tier: 'esencial', interval: 'yearly', seats: 1000 })
    expect(mil.custom).toBe(false)
    expect(mil.perUser).toBe(8.36)
    expect(mil.billedAmount).toBe(100346.4)
    // Añadir usuarios nunca abarata la factura: es la diferencia con el
    // descuento "de todo o nada", que en el salto a 100 bajaba el total.
    expect(mil.billedAmount).toBeGreaterThan(cien.billedAmount)
  })

  it('añadir un usuario nunca baja la factura ni sube el precio medio', () => {
    for (const tier of CRM_TIERS) {
      for (const interval of ['monthly', 'yearly'] as const) {
        let anterior = 0
        let medioAnterior = Number.POSITIVE_INFINITY
        for (let seats = 1; seats <= CRM_MAX_SELF_SERVE_SEATS; seats += 1) {
          const precio = calcularPrecioCrm({ tier: tier.id, interval, seats })
          expect(precio.billedAmount).toBeGreaterThanOrEqual(anterior)
          expect(precio.perUser).toBeLessThanOrEqual(medioAnterior)
          anterior = precio.billedAmount
          medioAnterior = precio.perUser
        }
      }
    }
  })

  it('deja el precio a medida por encima de 1.000 asientos', () => {
    expect(CRM_MAX_SELF_SERVE_SEATS).toBe(1000)
    const milUno = calcularPrecioCrm({ tier: 'avanzado', interval: 'yearly', seats: 1001 })
    expect(milUno.custom).toBe(true)
    expect(milUno.billedAmount).toBe(0)
  })

  it('rechaza niveles y asientos inválidos', () => {
    expect(() => calcularPrecioCrm({ tier: 'oro', interval: 'monthly', seats: 2 })).toThrow()
    expect(() => calcularPrecioCrm({ tier: 'esencial', interval: 'monthly', seats: 0 })).toThrow()
    expect(() => calcularPrecioCrm({ tier: 'esencial', interval: 'monthly', seats: 1.5 })).not.toThrow()
  })

  it('cada nivel anuncia solo lo que sus límites permiten', () => {
    for (const tier of CRM_TIERS) {
      const features = tier.features.join(' ').toLowerCase()
      if (features.includes('ia:')) expect(tier.limits.ai).toBe(true)
      if (features.includes('api y')) expect(tier.limits.api).toBe(true)
      if (features.includes('contratos')) expect(tier.limits.contracts).toBe(true)
      if (features.includes('previsión')) expect(tier.limits.forecast).toBe(true)
    }
  })
})

describe('puertas por nivel', () => {
  it('un tenant anterior de crm_ventas conserva el nivel completo', () => {
    const ent = entitlementsFor('crm_ventas', null)
    expect(ent.legacy).toBe(true)
    expect(ent.limits.ai).toBe(true)
    expect(ent.limits.contracts).toBe(true)
  })

  it('un tenant con nivel explícito queda limitado a ese nivel', () => {
    const esencial = entitlementsFor('crm_ventas', { crmTier: 'esencial', crmSeats: 4 })
    expect(esencial.legacy).toBe(false)
    expect(esencial.tier).toBe('esencial')
    expect(esencial.seats).toBe(4)
    expect(esencial.limits.maxPipelines).toBe(1)
    expect(esencial.limits.ai).toBe(false)
    expect(esencial.limits.contracts).toBe(false)

    const avanzado = entitlementsFor('crm_ventas', { crmTier: 'avanzado', crmSeats: 10 })
    expect(avanzado.limits.ai).toBe(true)
    expect(avanzado.limits.api).toBe(true)
  })

  it('otras verticales no se recortan', () => {
    const ent = entitlementsFor('inmobiliaria', null)
    expect(ent.legacy).toBe(true)
    expect(ent.limits.ai).toBe(true)
  })

  it('el nivel avanzado es el único que abre IA, API y academia', () => {
    expect(getCrmTier('avanzado')?.limits).toMatchObject({ ai: true, api: true, academy: true })
    expect(getCrmTier('profesional')?.limits).toMatchObject({ ai: false, api: false, academy: false })
    expect(getCrmTier('esencial')?.limits).toMatchObject({ ai: false, api: false, academy: false })
  })
})
