import { describe, it, expect } from 'vitest';
import {
  createAuditHash,
  generateGenesisHash,
  GENESIS_HASH,
  type AuditHashInput,
} from '@/lib/audit-hash';

const baseInput: AuditHashInput = {
  tenantId: 'tenant-001',
  userId: 'user-abc',
  entity: 'lead',
  entityId: 'lead-123',
  action: 'UPDATE',
  description: 'Cambio de estado de nuevo a contactado',
  timestamp: new Date('2024-04-15T10:30:00.000Z'),
  previousHash: null,
};

describe('Audit Hash — createAuditHash', () => {
  describe('Determinismo', () => {
    it('debe generar el mismo hash para los mismos datos', () => {
      const h1 = createAuditHash(baseInput);
      const h2 = createAuditHash(baseInput);
      expect(h1).toBe(h2);
    });

    it('debe generar el mismo hash con la misma fecha (mismo timestamp)', () => {
      const h1 = createAuditHash(baseInput);
      const h2 = createAuditHash({
        ...baseInput,
        timestamp: new Date('2024-04-15T10:30:00.000Z'),
      });
      expect(h1).toBe(h2);
    });
  });

  describe('Formato del hash', () => {
    it('debe devolver un hash SHA-256 hexadecimal de 64 caracteres', () => {
      const hash = createAuditHash(baseInput);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('el hash debe ser lowercase (hex digest)', () => {
      const hash = createAuditHash(baseInput);
      expect(hash).toBe(hash.toLowerCase());
    });
  });

  describe('Sensibilidad a cambios', () => {
    it('debe cambiar si cambia el tenantId', () => {
      const h1 = createAuditHash(baseInput);
      const h2 = createAuditHash({ ...baseInput, tenantId: 'tenant-002' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el userId', () => {
      const h1 = createAuditHash(baseInput);
      const h2 = createAuditHash({ ...baseInput, userId: 'user-xyz' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia la entidad (entity)', () => {
      const h1 = createAuditHash(baseInput);
      const h2 = createAuditHash({ ...baseInput, entity: 'contact' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el entityId', () => {
      const h1 = createAuditHash(baseInput);
      const h2 = createAuditHash({ ...baseInput, entityId: 'lead-999' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia la acción', () => {
      const h1 = createAuditHash(baseInput);
      const h2 = createAuditHash({ ...baseInput, action: 'DELETE' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia la descripción', () => {
      const h1 = createAuditHash(baseInput);
      const h2 = createAuditHash({ ...baseInput, description: 'Otra descripción' });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el timestamp', () => {
      const h1 = createAuditHash(baseInput);
      const h2 = createAuditHash({
        ...baseInput,
        timestamp: new Date('2024-04-16T10:30:00.000Z'),
      });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el previousHash', () => {
      const h1 = createAuditHash(baseInput);
      const h2 = createAuditHash({ ...baseInput, previousHash: 'abc123' });
      expect(h1).not.toBe(h2);
    });
  });

  describe('previousHash nulo (genesis)', () => {
    it('debe usar GENESIS_HASH cuando previousHash es null', () => {
      const hash = createAuditHash({ ...baseInput, previousHash: null });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('el hash con previousHash null debe ser diferente del hash con previousHash explícito', () => {
      const h1 = createAuditHash({ ...baseInput, previousHash: null });
      const h2 = createAuditHash({ ...baseInput, previousHash: 'abc123' });
      expect(h1).not.toBe(h2);
    });
  });

  describe('Cadena de auditoría (encadenamiento)', () => {
    it('debe permitir encadenar entradas de auditoría', () => {
      const entry1 = createAuditHash({
        ...baseInput,
        action: 'CREATE',
        description: 'Lead creado',
        previousHash: null,
      });

      const entry2 = createAuditHash({
        ...baseInput,
        action: 'UPDATE',
        description: 'Lead actualizado',
        previousHash: entry1,
      });

      const entry3 = createAuditHash({
        ...baseInput,
        action: 'DELETE',
        description: 'Lead eliminado',
        previousHash: entry2,
      });

      // Los 3 hashes deben ser diferentes
      expect(entry1).not.toBe(entry2);
      expect(entry2).not.toBe(entry3);
      expect(entry1).not.toBe(entry3);

      // entry2 depende de entry1
      const entry2Alt = createAuditHash({
        ...baseInput,
        action: 'UPDATE',
        description: 'Lead actualizado',
        previousHash: 'hash_falsificado',
      });
      expect(entry2).not.toBe(entry2Alt);
    });
  });

  describe('changesBefore y changesAfter', () => {
    it('debe cambiar el hash si hay changesBefore', () => {
      const h1 = createAuditHash(baseInput);
      const h2 = createAuditHash({
        ...baseInput,
        changesBefore: { estado: 'nuevo' },
      });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar el hash si hay changesAfter', () => {
      const h1 = createAuditHash(baseInput);
      const h2 = createAuditHash({
        ...baseInput,
        changesAfter: { estado: 'contactado' },
      });
      expect(h1).not.toBe(h2);
    });

    it('changesBefore y changesAfter producen hashes diferentes', () => {
      const h1 = createAuditHash({
        ...baseInput,
        changesBefore: { estado: 'nuevo' },
        changesAfter: { estado: 'contactado' },
      });
      const h2 = createAuditHash({
        ...baseInput,
        changesBefore: { estado: 'contactado' },
        changesAfter: { estado: 'nuevo' },
      });
      expect(h1).not.toBe(h2);
    });

    it('debe manejar cambios anidados (objetos JSON)', () => {
      const hash = createAuditHash({
        ...baseInput,
        changesBefore: { lead: { nombre: 'Juan', tags: ['vip'] } },
        changesAfter: { lead: { nombre: 'Juan Pérez', tags: ['vip', 'urgente'] } },
      });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('userId null', () => {
    it('debe aceptar userId null', () => {
      const hash = createAuditHash({ ...baseInput, userId: null });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('userId null y string vacío se normalizan al mismo hash', () => {
      // El código usa data.userId || '' — ambos se convierten a ''
      const h1 = createAuditHash({ ...baseInput, userId: null });
      const h2 = createAuditHash({ ...baseInput, userId: '' });
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
      expect(h2).toMatch(/^[0-9a-f]{64}$/);
      expect(h1).toBe(h2);
    });
  });
});

describe('Audit Hash — GENESIS_HASH y generateGenesisHash', () => {
  it('GENESIS_HASH debe ser 64 ceros', () => {
    expect(GENESIS_HASH).toBe('0000000000000000000000000000000000000000000000000000000000000000');
  });

  it('generateGenesisHash debe devolver GENESIS_HASH', () => {
    expect(generateGenesisHash()).toBe(GENESIS_HASH);
  });
});
