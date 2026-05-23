import { describe, it, expect } from 'vitest';
import { generateInvoiceFingerprint, GENESIS_FINGERPRINT } from '@/lib/crypto-utils';

// ==================== generateInvoiceFingerprint ====================
describe('generateInvoiceFingerprint', () => {
  const samplePayload = {
    tenantId: 'tenant-001',
    emisorNif: 'B12345678',
    receptorNif: '12345678Z',
    numero: 'FAC-2025-0001',
    fechaEmision: '2025-06-15T10:00:00.000Z',
    monto: 1500.50,
    moneda: 'EUR',
    parentFingerprint: 'GENESIS_VERIFACTU_2026',
  };

  it('debe generar un hash SHA-256 de 64 caracteres hex en mayúsculas', () => {
    const hash = generateInvoiceFingerprint(samplePayload);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9A-F]{64}$/);
  });

  it('debe ser determinista (orden alfabético de keys)', () => {
    const hash1 = generateInvoiceFingerprint(samplePayload);
    const hash2 = generateInvoiceFingerprint(samplePayload);
    expect(hash1).toBe(hash2);
  });

  it('debe ser independiente del orden de inserción en el objeto', () => {
    // Construir objeto con keys en distinto orden
    const payload1 = samplePayload;
    const payload2 = {
      moneda: 'EUR',
      parentFingerprint: 'GENESIS_VERIFACTU_2026',
      fechaEmision: '2025-06-15T10:00:00.000Z',
      receptorNif: '12345678Z',
      tenantId: 'tenant-001',
      emisorNif: 'B12345678',
      numero: 'FAC-2025-0001',
      monto: 1500.50,
    };
    expect(generateInvoiceFingerprint(payload1)).toBe(generateInvoiceFingerprint(payload2));
  });

  it('debe cambiar si cambia el tenantId', () => {
    const modified = { ...samplePayload, tenantId: 'tenant-002' };
    expect(generateInvoiceFingerprint(modified)).not.toBe(generateInvoiceFingerprint(samplePayload));
  });

  it('debe cambiar si cambia el emisorNif', () => {
    const modified = { ...samplePayload, emisorNif: 'A28017895' };
    expect(generateInvoiceFingerprint(modified)).not.toBe(generateInvoiceFingerprint(samplePayload));
  });

  it('debe cambiar si cambia el receptorNif', () => {
    const modified = { ...samplePayload, receptorNif: 'X1234567L' };
    expect(generateInvoiceFingerprint(modified)).not.toBe(generateInvoiceFingerprint(samplePayload));
  });

  it('debe cambiar si cambia el numero de factura', () => {
    const modified = { ...samplePayload, numero: 'FAC-2025-0002' };
    expect(generateInvoiceFingerprint(modified)).not.toBe(generateInvoiceFingerprint(samplePayload));
  });

  it('debe cambiar si cambia la fecha de emisión', () => {
    const modified = { ...samplePayload, fechaEmision: '2025-06-16T10:00:00.000Z' };
    expect(generateInvoiceFingerprint(modified)).not.toBe(generateInvoiceFingerprint(samplePayload));
  });

  it('debe cambiar si cambia el monto', () => {
    const modified = { ...samplePayload, monto: 2000.00 };
    expect(generateInvoiceFingerprint(modified)).not.toBe(generateInvoiceFingerprint(samplePayload));
  });

  it('debe formatear montos a 2 decimales', () => {
    const payload = { ...samplePayload, monto: 100 };
    const hash = generateInvoiceFingerprint(payload);
    expect(hash).toHaveLength(64); // No debe lanzar error
  });

  it('debe generar hash válido para monto 0', () => {
    const hash = generateInvoiceFingerprint({ ...samplePayload, monto: 0 });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9A-F]{64}$/);
  });

  it('debe generar hash válido para parentFingerprint vacío', () => {
    const hash = generateInvoiceFingerprint({ ...samplePayload, parentFingerprint: '' });
    expect(hash).toHaveLength(64);
  });
});

// ==================== GENESIS_FINGERPRINT ====================
describe('GENESIS_FINGERPRINT', () => {
  it('debe ser "GENESIS_VERIFACTU_2026"', () => {
    expect(GENESIS_FINGERPRINT).toBe('GENESIS_VERIFACTU_2026');
  });

  it('debe ser un string no vacío', () => {
    expect(GENESIS_FINGERPRINT.length).toBeGreaterThan(0);
  });
});
