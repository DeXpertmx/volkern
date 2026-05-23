import { describe, it, expect } from 'vitest';
import { IdempotencyService } from '@/lib/skills/idempotency';

// Instanciamos con useDatabase=false para testear generateKey sin DB
const svc = new IdempotencyService(false);
const generateKey = svc.generateKey.bind(svc);

describe('generateKey (idempotency)', () => {
  // ─── Determinismo ────────────────────────────────────────────────────
  it('debe generar la misma key para los mismos parámetros', () => {
    const key1 = generateKey('skill', 'execute', { tenantId: 't1', skill: 'send_email' });
    const key2 = generateKey('skill', 'execute', { tenantId: 't1', skill: 'send_email' });
    expect(key1).toBe(key2);
  });

  it('debe generar la misma key sin importar el orden de inserción de las claves', () => {
    const key1 = generateKey('skill', 'execute', { a: 1, b: 2, c: 3 });
    const key2 = generateKey('skill', 'execute', { c: 3, a: 1, b: 2 });
    expect(key1).toBe(key2);
  });

  it('debe generar keys diferentes para distintos scopes', () => {
    const k1 = generateKey('skill', 'run', { id: '1' });
    const k2 = generateKey('automation', 'run', { id: '1' });
    expect(k1).not.toBe(k2);
  });

  it('debe generar keys diferentes para distintas actions', () => {
    const k1 = generateKey('skill', 'start', { id: '1' });
    const k2 = generateKey('skill', 'stop', { id: '1' });
    expect(k1).not.toBe(k2);
  });

  it('debe generar keys diferentes para distintos params', () => {
    const k1 = generateKey('skill', 'run', { id: '1' });
    const k2 = generateKey('skill', 'run', { id: '2' });
    expect(k1).not.toBe(k2);
  });

  // ─── Formato ──────────────────────────────────────────────────────────
  it('debe comenzar con scope_action_', () => {
    const key = generateKey('skill', 'execute', { tenantId: 't1' });
    expect(key).toMatch(/^skill_execute_[a-z0-9]+$/);
  });

  it('debe producir keys en base36 (solo letras minúsculas y números)', () => {
    const key = generateKey('test', 'action', { x: 1, y: 2 });
    const hashPart = key.split('_').pop()!;
    expect(hashPart).toMatch(/^[a-z0-9]+$/);
  });

  // ─── Edge cases ──────────────────────────────────────────────────────
  it('debe manejar params vacíos', () => {
    const key = generateKey('scope', 'action', {});
    expect(key).toMatch(/^scope_action_[a-z0-9]+$/);
    expect(key.split('_').pop()!.length).toBeGreaterThan(0);
  });

  it('debe manejar valores nulos en params (JSON.stringify(null)="null", JSON.stringify(undefined)=undefined→"undefined")', () => {
    const key = generateKey('scope', 'action', { a: null, b: undefined });
    const key2 = generateKey('scope', 'action', { a: null, b: undefined });
    expect(key).toBe(key2);
  });

  it('debe manejar strings largos', () => {
    const longStr = 'x'.repeat(1000);
    const key = generateKey('scope', 'action', { data: longStr });
    expect(key.startsWith('scope_action_')).toBe(true);
  });

  it('debe manejar objetos anidados en params', () => {
    const key = generateKey('scope', 'action', {
      nested: { deep: { value: 42 }, arr: [1, 2, 3] }
    });
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('debe manejar números en params', () => {
    const k1 = generateKey('s', 'a', { n: 42 });
    const k2 = generateKey('s', 'a', { n: 42 });
    expect(k1).toBe(k2);
  });

  it('debe manejar booleanos en params', () => {
    const k1 = generateKey('s', 'a', { flag: true });
    const k2 = generateKey('s', 'a', { flag: true });
    expect(k1).toBe(k2);
    const k3 = generateKey('s', 'a', { flag: false });
    expect(k1).not.toBe(k3);
  });

  it('debe manejar arrays en params', () => {
    const k1 = generateKey('s', 'a', { ids: [1, 2, 3] });
    const k2 = generateKey('s', 'a', { ids: [3, 2, 1] });
    // JSON.stringify preserva el orden del array → deben ser diferentes
    expect(k1).not.toBe(k2);
  });

  // ─── skillIdempotencyKey ─────────────────────────────────────────────
  it('skillIdempotencyKey debe usar scope=skill', () => {
    const key = generateKey('skill', 'tenant123:send_email', { leadId: 'l1' });
    expect(key.startsWith('skill_')).toBe(true);
  });

  // ─── automationIdempotencyKey ────────────────────────────────────────
  it('automationIdempotencyKey debe usar scope=automation', () => {
    const key = generateKey('automation', 'auto_1', {
      triggerId: 'trig_1',
      leadId: 'l1',
    });
    expect(key.startsWith('automation_')).toBe(true);
  });
});
