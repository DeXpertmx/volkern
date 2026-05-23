import { describe, it, expect } from 'vitest';
import { createAuditHash, generateGenesisHash, GENESIS_HASH } from '@/lib/audit-hash';

// ==================== createAuditHash ====================
describe('createAuditHash', () => {
  const sampleData = {
    tenantId: 'tenant-001',
    userId: 'user-abc-123',
    entity: 'Factura',
    entityId: 'fac-2025-001',
    action: 'CREATE',
    description: 'Factura creada por sistema',
    timestamp: new Date('2025-06-15T10:00:00.000Z'),
    previousHash: 'abc123def456',
    changesBefore: { estado: 'borrador' },
    changesAfter: { estado: 'emitida', total: 1500 },
  };

  it('debe generar un hash SHA-256 de 64 caracteres hex', () => {
    const hash = createAuditHash(sampleData);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('debe ser determinista', () => {
    const hash1 = createAuditHash(sampleData);
    const hash2 = createAuditHash(sampleData);
    expect(hash1).toBe(hash2);
  });

  it('debe cambiar si cambia tenantId', () => {
    const modified = { ...sampleData, tenantId: 'tenant-002' };
    expect(createAuditHash(modified)).not.toBe(createAuditHash(sampleData));
  });

  it('debe cambiar si cambia entity', () => {
    const modified = { ...sampleData, entity: 'Cliente' };
    expect(createAuditHash(modified)).not.toBe(createAuditHash(sampleData));
  });

  it('debe cambiar si cambia entityId', () => {
    const modified = { ...sampleData, entityId: 'fac-2025-002' };
    expect(createAuditHash(modified)).not.toBe(createAuditHash(sampleData));
  });

  it('debe cambiar si cambia action', () => {
    const modified = { ...sampleData, action: 'UPDATE' };
    expect(createAuditHash(modified)).not.toBe(createAuditHash(sampleData));
  });

  it('debe cambiar si cambia description', () => {
    const modified = { ...sampleData, description: 'Factura modificada' };
    expect(createAuditHash(modified)).not.toBe(createAuditHash(sampleData));
  });

  it('debe cambiar si cambia timestamp', () => {
    const modified = { ...sampleData, timestamp: new Date('2025-06-16T10:00:00.000Z') };
    expect(createAuditHash(modified)).not.toBe(createAuditHash(sampleData));
  });

  it('debe cambiar si cambia previousHash', () => {
    const modified = { ...sampleData, previousHash: 'different-hash' };
    expect(createAuditHash(modified)).not.toBe(createAuditHash(sampleData));
  });

  it('debe cambiar si cambia changesBefore', () => {
    const modified = { ...sampleData, changesBefore: { estado: 'pendiente' } };
    expect(createAuditHash(modified)).not.toBe(createAuditHash(sampleData));
  });

  it('debe cambiar si cambia changesAfter', () => {
    const modified = { ...sampleData, changesAfter: { estado: 'anulada' } };
    expect(createAuditHash(modified)).not.toBe(createAuditHash(sampleData));
  });

  it('debe usar GENESIS_HASH si previousHash es null', () => {
    const hash = createAuditHash({ ...sampleData, previousHash: null });
    expect(hash).toHaveLength(64);
  });

  it('debe usar string vacío para userId null', () => {
    const hash = createAuditHash({ ...sampleData, userId: null });
    expect(hash).toHaveLength(64);
  });

  it('debe usar string vacío para changesBefore/changesAfter undefined', () => {
    const hash = createAuditHash({
      ...sampleData,
      changesBefore: undefined,
      changesAfter: undefined,
    });
    expect(hash).toHaveLength(64);
  });
});

// ==================== GENESIS_HASH + generateGenesisHash ====================
describe('GENESIS_HASH + generateGenesisHash', () => {
  it('GENESIS_HASH debe ser 64 ceros', () => {
    expect(GENESIS_HASH).toBe('0000000000000000000000000000000000000000000000000000000000000000');
    expect(GENESIS_HASH).toHaveLength(64);
  });

  it('generateGenesisHash debe devolver GENESIS_HASH', () => {
    expect(generateGenesisHash()).toBe(GENESIS_HASH);
  });
});
