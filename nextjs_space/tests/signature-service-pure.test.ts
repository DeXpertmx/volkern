import { describe, it, expect } from 'vitest';
import { SignatureService } from '@/lib/security/signature-service';
import * as crypto from 'crypto';

// ─── Helper ───────────────────────────────────────────────────────────────

const TEST_VAULT_SEED = 'test-vault-seed-32-bytes-key123!';

// ─── hashDocument ─────────────────────────────────────────────────────────

describe('SignatureService.hashDocument', () => {
  it('debe generar hash SHA-256 de un string', () => {
    const hash = SignatureService.hashDocument('hello world');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('debe generar hash SHA-256 de un buffer', () => {
    const buffer = Buffer.from('test data');
    const hash = SignatureService.hashDocument(buffer);
    expect(hash).toHaveLength(64);
  });

  it('debe ser determinista', () => {
    const a = SignatureService.hashDocument('same input');
    const b = SignatureService.hashDocument('same input');
    expect(a).toBe(b);
  });

  it('diferentes entradas → diferentes hashes', () => {
    const a = SignatureService.hashDocument('input A');
    const b = SignatureService.hashDocument('input B');
    expect(a).not.toBe(b);
  });

  it('string vacío → hash válido', () => {
    const hash = SignatureService.hashDocument('');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ─── maskHash ─────────────────────────────────────────────────────────────

describe('SignatureService.maskHash', () => {
  const fullHash = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

  it('debe mostrar primeros 8 y últimos 8 caracteres', () => {
    const masked = SignatureService.maskHash(fullHash);
    expect(masked).toBe('a1b2c3d4...e9f0a1b2');
  });

  it('debe devolver el hash original si es muy corto (< 16 chars)', () => {
    const short = 'abc123';
    expect(SignatureService.maskHash(short)).toBe(short);
  });

  it('debe devolver el hash original si es null/undefined/vacío', () => {
    expect(SignatureService.maskHash('')).toBe('');
  });

  it('longitud exacta 16 → enmascara (first8...last8 = string completo)', () => {
    const exact16 = '1234567890abcdef';
    const masked = SignatureService.maskHash(exact16);
    expect(masked).toContain('...');
    expect(masked.length).toBe(19); // 8 + 3 + 8
    expect(masked).toBe('12345678...90abcdef');
  });

  it('longitud 17 → debe enmascarar', () => {
    const len17 = 'a'.repeat(17);
    const masked = SignatureService.maskHash(len17);
    expect(masked).toContain('...');
    expect(masked.length).toBe(19); // 8 + 3 + 8
  });
});

// ─── generateSignature ────────────────────────────────────────────────────

describe('SignatureService.generateSignature', () => {
  it('debe generar HMAC-SHA256 hex de 64 caracteres', () => {
    const sig = SignatureService.generateSignature(
      SignatureService.hashDocument('doc1'),
      TEST_VAULT_SEED
    );
    expect(sig).toHaveLength(64);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('debe ser determinista (misma entrada → misma firma)', () => {
    const docHash = SignatureService.hashDocument('test doc');
    const a = SignatureService.generateSignature(docHash, TEST_VAULT_SEED);
    const b = SignatureService.generateSignature(docHash, TEST_VAULT_SEED);
    expect(a).toBe(b);
  });

  it('diferente vaultSeed → diferente firma', () => {
    const docHash = SignatureService.hashDocument('test doc');
    const a = SignatureService.generateSignature(docHash, 'seed-aaaa-bbbb');
    const b = SignatureService.generateSignature(docHash, 'seed-cccc-dddd');
    expect(a).not.toBe(b);
  });

  it('diferente documento → diferente firma', () => {
    const a = SignatureService.generateSignature(
      SignatureService.hashDocument('doc A'),
      TEST_VAULT_SEED
    );
    const b = SignatureService.generateSignature(
      SignatureService.hashDocument('doc B'),
      TEST_VAULT_SEED
    );
    expect(a).not.toBe(b);
  });
});

// ─── verifyIntegrity ──────────────────────────────────────────────────────

describe('SignatureService.verifyIntegrity', () => {
  it('debe validar true para firma correcta', () => {
    const docHash = SignatureService.hashDocument('important doc');
    const sig = SignatureService.generateSignature(docHash, TEST_VAULT_SEED);
    expect(SignatureService.verifyIntegrity(docHash, sig, TEST_VAULT_SEED)).toBe(true);
  });

  it('debe validar false para firma incorrecta (documento alterado)', () => {
    const docHash = SignatureService.hashDocument('original');
    const sig = SignatureService.generateSignature(docHash, TEST_VAULT_SEED);
    const tamperedHash = SignatureService.hashDocument('tampered');
    expect(SignatureService.verifyIntegrity(tamperedHash, sig, TEST_VAULT_SEED)).toBe(false);
  });

  it('debe validar false para firma incorrecta (seed incorrecto)', () => {
    const docHash = SignatureService.hashDocument('doc');
    const sig = SignatureService.generateSignature(docHash, TEST_VAULT_SEED);
    expect(SignatureService.verifyIntegrity(docHash, sig, 'wrong-seed')).toBe(false);
  });
});

// ─── generateTSAStamp ─────────────────────────────────────────────────────

describe('SignatureService.generateTSAStamp', () => {
  it('debe generar timestamp y tsaHash', () => {
    const stamp = SignatureService.generateTSAStamp('some-doc-hash');
    expect(stamp).toHaveProperty('timestamp');
    expect(stamp).toHaveProperty('tsaHash');
    expect(stamp.timestamp).toBeInstanceOf(Date);
    expect(stamp.tsaHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('timestamp debe ser reciente', () => {
    const before = Date.now();
    const stamp = SignatureService.generateTSAStamp('hash123');
    expect(stamp.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(stamp.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('diferentes hashes → diferentes tsaHash', () => {
    const a = SignatureService.generateTSAStamp('hash-A');
    const b = SignatureService.generateTSAStamp('hash-B');
    expect(a.tsaHash).not.toBe(b.tsaHash);
  });
});
