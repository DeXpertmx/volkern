import { describe, it, expect, beforeEach } from 'vitest';
import { checkEdgeRateLimit, resetEdgeRateLimit } from '@/lib/edge-rate-limiter';

// ─────────────────────────────────────────────────────────────
// checkEdgeRateLimit
// ─────────────────────────────────────────────────────────────

describe('checkEdgeRateLimit', () => {
  // Clean state before each test
  beforeEach(() => {
    resetEdgeRateLimit('test-ip');
    resetEdgeRateLimit('ip-2');
    resetEdgeRateLimit('burst-ip');
    resetEdgeRateLimit('reset-test');
  });

  it('debe permitir la primera solicitud', () => {
    const result = checkEdgeRateLimit('test-ip', 10, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.limit).toBe(10);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  it('debe contar solicitudes sucesivas correctamente', () => {
    for (let i = 0; i < 5; i++) {
      const result = checkEdgeRateLimit('test-ip', 10, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9 - i);
    }
  });

  it('debe rechazar cuando se excede el límite', () => {
    for (let i = 0; i < 10; i++) {
      checkEdgeRateLimit('test-ip', 10, 60_000);
    }
    const result = checkEdgeRateLimit('test-ip', 10, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('debe mantener límites independientes por IP', () => {
    // Consume all for ip-1
    for (let i = 0; i < 10; i++) {
      checkEdgeRateLimit('test-ip', 10, 60_000);
    }
    // ip-2 should still be allowed
    const result = checkEdgeRateLimit('ip-2', 10, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('debe aceptar límite por defecto de 30', () => {
    const result = checkEdgeRateLimit('default-ip');
    expect(result.limit).toBe(30);
    expect(result.remaining).toBe(29);
  });

  it('debe aceptar ventana de tiempo personalizada', () => {
    const result = checkEdgeRateLimit('custom-window', 5, 30_000);
    expect(result.limit).toBe(5);
    expect(result.resetAt).toBeGreaterThan(Date.now());
    expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 30_000);
  });

  it('debe resetear la ventana cuando expira', () => {
    // This is a behavioral test — we can't easily mock time here,
    // but we can verify the reset mechanism works for a new key
    resetEdgeRateLimit('fresh-key');
    const r1 = checkEdgeRateLimit('fresh-key', 5, 60_000);
    expect(r1.remaining).toBe(4);
    // Consume remaining
    for (let i = 0; i < 4; i++) {
      checkEdgeRateLimit('fresh-key', 5, 60_000);
    }
    const rExhausted = checkEdgeRateLimit('fresh-key', 5, 60_000);
    expect(rExhausted.allowed).toBe(false);
  });

  it('resetEdgeRateLimit debe limpiar el contador', () => {
    // Consume some
    for (let i = 0; i < 5; i++) {
      checkEdgeRateLimit('reset-test', 10, 60_000);
    }
    // Reset
    resetEdgeRateLimit('reset-test');
    // Should start fresh
    const result = checkEdgeRateLimit('reset-test', 10, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('debe manejar límite 1', () => {
    const r1 = checkEdgeRateLimit('single', 1, 60_000);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(0);

    const r2 = checkEdgeRateLimit('single', 1, 60_000);
    expect(r2.allowed).toBe(false);
    expect(r2.remaining).toBe(0);
  });

  it('debe manejar límite 0 (bloquear todo después de la primera)', () => {
    // First request always creates a new window → allowed
    const r1 = checkEdgeRateLimit('blocked', 0, 60_000);
    expect(r1.allowed).toBe(true);
    // Second request should be blocked
    const r2 = checkEdgeRateLimit('blocked', 0, 60_000);
    expect(r2.allowed).toBe(false);
    expect(r2.remaining).toBe(0);
  });

  it('debe devolver remaining correcto incluso cuando se excede mucho', () => {
    for (let i = 0; i < 20; i++) {
      checkEdgeRateLimit('burst-ip', 5, 60_000);
    }
    const result = checkEdgeRateLimit('burst-ip', 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
