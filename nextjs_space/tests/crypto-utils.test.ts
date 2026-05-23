import { describe, it, expect } from 'vitest';
import {
  generateInvoiceFingerprint,
  generateInvoiceHash,
  GENESIS_FINGERPRINT,
} from '@/lib/crypto-utils';
import type { FingerprintPayload } from '@/lib/crypto-utils';

const basePayload: FingerprintPayload = {
  tenantId: 'tenant-001',
  emisorNif: 'B76364192',
  receptorNif: '12345678Z',
  numero: 'FAC-2024-001',
  fechaEmision: '2024-04-15T10:30:00.000Z',
  monto: 1500.00,
  moneda: 'EUR',
  parentFingerprint: GENESIS_FINGERPRINT,
};

describe('Crypto Utils — generateInvoiceFingerprint', () => {
  describe('Determinismo', () => {
    it('debe generar el mismo hash para el mismo payload', () => {
      const hash1 = generateInvoiceFingerprint(basePayload);
      const hash2 = generateInvoiceFingerprint(basePayload);
      expect(hash1).toBe(hash2);
    });

    it('debe generar el mismo hash independientemente del orden de las keys', () => {
      // Creamos un objeto en orden diferente
      const reversedPayload: FingerprintPayload = {
        parentFingerprint: basePayload.parentFingerprint,
        moneda: basePayload.moneda,
        monto: basePayload.monto,
        fechaEmision: basePayload.fechaEmision,
        numero: basePayload.numero,
        receptorNif: basePayload.receptorNif,
        emisorNif: basePayload.emisorNif,
        tenantId: basePayload.tenantId,
      };

      const hash1 = generateInvoiceFingerprint(basePayload);
      const hash2 = generateInvoiceFingerprint(reversedPayload);
      expect(hash1).toBe(hash2);
    });

    it('debe generar hashes diferentes para payloads diferentes', () => {
      const hash1 = generateInvoiceFingerprint(basePayload);
      const hash2 = generateInvoiceFingerprint({
        ...basePayload,
        numero: 'FAC-2024-002',
      });
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Formato del hash', () => {
    it('debe devolver un string hexadecimal de 64 caracteres (SHA-256)', () => {
      const hash = generateInvoiceFingerprint(basePayload);
      expect(hash).toMatch(/^[0-9A-F]{64}$/);
    });

    it('el hash debe estar en mayúsculas', () => {
      const hash = generateInvoiceFingerprint(basePayload);
      expect(hash).toBe(hash.toUpperCase());
    });
  });

  describe('Sensibilidad a cambios', () => {
    it('debe cambiar si cambia el tenantId', () => {
      const h1 = generateInvoiceFingerprint(basePayload);
      const h2 = generateInvoiceFingerprint({ ...basePayload, tenantId: 'tenant-002' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el emisorNif', () => {
      const h1 = generateInvoiceFingerprint(basePayload);
      const h2 = generateInvoiceFingerprint({ ...basePayload, emisorNif: 'A28015865' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el receptorNif', () => {
      const h1 = generateInvoiceFingerprint(basePayload);
      const h2 = generateInvoiceFingerprint({ ...basePayload, receptorNif: '00000000T' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el número de factura', () => {
      const h1 = generateInvoiceFingerprint(basePayload);
      const h2 = generateInvoiceFingerprint({ ...basePayload, numero: 'FAC-999' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia la fecha de emisión', () => {
      const h1 = generateInvoiceFingerprint(basePayload);
      const h2 = generateInvoiceFingerprint({ ...basePayload, fechaEmision: '2024-05-01T00:00:00.000Z' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el monto', () => {
      const h1 = generateInvoiceFingerprint(basePayload);
      const h2 = generateInvoiceFingerprint({ ...basePayload, monto: 1500.01 });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia la moneda', () => {
      const h1 = generateInvoiceFingerprint(basePayload);
      const h2 = generateInvoiceFingerprint({ ...basePayload, moneda: 'USD' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el parentFingerprint', () => {
      const h1 = generateInvoiceFingerprint(basePayload);
      const h2 = generateInvoiceFingerprint({ ...basePayload, parentFingerprint: 'AAAA' });
      expect(h1).not.toBe(h2);
    });
  });

  describe('Normalización de montos', () => {
    it('debe normalizar montos a 2 decimales', () => {
      const h1 = generateInvoiceFingerprint({ ...basePayload, monto: 1500 });
      const h2 = generateInvoiceFingerprint({ ...basePayload, monto: 1500.00 });
      expect(h1).toBe(h2);
    });

    it('debe tratar 100.50 igual que 100.5', () => {
      const h1 = generateInvoiceFingerprint({ ...basePayload, monto: 100.5 });
      const h2 = generateInvoiceFingerprint({ ...basePayload, monto: 100.50 });
      expect(h1).toBe(h2);
    });
  });

  describe('generateInvoiceHash (alias)', () => {
    it('debe ser idéntico a generateInvoiceFingerprint', () => {
      const h1 = generateInvoiceFingerprint(basePayload);
      const h2 = generateInvoiceHash(basePayload);
      expect(h1).toBe(h2);
    });
  });

  describe('GENESIS_FINGERPRINT', () => {
    it('debe ser el valor esperado', () => {
      expect(GENESIS_FINGERPRINT).toBe('GENESIS_VERIFACTU_2026');
    });
  });

  describe('Cadena de hashes (encadenamiento)', () => {
    it('debe permitir encadenar facturas secuencialmente', () => {
      const factura1 = generateInvoiceFingerprint(basePayload);
      const factura2 = generateInvoiceFingerprint({
        ...basePayload,
        numero: 'FAC-2024-002',
        parentFingerprint: factura1,
      });
      const factura3 = generateInvoiceFingerprint({
        ...basePayload,
        numero: 'FAC-2024-003',
        parentFingerprint: factura2,
      });

      expect(factura1).not.toBe(factura2);
      expect(factura2).not.toBe(factura3);
      expect(factura1).not.toBe(factura3);

      // Verificar que factura2 depende de factura1
      const factura2Alt = generateInvoiceFingerprint({
        ...basePayload,
        numero: 'FAC-2024-002',
        parentFingerprint: 'HASH_ALTERNATIVO',
      });
      expect(factura2).not.toBe(factura2Alt);
    });
  });
});
