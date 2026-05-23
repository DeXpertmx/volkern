import { describe, it, expect } from 'vitest';
import { generateComplaintHash, verifyComplaintIntegrity } from '@/lib/equality/security';

// ==================== generateComplaintHash ====================
describe('generateComplaintHash', () => {
  const sampleData = {
    description: 'Denuncia de prueba',
    tenantId: 'tenant-abc-123',
    createdAt: new Date('2025-06-15T10:00:00Z'),
  };

  it('debe generar un hash SHA-256 de 64 caracteres hex', () => {
    const hash = generateComplaintHash(sampleData);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('debe ser determinista para los mismos datos', () => {
    const hash1 = generateComplaintHash(sampleData);
    const hash2 = generateComplaintHash(sampleData);
    expect(hash1).toBe(hash2);
  });

  it('debe cambiar si cambia la descripción', () => {
    const modified = { ...sampleData, description: 'Otra denuncia' };
    expect(generateComplaintHash(modified)).not.toBe(generateComplaintHash(sampleData));
  });

  it('debe cambiar si cambia el tenantId', () => {
    const modified = { ...sampleData, tenantId: 'otro-tenant' };
    expect(generateComplaintHash(modified)).not.toBe(generateComplaintHash(sampleData));
  });

  it('debe cambiar si cambia createdAt', () => {
    const modified = { ...sampleData, createdAt: new Date('2025-06-16T10:00:00Z') };
    expect(generateComplaintHash(modified)).not.toBe(generateComplaintHash(sampleData));
  });

  it('debe generar hash válido para string vacío', () => {
    const hash = generateComplaintHash({
      description: '',
      tenantId: '',
      createdAt: new Date(0),
    });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('debe generar hash válido para caracteres especiales y unicode', () => {
    const hash = generateComplaintHash({
      description: '🚨 Denuncia con ñoño y símbolos !@#$%',
      tenantId: 'tenant-öü',
      createdAt: new Date(),
    });
    expect(hash).toHaveLength(64);
  });

  it('debe incluir createdAt como timestamp (getTime)', () => {
    const date1 = new Date('2025-06-15T10:00:00.000Z');
    const date2 = new Date('2025-06-15T10:00:00.001Z'); // 1ms después
    expect(generateComplaintHash({ ...sampleData, createdAt: date1 }))
      .not.toBe(generateComplaintHash({ ...sampleData, createdAt: date2 }));
  });
});

// ==================== verifyComplaintIntegrity ====================
describe('verifyComplaintIntegrity', () => {
  const validComplaint = {
    description: 'Denuncia íntegra',
    tenantId: 'tenant-xyz',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    hash: '', // se calcula abajo
  };
  validComplaint.hash = generateComplaintHash({
    description: validComplaint.description,
    tenantId: validComplaint.tenantId,
    createdAt: validComplaint.createdAt,
  });

  it('debe verificar integridad para denuncia no alterada', () => {
    expect(verifyComplaintIntegrity(validComplaint)).toBe(true);
  });

  it('debe detectar alteración en descripción', () => {
    const tampered = { ...validComplaint, description: 'Denuncia ALTERADA' };
    expect(verifyComplaintIntegrity(tampered)).toBe(false);
  });

  it('debe detectar alteración en tenantId', () => {
    const tampered = { ...validComplaint, tenantId: 'hacker-tenant' };
    expect(verifyComplaintIntegrity(tampered)).toBe(false);
  });

  it('debe detectar alteración en createdAt', () => {
    const tampered = { ...validComplaint, createdAt: new Date('2025-06-15T10:00:00Z') };
    expect(verifyComplaintIntegrity(tampered)).toBe(false);
  });

  it('debe detectar alteración en hash', () => {
    const tampered = { ...validComplaint, hash: '0'.repeat(64) };
    expect(verifyComplaintIntegrity(tampered)).toBe(false);
  });

  it('debe manejar descripción undefined', () => {
    const complaint = {
      description: undefined as unknown as string,
      tenantId: 't1',
      createdAt: new Date(),
      hash: 'anything',
    };
    // No debe lanzar error
    expect(() => verifyComplaintIntegrity(complaint)).not.toThrow();
    expect(typeof verifyComplaintIntegrity(complaint)).toBe('boolean');
  });
});
