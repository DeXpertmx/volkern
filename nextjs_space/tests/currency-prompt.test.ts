/**
 * Tests vitest del helper `lib/insurance/currency-prompt`.
 *
 * Cubre:
 *   • Lista canónica de opciones (orden estable con index desde 1).
 *   • Parser de respuesta CLI/UI (número 1..N, código directo, vacío, inválido).
 *   • Helper `currencyChip` para labels cortos en chips del UI.
 *   • Helper `printCurrencyMenuToConsole` que el seed CLI usa.
 */
import { describe, it, expect } from 'vitest';
import {
  getCurrencyMenuOptions,
  parseCurrencyAnswer,
  currencyChip,
  printCurrencyMenuToConsole,
} from '../lib/insurance/currency-prompt';
import { SUPPORTED_CURRENCIES } from '../lib/insurance/currency';

describe('getCurrencyMenuOptions', () => {
  it('lista todas las monedas en el mismo orden que SUPPORTED_CURRENCIES', () => {
    const opts = getCurrencyMenuOptions();
    expect(opts.map(o => o.code)).toEqual([...SUPPORTED_CURRENCIES]);
    expect(opts.length).toBe(SUPPORTED_CURRENCIES.length);
  });

  it('cada opción tiene index desde 1 con label humano (código + nombre + símbolo)', () => {
    const opts = getCurrencyMenuOptions();
    expect(opts[0].index).toBe(1);
    expect(opts[0].code).toBe('USD');
    expect(opts[0].label).toContain('USD');
    expect(opts[0].label).toContain('Dólar');
    expect(opts[0].label).toContain('$');
    // EUR es la 2da (después de USD)
    expect(opts[1].index).toBe(2);
    expect(opts[1].code).toBe('EUR');
    expect(opts[1].label).toContain('Euro');
    expect(opts[1].label).toContain('€');
    // MXN es la 3ra (con nota explicativa)
    expect(opts[2].index).toBe(3);
    expect(opts[2].code).toBe('MXN');
    expect(opts[2].label).toContain('Peso mexicano');
    expect(opts[2].nota).toContain('Default conservador');
  });

  it('cada opción tiene nota humana que justifica cuándo elegirla (o vacío)', () => {
    const opts = getCurrencyMenuOptions();
    for (const opt of opts) {
      if (opt.code === 'EUR' || opt.code === 'USD' || opt.code === 'MXN') {
        expect(opt.nota.length).toBeGreaterThan(0);
      } else {
        // Otras monedas: nota puede estar vacío o tener algo; sólo verificamos
        // que no rompe.
        expect(typeof opt.nota).toBe('string');
      }
    }
  });
});

describe('parseCurrencyAnswer', () => {
  it('1) entrada vacía → default MXN, source="default"', () => {
    const r = parseCurrencyAnswer('');
    expect(r.code).toBe('MXN');
    expect(r.source).toBe('default');
  });

  it('2) sólo whitespace → default MXN', () => {
    const r = parseCurrencyAnswer('   ');
    expect(r.code).toBe('MXN');
    expect(r.source).toBe('default');
  });

  it('3) número 1 → USD', () => {
    const r = parseCurrencyAnswer('1');
    expect(r.code).toBe('USD');
    expect(r.source).toBe('number');
  });

  it('4) número 2 → EUR', () => {
    const r = parseCurrencyAnswer('2');
    expect(r.code).toBe('EUR');
    expect(r.source).toBe('number');
  });

  it('5) número 12 → última moneda del catálogo', () => {
    const r = parseCurrencyAnswer(String(SUPPORTED_CURRENCIES.length));
    expect(r.code).toBe(SUPPORTED_CURRENCIES[SUPPORTED_CURRENCIES.length - 1]);
    expect(r.source).toBe('number');
  });

  it('6) número fuera de rango (>12) → invalid, default MXN', () => {
    const r = parseCurrencyAnswer('99');
    expect(r.code).toBe('MXN');
    expect(r.source).toBe('invalid');
  });

  it('7) número negativo → invalid', () => {
    const r = parseCurrencyAnswer('-1');
    expect(r.code).toBe('MXN');
    expect(r.source).toBe('invalid');
  });

  it('8) número decimal (no entero) → invalid', () => {
    const r = parseCurrencyAnswer('1.5');
    expect(r.code).toBe('MXN');
    expect(r.source).toBe('invalid');
  });

  it('9) código directo EUR → EUR, source="code"', () => {
    const r = parseCurrencyAnswer('EUR');
    expect(r.code).toBe('EUR');
    expect(r.source).toBe('code');
  });

  it('10) código en minúsculas eur → EUR (case-insensitive)', () => {
    const r = parseCurrencyAnswer('eur');
    expect(r.code).toBe('EUR');
    expect(r.source).toBe('code');
  });

  it('11) código no soportado (XYZ) → invalid, default MXN', () => {
    const r = parseCurrencyAnswer('XYZ');
    expect(r.code).toBe('MXN');
    expect(r.source).toBe('invalid');
  });

  it('12) entrada null → default MXN (defensivo)', () => {
    const r = parseCurrencyAnswer(null as any);
    expect(r.code).toBe('MXN');
    expect(r.source).toBe('default');
  });

  it('13) entrada undefined → default MXN (defensivo)', () => {
    const r = parseCurrencyAnswer(undefined as any);
    expect(r.code).toBe('MXN');
    expect(r.source).toBe('default');
  });
});

