import { describe, it, expect, beforeEach } from 'vitest';
import { formatDuration, formatCurrency } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// formatDuration
// ─────────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('debe formatear 0 segundos como 00:00:00', () => {
    expect(formatDuration(0)).toBe('00:00:00');
  });

  it('debe formatear segundos correctamente', () => {
    expect(formatDuration(45)).toBe('00:00:45');
    expect(formatDuration(7)).toBe('00:00:07');
  });

  it('debe formatear minutos y segundos', () => {
    expect(formatDuration(65)).toBe('00:01:05');
    expect(formatDuration(125)).toBe('00:02:05');
    expect(formatDuration(3599)).toBe('00:59:59');
  });

  it('debe formatear horas completas', () => {
    expect(formatDuration(3600)).toBe('01:00:00');
    expect(formatDuration(3661)).toBe('01:01:01');
    expect(formatDuration(7200)).toBe('02:00:00');
  });

  it('debe formatear duraciones largas', () => {
    expect(formatDuration(36661)).toBe('10:11:01');
    expect(formatDuration(86400)).toBe('24:00:00');
    expect(formatDuration(90061)).toBe('25:01:01');
  });

  it('debe usar siempre 2 dígitos con padding', () => {
    const result = formatDuration(3661);
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

// ─────────────────────────────────────────────────────────────
// formatCurrency
// ─────────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('debe formatear EUR por defecto', () => {
    const result = formatCurrency(1500);
    // es-ES locale: contains € and 1.500 (thousands sep may vary by ICU support)
    expect(result).toContain('€');
    expect(result).toMatch(/1\.?500[,.]00/);
  });

  it('debe formatear USD correctamente', () => {
    const result = formatCurrency(99.99, 'USD');
    expect(result).toContain('99,99');
  });

  it('debe formatear MXN', () => {
    const result = formatCurrency(1000000, 'MXN');
    // Should contain 1,000,000 or 1.000.000 (locale-dependent)
    expect(result).toMatch(/1[,.]000[,.]000/);
  });

  it('debe formatear cero', () => {
    const result = formatCurrency(0, 'EUR');
    expect(result).toContain('0,00');
  });

  it('debe formatear valores negativos', () => {
    const result = formatCurrency(-500, 'EUR');
    expect(result).toContain('-');
    expect(result).toContain('500');
  });

  it('debe formatear decimales correctamente', () => {
    const result = formatCurrency(1234.56, 'EUR');
    // es-ES locale: decimal comma, contains €
    expect(result).toContain('€');
    expect(result).toContain(',56');
  });

  it('debe formatear diferentes monedas sin error', () => {
    const currencies = ['EUR', 'USD', 'GBP', 'MXN', 'JPY', 'BRL', 'COP', 'CLP', 'PEN', 'ARS'];
    for (const ccy of currencies) {
      const result = formatCurrency(100, ccy);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
