import { describe, expect, it } from 'vitest';
import {
  agruparMrrPorMoneda,
  calcularArpa,
  calcularCac,
  calcularRatioLtvCac,
  calcularTasaChurn,
  calcularTasaConversion,
  elegirMonedaPrincipal,
} from '@/lib/saas-kpis';

describe('agruparMrrPorMoneda', () => {
  it('no suma divisas distintas en una sola cifra', () => {
    const grupos = agruparMrrPorMoneda([
      { mrr: 100, moneda: 'EUR' },
      { mrr: 5000, moneda: 'MXN' },
      { mrr: 50, moneda: 'EUR' },
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos.find((g) => g.moneda === 'EUR')?.mrr).toBe(150);
    expect(grupos.find((g) => g.moneda === 'MXN')?.mrr).toBe(5000);
  });

  it('cuenta solo como cuentas de pago las que aportan MRR', () => {
    const grupos = agruparMrrPorMoneda([
      { mrr: 0, moneda: 'EUR' },
      { mrr: 99, moneda: 'EUR' },
      { mrr: null, moneda: null },
    ]);

    const eur = grupos.find((g) => g.moneda === 'EUR');
    expect(eur?.cuentas).toBe(3);
    expect(eur?.cuentasPago).toBe(1);
  });
});

describe('elegirMonedaPrincipal', () => {
  it('elige la divisa con más MRR', () => {
    const principal = elegirMonedaPrincipal(
      agruparMrrPorMoneda([
        { mrr: 100, moneda: 'EUR' },
        { mrr: 5000, moneda: 'MXN' },
      ]),
    );
    expect(principal?.moneda).toBe('MXN');
  });

  it('sin cuentas no hay divisa principal', () => {
    expect(elegirMonedaPrincipal([])).toBeNull();
  });
});

describe('calcularArpa', () => {
  it('MRR 1000 entre 4 cuentas de pago → 250', () => {
    expect(calcularArpa(1000, 4)).toBe(250);
  });

  it('sin cuentas de pago → 0 (no divide entre cero)', () => {
    expect(calcularArpa(1000, 0)).toBe(0);
  });
});

describe('calcularCac', () => {
  it('2000 de inversión y 10 clientes nuevos → 200', () => {
    expect(calcularCac(2000, 10)).toBe(200);
  });

  it('sin inversión declarada devuelve null, no 0', () => {
    expect(calcularCac(null, 10)).toBeNull();
    expect(calcularCac(0, 10)).toBeNull();
  });

  it('sin clientes nuevos devuelve null', () => {
    expect(calcularCac(2000, 0)).toBeNull();
  });
});

describe('calcularRatioLtvCac', () => {
  it('LTV 3000 y CAC 500 → 6', () => {
    expect(calcularRatioLtvCac(3000, 500)).toBe(6);
  });

  it('sin CAC no hay ratio', () => {
    expect(calcularRatioLtvCac(3000, null)).toBeNull();
    expect(calcularRatioLtvCac(3000, 0)).toBeNull();
  });
});

describe('calcularTasaChurn', () => {
  it('2 bajas sobre 40 cuentas → 5 %', () => {
    expect(calcularTasaChurn(40, 2)).toBe(5);
  });

  it('sin cuentas base → 0 (no divide entre cero)', () => {
    expect(calcularTasaChurn(0, 3)).toBe(0);
  });
});

describe('calcularTasaConversion', () => {
  it('3 de 12 oportunidades → 25 %', () => {
    expect(calcularTasaConversion(3, 12)).toBe(25);
  });

  it('sin oportunidades → 0', () => {
    expect(calcularTasaConversion(0, 0)).toBe(0);
  });
});