describe('currencyChip', () => {
  it('EUR → "€ · EUR"', () => {
    expect(currencyChip('EUR')).toBe('€ · EUR');
  });

  it('USD → "$ · USD"', () => {
    expect(currencyChip('USD')).toBe('$ · USD');
  });

  it('MXN → "$ · MXN"', () => {
    expect(currencyChip('MXN')).toBe('$ · MXN');
  });

  it('BRL → "R$ · BRL"', () => {
    expect(currencyChip('BRL')).toBe('R$ · BRL');
  });

  it('PEN → "S/ · PEN"', () => {
    expect(currencyChip('PEN')).toBe('S/ · PEN');
  });

  it('GBP → "£ · GBP"', () => {
    expect(currencyChip('GBP')).toBe('£ · GBP');
  });
});

describe('printCurrencyMenuToConsole', () => {
  it('imprime cada opción con su índice en el orden esperado', () => {
    const out: string[] = [];
    printCurrencyMenuToConsole(line => out.push(line));
    expect(out[0]).toBe('');
    expect(out[1]).toContain('Opciones:');
    // Primera opción: USD índice 1
    expect(out[2]).toContain('1.');
    expect(out[2]).toContain('USD');
    // Segunda opción: EUR
    expect(out[3]).toContain('2.');
    expect(out[3]).toContain('EUR');
    // Tercera opción: MXN (con nota conservativa)
    expect(out[4]).toContain('3.');
    expect(out[4]).toContain('MXN');
    expect(out[4]).toContain('Default');
    // Total de líneas = 1 (vacía) + 1 (header) + 12 (opciones) = 14
    expect(out.length).toBe(SUPPORTED_CURRENCIES.length + 2);
  });
});

describe('CLI ↔ UI parity', () => {
  it('la lista que ve el script CLI es la misma que el wizard UI', () => {
    // Garantiza que un cambio futuro (ej. añadir moneda) se haga en un
    // solo lugar sin drift entre el script y la UI.
    const cliOpts = getCurrencyMenuOptions();
    expect(cliOpts.map(o => o.code).join(',')).toBe(SUPPORTED_CURRENCIES.join(','));
    expect(cliOpts.length).toBe(SUPPORTED_CURRENCIES.length);
  });

  it('el parser maneja cada entrada que el script CLI produciría', () => {
    // Cada entrada válida del CLI debe parsear al código correcto.
    for (const opt of getCurrencyMenuOptions()) {
      // Por número
      const r1 = parseCurrencyAnswer(String(opt.index));
      expect(r1.code).toBe(opt.code);
      expect(r1.source).toBe('number');
      // Por código
      const r2 = parseCurrencyAnswer(opt.code);
      expect(r2.code).toBe(opt.code);
      expect(r2.source).toBe('code');
    }
  });
});
