import { describe, it, expect } from 'vitest';
import { ItemIntegrityService, type IntegrityData } from '@/lib/security/item-integrity';

describe('ItemIntegrityService', () => {
  const baseData: IntegrityData = {
    sku: 'PROD-001',
    nombre: 'Producto de Prueba',
    precioBase: 99.99,
    costOfAcquisition: 45.50,
    tenantId: 'tenant-test-12345678901',
  };

  // ============================================================
  // calculateHash
  // ============================================================
  describe('calculateHash', () => {
    it('debe generar un hash SHA-256 hex de 64 caracteres', () => {
      const hash = ItemIntegrityService.calculateHash(baseData);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('debe ser determinista', () => {
      const h1 = ItemIntegrityService.calculateHash(baseData);
      const h2 = ItemIntegrityService.calculateHash(baseData);
      expect(h1).toBe(h2);
    });

    it('debe cambiar si cambia el precioBase', () => {
      const h1 = ItemIntegrityService.calculateHash(baseData);
      const h2 = ItemIntegrityService.calculateHash({ ...baseData, precioBase: 100.00 });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el costOfAcquisition', () => {
      const h1 = ItemIntegrityService.calculateHash(baseData);
      const h2 = ItemIntegrityService.calculateHash({ ...baseData, costOfAcquisition: 50.00 });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el nombre', () => {
      const h1 = ItemIntegrityService.calculateHash(baseData);
      const h2 = ItemIntegrityService.calculateHash({ ...baseData, nombre: 'Otro producto' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el sku', () => {
      const h1 = ItemIntegrityService.calculateHash(baseData);
      const h2 = ItemIntegrityService.calculateHash({ ...baseData, sku: 'PROD-002' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el tenantId', () => {
      const h1 = ItemIntegrityService.calculateHash(baseData);
      const h2 = ItemIntegrityService.calculateHash({ ...baseData, tenantId: 'otro-tenant-98765432100' });
      expect(h1).not.toBe(h2);
    });

    it('debe manejar sku null', () => {
      const hash = ItemIntegrityService.calculateHash({ ...baseData, sku: null });
      expect(hash).toHaveLength(64);
    });

    it('debe manejar precios 0', () => {
      const hash = ItemIntegrityService.calculateHash({
        ...baseData,
        precioBase: 0,
        costOfAcquisition: 0,
      });
      expect(hash).toHaveLength(64);
    });

    it('debe manejar precios negativos', () => {
      const hash = ItemIntegrityService.calculateHash({
        ...baseData,
        precioBase: -10,
        costOfAcquisition: -5,
      });
      expect(hash).toHaveLength(64);
    });

    it('debe manejar nombres con caracteres especiales', () => {
      const hash = ItemIntegrityService.calculateHash({
        ...baseData,
        nombre: 'Producto con ñ, acentos, y símbolos €$#@!',
      });
      expect(hash).toHaveLength(64);
    });
  });

  // ============================================================
  // verifyHash
  // ============================================================
  describe('verifyHash', () => {
    it('debe verificar hash correcto', () => {
      const hash = ItemIntegrityService.calculateHash(baseData);
      expect(ItemIntegrityService.verifyHash(baseData, hash)).toBe(true);
    });

    it('debe rechazar hash incorrecto', () => {
      expect(ItemIntegrityService.verifyHash(baseData, 'hash-falso-no-valido-0000000000000000000000000000')).toBe(false);
    });

    it('debe rechazar hash vacío', () => {
      expect(ItemIntegrityService.verifyHash(baseData, '')).toBe(false);
    });

    it('debe rechazar datos manipulados con hash original', () => {
      const hash = ItemIntegrityService.calculateHash(baseData);
      const manipulatedData = { ...baseData, precioBase: 999.99 };
      expect(ItemIntegrityService.verifyHash(manipulatedData, hash)).toBe(false);
    });

    it('debe rechazar si el hash es del producto equivocado', () => {
      const hashA = ItemIntegrityService.calculateHash(baseData);
      const hashB = ItemIntegrityService.calculateHash({ ...baseData, sku: 'OTRO-PROD' });
      expect(ItemIntegrityService.verifyHash(baseData, hashB)).toBe(false);
    });
  });
});
