import { describe, it, expect } from 'vitest';
import { computeVatAmount, computePercentageAmount, computeInvoiceTotalMismatch, fillEmptyTranches, fillLastTranche } from '@/lib/finance/vat';

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

describe('computeInvoiceTotalMismatch (conciliación de totales)', () => {
  it('devuelve null cuando cuadra (base + IVA − IRPF = total)', () => {
    expect(computeInvoiceTotalMismatch('1600', '336', '240', '1696')).toBeNull();
    expect(computeInvoiceTotalMismatch('100', '21', '15', '106')).toBeNull();
  });

  it('tolera redondeos de hasta ±0.02', () => {
    expect(computeInvoiceTotalMismatch('1600', '336', '240', '1696.01')).toBeNull();
  });

  it('devuelve el desajuste cuando no cuadra', () => {
    const m = computeInvoiceTotalMismatch('1600', '336', '240', '1700');
    expect(m).not.toBeNull();
    expect(m!.expected).toBeCloseTo(1696, 5);
    expect(m!.difference).toBeCloseTo(-4, 5);
  });

  it('devuelve null si faltan base o total', () => {
    expect(computeInvoiceTotalMismatch('', '336', '240', '1696')).toBeNull();
    expect(computeInvoiceTotalMismatch('1600', '336', '240', '')).toBeNull();
    expect(computeInvoiceTotalMismatch('', '', '', '')).toBeNull();
  });

  it('trata cuota de IVA, recargo o IRPF ausentes como 0', () => {
    expect(computeInvoiceTotalMismatch('100', '', '', '100')).toBeNull();
    expect(computeInvoiceTotalMismatch('100', '21', '', '121')).toBeNull();
    expect(computeInvoiceTotalMismatch('100', '21', '', '121', '')).toBeNull();
  });

  it('suma el recargo de equivalencia al total esperado', () => {
    expect(computeInvoiceTotalMismatch('600', '87', '', '718.20', '31.20')).toBeNull();
    const mismatch = computeInvoiceTotalMismatch('600', '87', '', '687', '31.20');
    expect(mismatch).not.toBeNull();
    expect(mismatch!.expected).toBeCloseTo(718.2, 5);
    expect(mismatch!.difference).toBeCloseTo(31.2, 5);
  });
});

describe('fillEmptyTranches (reparto automático del total)', () => {
  const rows = (bases: (string | number)[]) =>
    bases.map(b => ({ base: String(b), rate: '' }));

  it('reparte los tramos vacíos a partes iguales para cuadrar el total', () => {
    // Ejemplo del usuario: primero 300 @ 21%, los otros dos se calculan solos
    const result = fillEmptyTranches(rows(['300', '', '']), 2000);
    expect(result).toEqual(['300', '850.00', '850.00']);
  });

  it('si se llena el segundo, el tercero se calcula como el resto', () => {
    const result = fillEmptyTranches(rows(['300', '900', '']), 2000);
    expect(result).toEqual(['300', '900', '800.00']);
  });

  it('el último tramo absorbe el redondeo y la suma cuadra exacta', () => {
    const result = fillEmptyTranches(rows(['300', '', '', '']), 2000);
    const sum = result!.reduce((acc, b) => acc + parseFloat(b), 0);
    expect(result).toEqual(['300', '566.67', '566.67', '566.66']);
    expect(sum).toBeCloseTo(2000, 2);
  });

  it('no toca los tramos ya rellenos', () => {
    const result = fillEmptyTranches(rows(['300', '', '850']), 2000);
    expect(result).toEqual(['300', '850.00', '850']);
  });

  it('respetar fillableIndices excluye tramos (p. ej. vaciados a propósito)', () => {
    const result = fillEmptyTranches(rows(['300', '', '850']), 2000, [1]);
    expect(result).toEqual(['300', '850.00', '850']);
  });

  it('devuelve null con objetivo inválido o sin nada que repartir', () => {
    expect(fillEmptyTranches(rows(['300', '', '']), '')).toBeNull();
    expect(fillEmptyTranches(rows(['300', '', '']), 0)).toBeNull();
    expect(fillEmptyTranches(rows(['300', '900', '800']), 2000)).toBeNull();
    expect(fillEmptyTranches(rows(['300', '', '']), 100)).toBeNull(); // resto <= 0
    expect(fillEmptyTranches([], 2000)).toBeNull();
  });

  it('acepta el objetivo como string', () => {
    const result = fillEmptyTranches(rows(['300', '', '']), '2000');
    expect(result).toEqual(['300', '850.00', '850.00']);
  });
});

describe('fillLastTranche (modo resto en el último)', () => {
  const rows = (bases: (string | number)[]) =>
    bases.map(b => ({ base: String(b), rate: '' }));

  it('deja los intermedios vacíos y solo rellena el último con el resto', () => {
    // Ejemplo del usuario: 3 tramos, primero 300 @ 21%, los demás se quedan
    // vacíos hasta llenarlos; el último absorbe lo que falte
    const result = fillLastTranche(rows(['300', '', '']), 2000);
    expect(result).toEqual(['300', '', '1700.00']);
  });

  it('si se llena un intermedio, el último se recalcula como el resto', () => {
    const result = fillLastTranche(rows(['300', '900', '']), 2000);
    expect(result).toEqual(['300', '900', '800.00']);
  });

  it('el último absorbe el redondeo y la suma cuadra exacta', () => {
    const result = fillLastTranche(rows(['300', '', '', '']), 2000);
    const sum = result!.reduce((acc, b) => acc + parseFloat(b || '0'), 0);
    expect(result).toEqual(['300', '', '', '1700.00']);
    expect(sum).toBeCloseTo(2000, 2);
  });

  it('no toca los tramos ya rellenos', () => {
    // Solo el índice 2 está vacío: es el último rellenable y absorbe el resto
    const result = fillLastTranche(rows(['300', '900', '']), 2000);
    expect(result).toEqual(['300', '900', '800.00']);
    const result2 = fillLastTranche(rows(['300', '', '850']), 2000);
    expect(result2).toEqual(['300', '850.00', '850']);
  });

  it('con un solo tramo vacío se comporta igual que el reparto simple', () => {
    const result = fillLastTranche(rows(['300', '900', '800']), 2000);
    expect(result).toBeNull(); // nada que repartir
    const result2 = fillLastTranche(rows(['300', '900', '']), 2000);
    expect(result2).toEqual(['300', '900', '800.00']);
  });

  it('respetar fillableIndices excluye tramos (p. ej. vaciados a propósito)', () => {
    // fillable solo [1]: el último rellenable es el índice 1
    const result = fillLastTranche(rows(['300', '', '850']), 2000, [1]);
    expect(result).toEqual(['300', '850.00', '850']);
  });

  it('devuelve null con objetivo inválido o sin nada que repartir', () => {
    expect(fillLastTranche(rows(['300', '', '']), '')).toBeNull();
    expect(fillLastTranche(rows(['300', '', '']), 0)).toBeNull();
    expect(fillLastTranche(rows(['300', '900', '800']), 2000)).toBeNull();
    expect(fillLastTranche(rows(['300', '', '']), 100)).toBeNull(); // resto <= 0
    expect(fillLastTranche([], 2000)).toBeNull();
  });
});
