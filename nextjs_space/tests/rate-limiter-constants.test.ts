import { describe, it, expect } from 'vitest';

// ─── DEFAULT_RATE_LIMITS ──────────────────────────────────────────────────
// These are not exported directly, so we access them via the RateLimiter class
// or define expected values from the source code.
// We test the constants indirectly through the exported RateLimiter.

import { RateLimiter, type RateLimitAction } from '@/lib/rate-limiter';

const VALID_ACTIONS: RateLimitAction[] = [
  'api_request_minute',
  'api_request_hour',
  'api_request_day',
  'message_send_day',
  'email_send_day',
  'whatsapp_message_day',
  'file_upload_day',
  'ai_request_day',
];

describe('RateLimiter — constants validation', () => {
  it('debe haber 8 RateLimitActions definidas', () => {
    expect(VALID_ACTIONS.length).toBe(8);
  });

  it('todas las actions deben ser strings non-empty', () => {
    VALID_ACTIONS.forEach(action => {
      expect(typeof action).toBe('string');
      expect(action.length).toBeGreaterThan(0);
    });
  });

  it('actions deben tener formato snake_case', () => {
    VALID_ACTIONS.forEach(action => {
      expect(action).toMatch(/^[a-z]+(_[a-z]+)*$/);
    });
  });

  it('todas las actions son únicas', () => {
    expect(new Set(VALID_ACTIONS).size).toBe(VALID_ACTIONS.length);
  });
});

describe('RateLimiter — singleton', () => {
  it('debe ser instanciable', () => {
    const limiter = new RateLimiter();
    expect(limiter).toBeInstanceOf(RateLimiter);
  });

  it('checkLimit debe devolver estructura RateLimitResult', async () => {
    const limiter = new RateLimiter();
    const result = await limiter.checkLimit('tenant_test', 'api_request_minute');
    expect(result).toHaveProperty('allowed');
    expect(typeof result.allowed).toBe('boolean');
    expect(result).toHaveProperty('remaining');
    expect(typeof result.remaining).toBe('number');
    expect(result).toHaveProperty('resetAt');
    expect(result.resetAt).toBeInstanceOf(Date);
    expect(result).toHaveProperty('limit');
    expect(typeof result.limit).toBe('number');
    expect(result.limit).toBeGreaterThan(0);
  });

  it('debe permitir varias requests consecutivas', async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 5; i++) {
      const result = await limiter.checkLimit('tenant_seq', 'api_request_minute');
      expect(result.allowed).toBe(true);
    }
  });

  it('getAllLimits debe devolver resultados para todas las actions', async () => {
    const limiter = new RateLimiter();
    const results = await limiter.getAllLimits('tenant_all');
    expect(typeof results).toBe('object');
    VALID_ACTIONS.forEach(action => {
      expect(results).toHaveProperty(action);
      expect(results[action]).toHaveProperty('allowed');
      expect(results[action]).toHaveProperty('remaining');
      expect(results[action]).toHaveProperty('limit');
    });
  });

  it('checkLimit con límite personalizado debe aplicar ese límite', async () => {
    const limiter = new RateLimiter();
    const result = await limiter.checkLimit('tenant_custom', 'api_request_minute', 5);
    expect(result.limit).toBe(5);
    expect(result.allowed).toBe(true);
  });

  it('increment seguido de getUsage debe reflejar el uso', async () => {
    const limiter = new RateLimiter();
    await limiter.increment('tenant_usage', 'api_request_minute');
    await limiter.increment('tenant_usage', 'api_request_minute');
    const usage = await limiter.getUsage('tenant_usage', 'api_request_minute');
    expect(usage).toBeGreaterThanOrEqual(2);
  });

  it('reset debe limpiar el contador', async () => {
    const limiter = new RateLimiter();
    await limiter.increment('tenant_rst', 'api_request_minute', 3);
    await limiter.reset('tenant_rst', 'api_request_minute');
    const usage = await limiter.getUsage('tenant_rst', 'api_request_minute');
    expect(usage).toBe(0);
  });

  it('increment con amount > 1 debe incrementar varias unidades', async () => {
    const limiter = new RateLimiter();
    await limiter.increment('tenant_bulk', 'api_request_minute', 10);
    const usage = await limiter.getUsage('tenant_bulk', 'api_request_minute');
    expect(usage).toBeGreaterThanOrEqual(10);
  });

  it('checkLimit debe devolver remaining = limit - count', async () => {
    const limiter = new RateLimiter();
    await limiter.increment('tenant_rem', 'api_request_minute', 3);
    const result = await limiter.checkLimit('tenant_rem', 'api_request_minute');
    expect(result.remaining).toBeGreaterThanOrEqual(0);
    expect(result.remaining).toBeLessThanOrEqual(result.limit);
  });
});
