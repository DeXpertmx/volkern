/**
 * Tests vitest del resolver `lib/insurance/tenant-currency-resolver`.
 *
 * Cubre todas las ramas:
 *   1. Moneda explícita del usuario (gana sobre todo).
 *   2. Moneda explícita inválida → cae al auto-detector.
 *   3. Sin pólizas → fallback default (MXN por defecto).
 *   4. Una moneda (EUR / USD / cualquier) → esa moneda.
 *   5. Múltiples monedas → fallback default conservador.
 *   6. Soporte para distintos fallbackDefaults (e.g. USD en lugar de MXN).
 *   7. El helper `groupByMoneda` produce el map correcto.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveTenantCurrency,
  groupByMoneda,
  type CurrencyResolution,
} from '../lib/insurance/tenant-currency-resolver';

describe('resolveTenantCurrency', () => {
  it('1) moneda explícita del usuario gana sobre las pólizas', () => {
    const out = resolveTenantCurrency('EUR', { USD: 100, MXN: 50 });
    expect(out.moneda).toBe('EUR');
    expect(out.source).toBe('explicit');
    expect(out.mensaje).toContain('EUR');
  });

  it('1.b) moneda explícita en minúsculas también se acepta', () => {
    const out = resolveTenantCurrency('usd', { EUR: 50 });
    expect(out.moneda).toBe('USD');
    expect(out.source).toBe('explicit');
  });

  it('2) moneda explícita inválida cae al auto-detector (no crash)', () => {
    const out = resolveTenantCurrency('XYZ', { EUR: 100 });
    expect(out.moneda).toBe('EUR');
    expect(out.source).toBe('auto-from-polizas');
  });

  it('3) sin pólizas → fallback default MXN', () => {
    const out = resolveTenantCurrency(null, {});
    expect(out.moneda).toBe('MXN');
    expect(out.source).toBe('fallback-default');
    expect(out.mensaje).toContain('Default conservador');
  });

  it('3.b) sin pólizas pero con flag --moneda explícito → gana la explícita', () => {
    const out = resolveTenantCurrency('EUR', {});
    expect(out.moneda).toBe('EUR');
    expect(out.source).toBe('explicit');
  });

  it('4) todas las pólizas en EUR → set EUR', () => {
    const out = resolveTenantCurrency(null, { EUR: 12 });
    expect(out.moneda).toBe('EUR');
    expect(out.source).toBe('auto-from-polizas');
    expect(out.mensaje).toContain('EUR');
    expect(out.mensaje).toContain('100%');
  });

  it('4.b) todas las pólizas en USD → set USD', () => {
    const out = resolveTenantCurrency(null, { USD: 250 });
    expect(out.moneda).toBe('USD');
    expect(out.source).toBe('auto-from-polizas');
  });

  it('4.c) todas las pólizas en GBP → set GBP', () => {
    const out = resolveTenantCurrency(null, { GBP: 5 });
    expect(out.moneda).toBe('GBP');
    expect(out.source).toBe('auto-from-polizas');
  });

  it('5) múltiples monedas → fallback default conservador (MXN)', () => {
    const out = resolveTenantCurrency(null, { EUR: 10, USD: 5, MXN: 2 });
    expect(out.moneda).toBe('MXN');
    expect(out.source).toBe('fallback-default');
    expect(out.mensaje).toContain('multi-divisa');
    expect(out.monedasObservadas).toEqual(expect.arrayContaining(['EUR', 'USD', 'MXN']));
    expect(out.distribucion).toEqual({ EUR: 10, USD: 5, MXN: 2 });
  });

  it('6) fallbackDefault configurable (e.g. USD en lugar de MXN)', () => {
    const out = resolveTenantCurrency(null, {}, { fallbackDefault: 'USD' });
    expect(out.moneda).toBe('USD');
    expect(out.source).toBe('fallback-default');
  });

  it('6.b) fallbackDefault también funciona en caso mixto', () => {
    const out = resolveTenantCurrency(null, { EUR: 1, USD: 2 }, { fallbackDefault: 'EUR' });
    expect(out.moneda).toBe('EUR');
    expect(out.source).toBe('fallback-default');
  });

  it('7) monedas no soportadas en distribucion se filtran de monedasObservadas', () => {
    // XYZ no está en SUPPORTED_CURRENCIES; debe aparecer en distribucion pero
    // NO en monedasObservadas.
    const out = resolveTenantCurrency(null, { EUR: 5, XYZ: 1 } as any);
    expect(out.moneda).toBe('EUR');
    expect(out.monedasObservadas).toEqual(['EUR']);
    expect(out.distribucion).toEqual({ EUR: 5, XYZ: 1 }); // raw se preserva
  });

  it('cuenta 0 se ignora (defensivo)', () => {
    const out = resolveTenantCurrency(null, { EUR: 0, USD: 10 });
    expect(out.moneda).toBe('USD');
    expect(out.source).toBe('auto-from-polizas');
    expect(out.monedasObservadas).toEqual(['USD']);
  });

  it('undefined explícito se trata como ausente', () => {
    const out = resolveTenantCurrency(undefined, { EUR: 5 });
    expect(out.moneda).toBe('EUR');
    expect(out.source).toBe('auto-from-polizas');
  });
});

describe('groupByMoneda', () => {
  it('agrupa rows por moneda', async () => {
    const out = await groupByMoneda([
      { moneda: 'EUR' },
      { moneda: 'EUR' },
      { moneda: 'USD' },
      { moneda: null },
    ]);
    expect(out).toEqual({ EUR: 2, USD: 1, UNKNOWN: 1 });
  });

  it('normaliza a mayúsculas', async () => {
    const out = await groupByMoneda([
      { moneda: 'eur' },
      { moneda: 'EUR' },
      { moneda: 'Usd' },
    ]);
    expect(out).toEqual({ EUR: 2, USD: 1 });
  });

  it('array vacío → map vacío', async () => {
    const out = await groupByMoneda([]);
    expect(out).toEqual({});
  });
});

describe('integración con flujos reales', () => {
  it('caso broker europeo: importó 50 pólizas EUR → auto EUR', () => {
    const dist = { EUR: 50 };
    const out = resolveTenantCurrency(null, dist);
    expect(out.moneda).toBe('EUR');
    expect(out.source).toBe('auto-from-polizas');
    // Lo usa el portfolio ejecutivo: el broker ve €, no conversión a MXN.
  });

  it('caso broker EUA: importó 30 USD → auto USD', () => {
    const dist = { USD: 30 };
    const out = resolveTenantCurrency(null, dist);
    expect(out.moneda).toBe('USD');
    expect(out.source).toBe('auto-from-polizas');
  });

  it('caso broker multi-país: 100 EUR + 80 USD + 20 MXN → conservador MXN', () => {
    const dist = { EUR: 100, USD: 80, MXN: 20 };
    const out = resolveTenantCurrency(null, dist);
    expect(out.moneda).toBe('MXN');
    expect(out.source).toBe('fallback-default');
    expect(out.mensaje).toMatch(/multi-divisa.*3 monedas/i);
  });

  it('caso sin importaciones aún: tenant recién creado → MXN default (cambia luego)', () => {
    const out = resolveTenantCurrency(null, {});
    expect(out.moneda).toBe('MXN');
    // El broker puede cambiar después vía /dashboard/configuracion?section=empresa
  });

  it('caso onboarding con flag CLI explícito: --moneda=EUR', () => {
    // El prompt interactivo no se ejecutó (e.g. CI) pero el usuario pasó flag
    const out = resolveTenantCurrency('EUR', {});
    expect(out.moneda).toBe('EUR');
    expect(out.source).toBe('explicit');
    // Mensaje explica que ganó la explícita sobre evidencia vacía
    expect(out.mensaje).toMatch(/expl[ií]citamente/i);
  });
});
