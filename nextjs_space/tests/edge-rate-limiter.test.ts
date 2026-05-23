import { describe, it, expect, beforeEach } from 'vitest';
import { checkEdgeRateLimit, resetEdgeRateLimit } from '@/lib/edge-rate-limiter';

// Limpiar estado entre tests
beforeEach(() => {
  resetEdgeRateLimit('ip::1.2.3.4');
  resetEdgeRateLimit('ip::5.6.7.8');
  resetEdgeRateLimit('tenant::test');
  resetEdgeRateLimit('tenant::custom');
  resetEdgeRateLimit('tenant::burst');
  resetEdgeRateLimit('tenant::reset-test');
});

// ─── checkEdgeRateLimit ───────────────────────────────────────────────────

describe('checkEdgeRateLimit', () => {
  it('debe devolver estructura correcta', () => {
    const result = checkEdgeRateLimit('ip::1.2.3.4');
    expect(result).toHaveProperty('allowed');
    expect(result).toHaveProperty('remaining');
    expect(result).toHaveProperty('resetAt');
    expect(result).toHaveProperty('limit');
    expect(typeof result.allowed).toBe('boolean');
    expect(typeof result.remaining).toBe('number');
    expect(typeof result.resetAt).toBe('number');
    expect(typeof result.limit).toBe('number');
  });

  it('primera request debe ser allowed, remaining = limit-1', () => {
    const result = checkEdgeRateLimit('ip::1.2.3.4', 10, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.limit).toBe(10);
  });

  it('requests consecutivas dentro del límite → allowed', () => {
    for (let i = 0; i < 5; i++) {
      const result = checkEdgeRateLimit('ip::5.6.7.8', 10, 60000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10 - (i + 1));
    }
  });

  it('exceder límite → allowed=false, remaining=0', () => {
    // count++ se ejecuta ANTES de verificar count <= limit
    // Con limit=4: 1ª→count=1✓, 2ª→2✓, 3ª→3✓, 4ª→4✓, 5ª→5✗
    for (let i = 0; i < 5; i++) {
      const result = checkEdgeRateLimit('tenant::burst', 4, 60000);
      if (i < 4) {
        expect(result.allowed).toBe(true);
      } else {
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
      }
    }
  });

  it('resetAt debe ser now + windowMs (aprox)', () => {
    const before = Date.now();
    const result = checkEdgeRateLimit('tenant::test', 30, 10000);
    const after = Date.now();
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 10000);
    expect(result.resetAt).toBeLessThanOrEqual(after + 10000 + 100); // margen
  });

  it('límite y window por defecto: 30 requests / 60s', () => {
    const result = checkEdgeRateLimit('tenant::custom');
    expect(result.limit).toBe(30);
  });

  it('límite personalizado', () => {
    const result = checkEdgeRateLimit('tenant::custom', 100);
    expect(result.limit).toBe(100);
  });

  it('diferentes keys no comparten contador', () => {
    const r1 = checkEdgeRateLimit('ip::aaa', 5, 60000);
    const r2 = checkEdgeRateLimit('ip::bbb', 5, 60000);
    expect(r1.remaining).toBe(4);
    expect(r2.remaining).toBe(4); // empiezan independientes
  });
});

// ─── resetEdgeRateLimit ───────────────────────────────────────────────────

describe('resetEdgeRateLimit', () => {
  it('después de reset, contador vuelve a 0 (1ra request allowed, remaining = limit-1)', () => {
    // Consumir 3 requests
    checkEdgeRateLimit('tenant::reset-test', 10, 60000);
    checkEdgeRateLimit('tenant::reset-test', 10, 60000);
    checkEdgeRateLimit('tenant::reset-test', 10, 60000);

    // Reset
    resetEdgeRateLimit('tenant::reset-test');

    // Debe empezar de nuevo
    const result = checkEdgeRateLimit('tenant::reset-test', 10, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9); // fresh window
  });

  it('reset de key inexistente no lanza error', () => {
    expect(() => resetEdgeRateLimit('key::que-no-existe')).not.toThrow();
  });
});
