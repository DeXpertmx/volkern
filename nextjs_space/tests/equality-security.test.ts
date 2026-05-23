import { describe, it, expect } from 'vitest';
import {
  generateComplaintHash,
  verifyComplaintIntegrity,
} from '@/lib/equality/security';

const baseData = {
  description: 'Acoso laboral por parte del supervisor en la reunión del lunes',
  tenantId: 'tenant-es-042',
  createdAt: new Date('2024-03-15T09:30:00.000Z'),
};

describe('Equality Security — generateComplaintHash', () => {
  describe('Formato del hash', () => {
    it('debe devolver un hash SHA-256 hexadecimal de 64 caracteres', () => {
      const hash = generateComplaintHash(baseData);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('el hash debe ser lowercase', () => {
      const hash = generateComplaintHash(baseData);
      expect(hash).toBe(hash.toLowerCase());
    });
  });

  describe('Determinismo', () => {
    it('debe generar el mismo hash para los mismos datos', () => {
      const h1 = generateComplaintHash(baseData);
      const h2 = generateComplaintHash(baseData);
      expect(h1).toBe(h2);
    });

    it('debe generar el mismo hash con la misma fecha (mismo timestamp)', () => {
      const h1 = generateComplaintHash(baseData);
      const h2 = generateComplaintHash({
        ...baseData,
        createdAt: new Date('2024-03-15T09:30:00.000Z'),
      });
      expect(h1).toBe(h2);
    });
  });

  describe('Sensibilidad a cambios', () => {
    it('debe cambiar si cambia la descripción', () => {
      const h1 = generateComplaintHash(baseData);
      const h2 = generateComplaintHash({
        ...baseData,
        description: 'Descripción diferente',
      });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia el tenantId', () => {
      const h1 = generateComplaintHash(baseData);
      const h2 = generateComplaintHash({
        ...baseData,
        tenantId: 'tenant-mx-099',
      });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia la fecha', () => {
      const h1 = generateComplaintHash(baseData);
      const h2 = generateComplaintHash({
        ...baseData,
        createdAt: new Date('2024-03-16T09:30:00.000Z'),
      });
      expect(h1).not.toBe(h2);
    });

    it('debe cambiar si cambia la hora (mismo día, distinta hora)', () => {
      const h1 = generateComplaintHash(baseData);
      const h2 = generateComplaintHash({
        ...baseData,
        createdAt: new Date('2024-03-15T14:00:00.000Z'),
      });
      expect(h1).not.toBe(h2);
    });

    it('debe ser sensible a un solo carácter de diferencia en descripción', () => {
      const h1 = generateComplaintHash(baseData);
      const h2 = generateComplaintHash({
        ...baseData,
        description: baseData.description + ' ',
      });
      expect(h1).not.toBe(h2);
    });

    it('debe ser sensible a mayúsculas/minúsculas en descripción', () => {
      const h1 = generateComplaintHash(baseData);
      const h2 = generateComplaintHash({
        ...baseData,
        description: baseData.description.toUpperCase(),
      });
      expect(h1).not.toBe(h2);
    });
  });

  describe('Descripciones con caracteres especiales', () => {
    it('debe manejar tildes y eñes', () => {
      const hash = generateComplaintHash({
        ...baseData,
        description: 'Año de acoso con mañana y dirección',
      });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('debe manejar saltos de línea en la descripción', () => {
      const hash = generateComplaintHash({
        ...baseData,
        description: 'Línea 1\nLínea 2\nLínea 3',
      });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('debe manejar caracteres Unicode (emojis)', () => {
      const hash = generateComplaintHash({
        ...baseData,
        description: 'Denuncia grave 🚨⚠️',
      });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('hash con emojis debe ser diferente del hash sin emojis', () => {
      const h1 = generateComplaintHash({
        ...baseData,
        description: 'Denuncia grave',
      });
      const h2 = generateComplaintHash({
        ...baseData,
        description: 'Denuncia grave 🚨',
      });
      expect(h1).not.toBe(h2);
    });

    it('debe manejar descripción vacía', () => {
      const hash = generateComplaintHash({
        ...baseData,
        description: '',
      });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});

describe('Equality Security — verifyComplaintIntegrity', () => {
  it('debe verificar true para una denuncia íntegra', () => {
    const hash = generateComplaintHash(baseData);
    const complaint = {
      description: baseData.description,
      tenantId: baseData.tenantId,
      createdAt: baseData.createdAt,
      hash,
    };
    expect(verifyComplaintIntegrity(complaint)).toBe(true);
  });

  it('debe verificar false si la descripción fue alterada', () => {
    const hash = generateComplaintHash(baseData);
    const complaint = {
      description: 'Descripción ALTERADA maliciosamente',
      tenantId: baseData.tenantId,
      createdAt: baseData.createdAt,
      hash,
    };
    expect(verifyComplaintIntegrity(complaint)).toBe(false);
  });

  it('debe verificar false si el tenantId fue alterado', () => {
    const hash = generateComplaintHash(baseData);
    const complaint = {
      description: baseData.description,
      tenantId: 'tenant-hackeado',
      createdAt: baseData.createdAt,
      hash,
    };
    expect(verifyComplaintIntegrity(complaint)).toBe(false);
  });

  it('debe verificar false si la fecha fue alterada', () => {
    const hash = generateComplaintHash(baseData);
    const complaint = {
      description: baseData.description,
      tenantId: baseData.tenantId,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      hash,
    };
    expect(verifyComplaintIntegrity(complaint)).toBe(false);
  });

  it('debe verificar false si el hash fue manipulado directamente', () => {
    const complaint = {
      description: baseData.description,
      tenantId: baseData.tenantId,
      createdAt: baseData.createdAt,
      hash: 'hash_falsificado_1234567890abcdef',
    };
    expect(verifyComplaintIntegrity(complaint)).toBe(false);
  });

  it('debe funcionar con denuncias de diferentes tenants', () => {
    const dataMX = { ...baseData, tenantId: 'tenant-mx-001' };
    const dataES = { ...baseData, tenantId: 'tenant-es-001' };

    const hashMX = generateComplaintHash(dataMX);
    const hashES = generateComplaintHash(dataES);

    expect(hashMX).not.toBe(hashES);

    expect(
      verifyComplaintIntegrity({
        description: dataMX.description,
        tenantId: dataMX.tenantId,
        createdAt: dataMX.createdAt,
        hash: hashMX,
      })
    ).toBe(true);
  });
});
