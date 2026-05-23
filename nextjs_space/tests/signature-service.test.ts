import { describe, it, expect } from 'vitest';
import { SignatureService } from '@/lib/security/signature-service';

describe('SignatureService', () => {
  const vaultSeed = 'test-vault-seed-32-chars-minimum!!';
  const documentContent = 'Este es un documento de prueba para firmas digitales.';

  // ============================================================
  // hashDocument
  // ============================================================
  describe('hashDocument', () => {
    it('debe generar un hash SHA-256 como string hex', () => {
      const hash = SignatureService.hashDocument(documentContent);
      expect(hash).toBeTypeOf('string');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('debe ser determinista', () => {
      const h1 = SignatureService.hashDocument(documentContent);
      const h2 = SignatureService.hashDocument(documentContent);
      expect(h1).toBe(h2);
    });

    it('debe generar hashes diferentes para contenido diferente', () => {
      const h1 = SignatureService.hashDocument('contenido A');
      const h2 = SignatureService.hashDocument('contenido B');
      expect(h1).not.toBe(h2);
    });

    it('debe aceptar Buffer', () => {
      const buf = Buffer.from(documentContent);
      const hashStr = SignatureService.hashDocument(documentContent);
      const hashBuf = SignatureService.hashDocument(buf);
      expect(hashBuf).toBe(hashStr);
    });

    it('debe manejar string vacía', () => {
      const hash = SignatureService.hashDocument('');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      // Hash conocido de string vacía: e3b0c442...
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('debe manejar contenido con emojis y Unicode', () => {
      const hash = SignatureService.hashDocument('firma 🚀 documento ñoños €€€');
      expect(hash).toHaveLength(64);
    });
  });

  // ============================================================
  // generateSignature
  // ============================================================
  describe('generateSignature', () => {
    it('debe generar un HMAC-SHA256 hex de 64 caracteres', () => {
      const sig = SignatureService.generateSignature(
        SignatureService.hashDocument(documentContent),
        vaultSeed
      );
      expect(sig).toHaveLength(64);
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
    });

    it('debe ser determinista para los mismos inputs', () => {
      const docHash = SignatureService.hashDocument('mismo documento');
      const s1 = SignatureService.generateSignature(docHash, vaultSeed);
      const s2 = SignatureService.generateSignature(docHash, vaultSeed);
      expect(s1).toBe(s2);
    });

    it('debe producir firmas diferentes con seeds diferentes', () => {
      const docHash = SignatureService.hashDocument('test');
      const s1 = SignatureService.generateSignature(docHash, 'seed-uno-32-caracteres-al-menos!');
      const s2 = SignatureService.generateSignature(docHash, 'seed-dos-32-caracteres-al-menos!');
      expect(s1).not.toBe(s2);
    });

    it('debe producir firmas diferentes para hashes diferentes', () => {
      const s1 = SignatureService.generateSignature(
        SignatureService.hashDocument('doc A'), vaultSeed
      );
      const s2 = SignatureService.generateSignature(
        SignatureService.hashDocument('doc B'), vaultSeed
      );
      expect(s1).not.toBe(s2);
    });
  });

  // ============================================================
  // generateTSAStamp
  // ============================================================
  describe('generateTSAStamp', () => {
    it('debe devolver timestamp y tsaHash', () => {
      const stamp = SignatureService.generateTSAStamp('hash-123');
      expect(stamp.timestamp).toBeInstanceOf(Date);
      expect(stamp.tsaHash).toHaveLength(64);
      expect(stamp.tsaHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('TSA hashes deben diferir cuando el timestamp cambia entre llamadas', async () => {
      const s1 = SignatureService.generateTSAStamp('test');
      // Pequeña pausa para garantizar que el timestamp cambie
      await new Promise(r => setTimeout(r, 5));
      const s2 = SignatureService.generateTSAStamp('test');
      // Deben ser diferentes porque el timestamp cambió
      expect(s1.tsaHash).not.toBe(s2.tsaHash);
    });
  });

  // ============================================================
  // maskHash
  // ============================================================
  describe('maskHash', () => {
    it('debe mostrar primeros 8 y últimos 8 caracteres', () => {
      const hash = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
      const masked = SignatureService.maskHash(hash);
      expect(masked).toBe('a1b2c3d4...e9f0a1b2');
    });

    it('debe devolver el hash sin modificar si es muy corto', () => {
      expect(SignatureService.maskHash('corto')).toBe('corto');
      expect(SignatureService.maskHash('123456789012345')).toBe('123456789012345');
    });

    it('debe devolver string vacío o nulo sin error', () => {
      expect(SignatureService.maskHash('')).toBe('');
      expect(SignatureService.maskHash(null as any)).toBe(null);
      expect(SignatureService.maskHash(undefined as any)).toBe(undefined);
    });

    it('debe manejar hash de 16 caracteres exactos', () => {
      expect(SignatureService.maskHash('abcdefgh12345678')).toBe('abcdefgh...12345678');
    });
  });

  // ============================================================
  // verifyIntegrity
  // ============================================================
  describe('verifyIntegrity', () => {
    it('debe verificar integridad correctamente', () => {
      const docHash = SignatureService.hashDocument('documento íntegro');
      const sig = SignatureService.generateSignature(docHash, vaultSeed);
      expect(SignatureService.verifyIntegrity(docHash, sig, vaultSeed)).toBe(true);
    });

    it('debe rechazar firma incorrecta', () => {
      const docHash = SignatureService.hashDocument('documento');
      expect(SignatureService.verifyIntegrity(docHash, 'firma-falsa-no-valida-0000000000000000000000000000', vaultSeed)).toBe(false);
    });

    it('debe rechazar si el vaultSeed es diferente', () => {
      const docHash = SignatureService.hashDocument('documento');
      const sig = SignatureService.generateSignature(docHash, vaultSeed);
      expect(SignatureService.verifyIntegrity(docHash, sig, 'seed-diferente-32-caracteres-!!')).toBe(false);
    });

    it('debe rechazar si el documento fue modificado', () => {
      const docHashOriginal = SignatureService.hashDocument('documento original');
      const sig = SignatureService.generateSignature(docHashOriginal, vaultSeed);
      const docHashModificado = SignatureService.hashDocument('documento MODIFICADO');
      expect(SignatureService.verifyIntegrity(docHashModificado, sig, vaultSeed)).toBe(false);
    });
  });

  // ============================================================
  // Flujo completo: hash → firma → verificación
  // ============================================================
  describe('flujo completo', () => {
    it('ciclo hash-firma-verificar exitoso', () => {
      const doc = 'Contrato de soberanía digital v1.0';
      const docHash = SignatureService.hashDocument(doc);
      const signature = SignatureService.generateSignature(docHash, vaultSeed);
      const isValid = SignatureService.verifyIntegrity(docHash, signature, vaultSeed);
      expect(isValid).toBe(true);
    });

    it('ciclo debe fallar con documento manipulado', () => {
      const docOriginal = 'Balance financiero Q1 2024';
      const docHash = SignatureService.hashDocument(docOriginal);
      const signature = SignatureService.generateSignature(docHash, vaultSeed);

      // Manipulación post-firma
      const docManipulado = 'Balance financiero Q1 2024 (CORREGIDO)';
      const docHashManipulado = SignatureService.hashDocument(docManipulado);

      expect(SignatureService.verifyIntegrity(docHashManipulado, signature, vaultSeed)).toBe(false);
    });
  });
});
