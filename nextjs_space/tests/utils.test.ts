import { describe, it, expect } from 'vitest';
import { cn, formatDuration, formatCurrency } from '@/lib/utils';

// ─── cn ───────────────────────────────────────────────────────────────────

describe('cn', () => {
  it('debe concatenar strings simples con espacios', () => {
    const result = cn('foo', 'bar');
    expect(result).toContain('foo');
    expect(result).toContain('bar');
  });

  it('debe filtrar falsy values (false, null, undefined)', () => {
    const result = cn('a', false && 'b', null, undefined, 'c');
    expect(result).toBe('a c');
  });

  it('debe resolver objetos condicionales', () => {
    const result = cn('base', { active: true, disabled: false });
    expect(result).toContain('base');
    expect(result).toContain('active');
    expect(result).not.toContain('disabled');
  });

  it('debe mergear clases tailwind con twMerge', () => {
    const result = cn('px-2 px-4', 'text-sm');
    // twMerge resuelve conflictos: px-4 prevalece sobre px-2
    expect(result).toContain('px-4');
    expect(result).not.toContain('px-2');
    expect(result).toContain('text-sm');
  });

  it('debe devolver string vacío sin argumentos', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('debe manejar arrays anidados', () => {
    const result = cn('a', ['b', 'c']);
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).toContain('c');
  });

  it('debe manejar combinaciones complejas', () => {
    const result = cn(
      'base-class',
      false && 'hidden',
      { 'is-active': true, 'is-disabled': false },
      ['nested-a', null, undefined, 'nested-b']
    );
    expect(result).toContain('base-class');
    expect(result).toContain('is-active');
    expect(result).not.toContain('is-disabled');
    expect(result).not.toContain('hidden');
    expect(result).toContain('nested-a');
    expect(result).toContain('nested-b');
  });

  it('debe ser determinista', () => {
    const a = cn('foo', 'bar', { baz: true });
    const b = cn('foo', 'bar', { baz: true });
    expect(a).toBe(b);
  });
});

// ─── formatDuration ───────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('debe formatear 0 segundos como 00:00:00', () => {
    expect(formatDuration(0)).toBe('00:00:00');
  });

  it('debe formatear solo segundos (< 60)', () => {
    expect(formatDuration(45)).toBe('00:00:45');
  });

  it('debe formatear minutos sin horas', () => {
    expect(formatDuration(300)).toBe('00:05:00'); // 5 min
  });

  it('debe formatear horas completas', () => {
    expect(formatDuration(3600)).toBe('01:00:00'); // 1h
  });

  it('debe formatear combinación H:M:S', () => {
    expect(formatDuration(3661)).toBe('01:01:01'); // 1h 1m 1s
  });

  it('debe formatear 23:59:59', () => {
    expect(formatDuration(86399)).toBe('23:59:59');
  });

  it('debe formatear > 99 horas correctamente', () => {
    expect(formatDuration(360000)).toBe('100:00:00'); // 100h
  });

  it('debe padStart segundos con cero', () => {
    expect(formatDuration(7)).toBe('00:00:07');
  });

  it('debe padStart minutos con cero', () => {
    expect(formatDuration(65)).toBe('00:01:05');
  });

  it('debe padStart horas con cero', () => {
    expect(formatDuration(7200)).toBe('02:00:00');
  });

  it('debe formatear el máximo JS seguro sin errores', () => {
    const result = formatDuration(Number.MAX_SAFE_INTEGER);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^\d{2,}:\d{2}:\d{2}$/);
  });

  it('debe determinismo', () => {
    expect(formatDuration(5432)).toBe(formatDuration(5432));
  });
});

// ─── formatCurrency ───────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('debe formatear EUR por defecto', () => {
    const result = formatCurrency(1000);
    expect(result).toContain('€');
    // Intl.NumberFormat es-ES usa . como separador de miles y , como decimal
    expect(result).toMatch(/1\.?000/);
  });

  it('debe formatear USD', () => {
    const result = formatCurrency(500, 'USD');
    expect(result).toContain('US$');
  });

  it('debe formatear MXN', () => {
    const result = formatCurrency(100, 'MXN');
    // El símbolo puede ser MX$ o MXN según la versión de ICU
    expect(result).toMatch(/MX/);
  });

  it('debe formatear cero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0,00');
  });

  it('debe formatear decimales (EUR con coma decimal)', () => {
    const result = formatCurrency(1234.56);
    // es-ES: coma decimal, punto como separador de miles (opcional según ICU)
    expect(result).toContain(',56');
    expect(result).toContain('€');
  });

  it('debe formatear números grandes', () => {
    const result = formatCurrency(1000000);
    expect(result).toContain('1.000.000');
  });

  it('debe formatear números negativos', () => {
    const result = formatCurrency(-500);
    expect(result).toContain('-');
    expect(result).toContain('500');
  });

  it('debe ser determinista', () => {
    expect(formatCurrency(42.5, 'EUR')).toBe(formatCurrency(42.5, 'EUR'));
  });

  it('debe devolver string', () => {
    expect(typeof formatCurrency(99)).toBe('string');
  });
});
