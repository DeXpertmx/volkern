import { describe, it, expect } from 'vitest';
import { computeVatAmount, computePercentageAmount } from '@/lib/finance/vat';

describe('computeVatAmount', () => {
  it('calcula la cuota: base × tipo / 100', () => {
    expect(computeVatAmount('100', '21')).toBe('21.00');
    expect(computeVatAmount('1600', '21')).toBe('336.00');
    expect(computeVatAmount('1000', '10')).toBe('100.00');
    expect(computeVatAmount('2500', '4')).toBe('100.00');
  });

  it('acepta decimales y comas en el tipo', () => {
    expect(computeVatAmount('121', '21,00')).toBe('25.41');
    expect(computeVatAmount('100', '10.5')).toBe('10.50');
  });

  it('devuelve "" si falta base o tipo', () => {
    expect(computeVatAmount('', '21')).toBe('');
    expect(computeVatAmount('100', '')).toBe('');
    expect(computeVatAmount('', '')).toBe('');
  });

  it('devuelve "" si base o tipo no son válidos (≤ 0 o no numéricos)', () => {
    expect(computeVatAmount('0', '21')).toBe('');
    expect(computeVatAmount('100', '0')).toBe('');
    expect(computeVatAmount('abc', '21')).toBe('');
    expect(computeVatAmount('100', 'xyz')).toBe('');
  });
});

describe('computePercentageAmount (IRPF / retenciones)', () => {
  it('calcula la retención: base × tipo / 100', () => {
    expect(computePercentageAmount('1600', '15')).toBe('240.00');
    expect(computePercentageAmount('1000', '7')).toBe('70.00');
    expect(computePercentageAmount('121', '15')).toBe('18.15');
  });

  it('es idéntico a computeVatAmount', () => {
    expect(computePercentageAmount('1600', '21')).toBe(computeVatAmount('1600', '21'));
  });

  it('devuelve "" si falta base o tipo', () => {
    expect(computePercentageAmount('', '15')).toBe('');
    expect(computePercentageAmount('1600', '')).toBe('');
  });
});
