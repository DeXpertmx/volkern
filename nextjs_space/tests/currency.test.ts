import { describe, it, expect } from 'vitest';

/**
 * Tests puros del módulo currency:
 *   · toUSD / fromUSD pivot
 *   · fxConvert cross-rates (sin moneda objetivo directa)
 *   · sumaEnMonedaTarget con mezcla
 *   · resumenMoneda breakdown
 *   · Monedas desconocidas → identidad defensiva (no explota)
 */

import {
  FX_TO_USD,
  toUSD,
  fromUSD,
  fxConvert,
  sumaEnMonedaTarget,
  resumenMoneda,
  CURRENCY_CONSTANTS,
} from '@/lib/insurance/currency';

describe('currency — pivot toUSD/fromUSD', () => {
  it('USD ↔ USD identidad', () => {
    expect(toUSD(100, 'USD')).toBe(100);
    expect(fromUSD(100, 'USD')).toBe(100);
  });

  it('EUR → USD con rate correcto', () => {
    expect(toUSD(100, 'EUR')).toBeCloseTo(108, 2); // 100 × 1.08
  });

  it('USD → EUR con rate correcto', () => {
    expect(fromUSD(108, 'EUR')).toBeCloseTo(100, 2); // 108 / 1.08
  });

  it('MXN → USD con rate correcto', () => {
    expect(toUSD(1000, 'MXN')).toBeCloseTo(58, 2); // 1000 × 0.058
  });
});

describe('currency — fxConvert cross-rate', () => {
  it('EUR → MXN via USD pivot', () => {
    // 100 EUR = 108 USD = 108 / 0.058 ≈ 1862.07 MXN
    expect(fxConvert(100, 'EUR', 'MXN')).toBeCloseTo(1862.07, 1);
  });

  it('MXN → EUR via USD pivot', () => {
    // 1862.07 MXN = 108 USD → 100 EUR
    expect(fxConvert(1862.07, 'MXN', 'EUR')).toBeCloseTo(100, 1);
  });

  it('mismo origen-destino = identidad', () => {
    expect(fxConvert(500, 'USD', 'USD')).toBe(500);
    expect(fxConvert(0, 'EUR', 'JPY')).toBe(0);
  });

  it('moneda origen desconocida → identidad defensiva', () => {
    expect(fxConvert(100, 'ZZZ', 'USD')).toBe(100);
    expect(fxConvert(100, 'USD', 'ZZZ')).toBe(100);
  });
});

describe('currency — sumaEnMonedaTarget con mezcla', () => {
  it('mezcla EUR + MXN + USD → MXN total', () => {
    const rows = [
      { monto: 1000, moneda: 'EUR' },     // 1000 × 1.08 = 1080 USD → /0.058 ≈ 18620.69 MXN
      { monto: 20000, moneda: 'MXN' },    // identidad = 20000 MXN
      { monto: 500, moneda: 'USD' },      // 500 / 0.058 ≈ 8620.69 MXN
    ];
    const total = sumaEnMonedaTarget(rows, 'MXN');
    expect(total).toBeCloseTo(18620.69 + 20000 + 8620.69, 1);
  });

  it('ignora montos 0/null', () => {
    const rows = [
      { monto: 0, moneda: 'USD' },
      { monto: 100, moneda: 'USD' },
      { monto: null, moneda: 'USD' },
    ];
    expect(sumaEnMonedaTarget(rows, 'USD')).toBe(100);
  });

  it('todas en misma moneda → suma directa', () => {
    const rows = [
      { monto: 1000, moneda: 'EUR' },
      { monto: 2500, moneda: 'EUR' },
      { monto: 750, moneda: 'EUR' },
    ];
    expect(sumaEnMonedaTarget(rows, 'EUR')).toBe(4250);
  });
});

describe('currency — resumenMoneda breakdown', () => {
  it('desglosa correctamente + calcula mezcla=true', () => {
    const rows = [
      { monto: 1000, moneda: 'EUR' },
      { monto: 500, moneda: 'USD' },
      { monto: 2000, moneda: 'MXN' },
      { monto: 300, moneda: 'EUR' },
    ];
    const resumen = resumenMoneda(rows, 'MXN');
    expect(resumen.mezcla).toBe(true);
    expect(resumen.porMoneda.EUR.count).toBe(2);
    expect(resumen.porMoneda.EUR.totalOriginal).toBe(1300);
    expect(resumen.porMoneda.USD.count).toBe(1);
    expect(resumen.porMoneda.MXN.count).toBe(1);
    // totalEnTarget = 1300 EUR×1.08/0.058 + 500 USD/0.058 + 2000 MXN
    const expected = 1300 * 1.08 / 0.058 + 500 / 0.058 + 2000;
    expect(resumen.totalEnTarget).toBeCloseTo(expected, 1);
    // Sanity: esperado debe ser ~ 34200.69 (no el cálculo errado de 1862.07)
    expect(resumen.totalEnTarget).toBeGreaterThan(30000);
  });

  it('una sola moneda → mezcla=false', () => {
    const rows = [
      { monto: 1000, moneda: 'USD' },
      { monto: 2000, moneda: 'USD' },
    ];
    const resumen = resumenMoneda(rows, 'USD');
    expect(resumen.mezcla).toBe(false);
    expect(resumen.porMoneda.USD.count).toBe(2);
    expect(resumen.totalEnTarget).toBe(3000);
  });

  it('array vacío → mezcla=false, totales 0', () => {
    const resumen = resumenMoneda([], 'EUR');
    expect(resumen.mezcla).toBe(false);
    expect(resumen.totalEnTarget).toBe(0);
  });
});

describe('currency — constantes y defaults', () => {
  it('FX_TO_USD contiene todas las monedas esperadas', () => {
    for (const m of ['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CNY', 'CAD', 'BRL']) {
      expect(FX_TO_USD[m as keyof typeof FX_TO_USD]).toBeGreaterThan(0);
    }
  });

  it('CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY es MXN', () => {
    expect(CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY).toBe('MXN');
  });

  it('round-trip toUSD → fromUSD vuelve al monto original (casi)', () => {
    for (const m of ['USD', 'EUR', 'GBP', 'JPY'] as const) {
      const original = 1000;
      const usd = toUSD(original, m);
      const back = fromUSD(usd, m);
      // Permite pequeñas diferencias por float-pointing.
      expect(back).toBeCloseTo(original, 6);
    }
  });
});
