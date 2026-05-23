import { describe, it, expect, beforeAll } from 'vitest';

// Set env BEFORE module import — CryptoService.KEY reads from process.env at import time
process.env.FISCAL_ENCRYPTION_KEY = 'exactly_32_byte_key_for_testing!';

// Dynamic import so the env var is set before the module initializes
let CryptoService: typeof import('@/lib/crypto-service').CryptoService;
let AuditService: typeof import('@/lib/audit-service').AuditService;

beforeAll(async () => {
  const cs = await import('@/lib/crypto-service');
  CryptoService = cs.CryptoService;
  const as = await import('@/lib/audit-service');
  AuditService = as.AuditService;
});

// ═════════════════════════════════════════════════════════════
// CryptoService — encrypt / decrypt
// ═════════════════════════════════════════════════════════════

describe('CryptoService', () => {
  it('debe encriptar texto correctamente', () => {
    const encrypted = CryptoService.encrypt('Hello World');
    expect(encrypted).toBeTruthy();
    expect(typeof encrypted).toBe('string');
    // El formato debe ser iv:encrypted (hex separado por :)
    expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it('debe desencriptar correctamente round-trip', () => {
    const original = 'Texto sensible con ñ y acentos';
    const encrypted = CryptoService.encrypt(original);
    const decrypted = CryptoService.decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('debe manejar strings vacíos', () => {
    const encrypted = CryptoService.encrypt('');
    const decrypted = CryptoService.decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('debe manejar caracteres especiales', () => {
    const original = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
    const encrypted = CryptoService.encrypt(original);
    const decrypted = CryptoService.decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('debe manejar strings largos', () => {
    const original = 'A'.repeat(10000);
    const encrypted = CryptoService.encrypt(original);
    const decrypted = CryptoService.decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('debe manejar JSON serializado', () => {
    const data = { userId: '123', role: 'admin', permissions: ['read', 'write', 'delete'] };
    const original = JSON.stringify(data);
    const encrypted = CryptoService.encrypt(original);
    const decrypted = CryptoService.decrypt(encrypted);
    expect(JSON.parse(decrypted)).toEqual(data);
  });

  it('debe manejar emojis y Unicode', () => {
    const original = '🎉 Hello 世界 مرحبا ☀️';
    const encrypted = CryptoService.encrypt(original);
    const decrypted = CryptoService.decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('cada encriptación debe producir IV diferente (no determinista)', () => {
    const e1 = CryptoService.encrypt('same text');
    const e2 = CryptoService.encrypt('same text');
    // Los IVs deben ser diferentes, por lo tanto el texto encriptado completo también
    expect(e1).not.toBe(e2);
  });

  it('debe lanzar error al desencriptar texto corrupto', () => {
    expect(() => CryptoService.decrypt('not-valid-format')).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════
// AuditService.verifySeal
// ═════════════════════════════════════════════════════════════

describe('AuditService.verifySeal', () => {
  const timestamp = new Date('2025-06-15T10:30:00.000Z');

  it('debe rechazar log sin hash', () => {
    const log = {
      tenantId: 't1',
      entidad: 'lead',
      entidadId: 'lead-1',
      accion: 'created',
      descripcion: 'test',
      fechaCreacion: timestamp,
      metadata: { sealedAt: timestamp.toISOString() }
    };
    expect(AuditService.verifySeal(log)).toBe(false);
  });

  it('debe rechazar log sin metadata.sealedAt', () => {
    const log = {
      tenantId: 't1',
      entidad: 'lead',
      entidadId: 'lead-1',
      accion: 'created',
      descripcion: 'test',
      fechaCreacion: timestamp,
      hash: 'abc123',
      metadata: {}
    };
    expect(AuditService.verifySeal(log)).toBe(false);
  });

  it('debe rechazar log con hash incorrecto', () => {
    const log = {
      tenantId: 't1',
      entidad: 'lead',
      entidadId: 'lead-1',
      accion: 'created',
      descripcion: 'test',
      fechaCreacion: timestamp,
      hash: 'badhash',
      metadata: { sealedAt: timestamp.toISOString() }
    };
    expect(AuditService.verifySeal(log)).toBe(false);
  });

  it('debe rechazar log manipulado (descripción cambiada)', () => {
    const log = {
      tenantId: 't1',
      userId: null,
      entidad: 'lead',
      entidadId: 'lead-1',
      accion: 'created',
      descripcion: 'original',
      fechaCreacion: timestamp,
      hash: 'some-hash',
      metadata: { sealedAt: timestamp.toISOString() }
    };
    // This hash won't match since it's fake
    expect(AuditService.verifySeal(log)).toBe(false);
  });

  it('debe manejar log con cambiosBefore/After', () => {
    const log = {
      tenantId: 't1',
      entidad: 'lead',
      entidadId: 'lead-1',
      accion: 'updated',
      descripcion: 'field update',
      fechaCreacion: timestamp,
      hash: 'fake-hash',
      cambiosAntes: { status: 'new' },
      cambiosDespues: { status: 'contacted' },
      metadata: { sealedAt: timestamp.toISOString() }
    };
    // Will reject due to fake hash, but shouldn't crash
    expect(AuditService.verifySeal(log)).toBe(false);
  });

  it('debe manejar log con todos los campos', () => {
    const log = {
      tenantId: 't1',
      userId: 'u1',
      entidad: 'invoice',
      entidadId: 'inv-1',
      accion: 'paid',
      descripcion: 'payment received',
      fechaCreacion: timestamp,
      hash: 'another-fake-hash',
      cambiosAntes: { status: 'pending' },
      cambiosDespues: { status: 'paid' },
      metadata: {
        sealedAt: timestamp.toISOString(),
        previousHash: 'prev-hash-123'
      }
    };
    // Should not crash
    const result = AuditService.verifySeal(log);
    expect(typeof result).toBe('boolean');
  });
});
