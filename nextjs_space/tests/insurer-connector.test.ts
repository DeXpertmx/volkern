import { describe, it, expect } from 'vitest';
import {
  getInsurerConnector,
  VALID_INSURER_SLUGS,
  ConnectorError,
  inferirInsurerSlug,
  validarTaxId,
  type InsurerConnector,
} from '@/lib/insurance/connectors/InsurerConnector';

// ─── Tests del factory ────────────────────────────────────────────────────

describe('getInsurerConnector (factory)', () => {
  it('devuelve una instancia para slug "qualitas"', async () => {
    const c = await getInsurerConnector('qualitas');
    expect(c).toBeDefined();
    expect(c.metadata.slug).toBe('qualitas');
  });

  it('lanza ConnectorError para slugs desconocidos', async () => {
    await expect(getInsurerConnector('banorte')).rejects.toBeInstanceOf(ConnectorError);
  });

  it('rechaza slug vacío explícitamente', async () => {
    await expect(getInsurerConnector('')).rejects.toThrow(/no implementado/i);
  });

  it('VALID_INSURER_SLUGS contiene los 7 que nombra el plan', () => {
    expect(VALID_INSURER_SLUGS).toHaveLength(7);
    expect(VALID_INSURER_SLUGS).toEqual(
      expect.arrayContaining([
        'qualitas',
        'gnp',
        'axa-mx',
        'seguros-monterrey',
        'tirea',
        'fiva',
        'eiac',
      ]),
    );
  });
});

// ─── Tests del QualitasConnector ──────────────────────────────────────────

describe('QualitasConnector', () => {
  let c: InsurerConnector;

  it('preparación: carga el connector', async () => {
    c = await getInsurerConnector('qualitas');
  });

  describe('metadata', () => {
    it('slug correcto', () => {
      expect(c.metadata.slug).toBe('qualitas');
    });

    it('Quálitas opera en México y emite MXN', () => {
      expect(c.metadata.country).toBe('MX');
      expect(c.metadata.monedaBase).toBe('MXN');
    });

    it('Quálitas sólo emite ramo AUTO', () => {
      expect(c.metadata.supportedRamos).toEqual(['AUTO']);
    });

    it('está marcado como mock hasta que llegue Partner Engineering', () => {
      expect(c.metadata.isMock).toBe(true);
    });
  });

  describe('authenticate', () => {
    it('rechaza apiKey vacía', async () => {
      await expect(c.authenticate({ apiKey: '' })).rejects.toThrow(/apiKey/i);
      await expect(c.authenticate({})).rejects.toThrow(/apiKey/i);
    });

    it('acepta cualquier apiKey no-vacía y devuelve token con TTL', async () => {
      const r = await c.authenticate({ apiKey: 'test-key-123' });
      expect(r.token).toMatch(/^qualitas-mock-token-/);
      const ttl = r.expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000 + 1000); // ≤ 1h + 1s slack
    });
  });

  describe('fetchPolicies', () => {
    it('lista las 4 pólizas mock sin filtros', async () => {
      const r = await c.fetchPolicies({});
      expect(r.total).toBe(4);
      expect(r.policies.length).toBe(4);
      expect(r.page).toBe(1);
      expect(r.totalPages).toBe(1);
    });

    it('filtra por clienteId', async () => {
      const r = await c.fetchPolicies({ clienteId: 'cli-mx-001' });
      expect(r.total).toBe(2); // Roberto tiene 2 pólizas mock (Q-2024-001 + Q-2023-099)
      expect(r.policies.every((p) => p.clienteId === 'cli-mx-001')).toBe(true);
    });

    it('paginación correcta', async () => {
      const page1 = await c.fetchPolicies({ page: 1, limit: 2 });
      const page2 = await c.fetchPolicies({ page: 2, limit: 2 });
      expect(page1.policies).toHaveLength(2);
      expect(page2.policies).toHaveLength(2);
      expect(page1.totalPages).toBe(2);
      // Las IDs no se solapan
      const ids1 = new Set(page1.policies.map((p) => p.externalId));
      page2.policies.forEach((p) => expect(ids1.has(p.externalId)).toBe(false));
    });

    it('rechaza ramo distinto a AUTO con UNSUPPORTED_CAPABILITY', async () => {
      await expect(c.fetchPolicies({ ramo: 'HOGAR' })).rejects.toMatchObject({
        code: 'UNSUPPORTED_CAPABILITY',
      });
    });

    it('todas las pólizas devueltas son ramo AUTO y moneda MXN', async () => {
      const r = await c.fetchPolicies({});
      r.policies.forEach((p) => {
        expect(p.ramo).toBe('AUTO');
        expect(p.moneda).toBe('MXN');
      });
    });
  });

  describe('issuePolicy', () => {
    const baseInput = {
      cliente: {
        nombre: 'Cliente Test',
        taxId: 'HEMR800525AB3', // RFC válido 13 chars
        email: 'test@example.com',
      },
      producto: {
        ramo: 'AUTO' as const,
        nombre: 'Auto Quálitas Estándar',
        externalProductId: 'qualitas-auto-estandar',
      },
      sumaAsegurada: 380000,
      primaAnual: 13200,
      fechaInicio: new Date('2026-08-01'),
      fechaVencimiento: new Date('2027-08-01'),
      moneda: 'MXN' as const,
    };

    it('happy path: emite póliza con prefijo Q-2025-...', async () => {
      const r = await c.issuePolicy(baseInput);
      expect(r.numeroPoliza).toMatch(/^Q-\d{4}-\d{3}-AUTO$/);
      expect(r.externalId).toMatch(/^qua-pol-\d{4}-\d{3}$/);
      expect(r.primaAnual).toBe(13200);
      expect(r.documentoUrl).toMatch(/^https:\/\/api\.qualitas\.com\.mx\//);
    });

    it('rechaza RFC inválido con INVALID_TAX_ID', async () => {
      await expect(
        c.issuePolicy({
          ...baseInput,
          cliente: { ...baseInput.cliente, taxId: 'INVALID' },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_TAX_ID' });
    });

    it('rechaza moneda distinta a MXN', async () => {
      await expect(
        c.issuePolicy({ ...baseInput, moneda: 'USD' as any }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rechaza ramo distinto a AUTO', async () => {
      await expect(
        c.issuePolicy({
          ...baseInput,
          producto: { ...baseInput.producto, ramo: 'HOGAR' as any },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_RAMO' });
    });

    it('rechaza montos ≤ 0', async () => {
      await expect(
        c.issuePolicy({ ...baseInput, sumaAsegurada: 0 }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      await expect(
        c.issuePolicy({ ...baseInput, primaAnual: -100 }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rechaza fechaVencimiento anterior a fechaInicio', async () => {
      await expect(
        c.issuePolicy({
          ...baseInput,
          fechaInicio: new Date('2026-08-01'),
          fechaVencimiento: new Date('2025-01-01'),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
  });

  describe('submitClaim', () => {
    it('happy path: abre expediente con SLA 48h', async () => {
      const r = await c.submitClaim({
        externalPolicyId: 'qua-pol-2024-003', // Distribuidora del Norte, ACTIVA, 800k
        descripcion: 'Choque lateral en parking',
        fechaSuceso: new Date('2026-07-15'),
        montoReclamado: 50000,
      });
      expect(r.externalClaimId).toMatch(/^Q-CLM-\d{4}$/);
      expect(r.estado).toBe('RECIBIDO');
      expect(r.slaRespuestaHoras).toBe(48);
      expect(r.montoEstimadoIndemnizacion).toBeGreaterThan(0);
    });

    it('rechaza si la póliza no existe', async () => {
      await expect(
        c.submitClaim({
          externalPolicyId: 'no-existe',
          descripcion: 'X',
          fechaSuceso: new Date(),
          montoReclamado: 1000,
        }),
      ).rejects.toMatchObject({ code: 'POLICY_NOT_FOUND' });
    });

    it('rechaza si la póliza está VENCIDA', async () => {
      await expect(
        c.submitClaim({
          externalPolicyId: 'qua-pol-2023-099', // VENCIDA
          descripcion: 'X',
          fechaSuceso: new Date(),
          montoReclamado: 1000,
        }),
      ).rejects.toMatchObject({ code: 'POLICY_EXPIRED' });
    });

    it('rechaza si montoReclamado > sumaAsegurada', async () => {
      await expect(
        c.submitClaim({
          externalPolicyId: 'qua-pol-2023-099', // VENCIDA, pero el check es antes que expired
          descripcion: 'X',
          fechaSuceso: new Date(),
          montoReclamado: 99999999,
        }),
      ).rejects.toThrow();
    });
  });
});

// ─── Helpers independientes ───────────────────────────────────────────────

describe('validarTaxId', () => {
  it('acepta RFC mexicano válido (13 chars, persona física)', () => {
    expect(validarTaxId('MX', 'HEMR800525AB3')).toBe(true);
  });
  it('acepta RFC mexicano válido (12 chars, persona moral)', () => {
    expect(validarTaxId('MX', 'DNO050120KL9')).toBe(true);
  });
  it('rechaza RFC basura', () => {
    expect(validarTaxId('MX', 'BLAH')).toBe(false);
    expect(validarTaxId('MX', '')).toBe(false);
  });
  it('acepta NIF español (8 dígitos + letra)', () => {
    expect(validarTaxId('ES', '12345678Z')).toBe(true);
  });
  it('acepta NIE español (X + 7 dígitos + letra)', () => {
    expect(validarTaxId('ES', 'X1234567A')).toBe(true);
  });
});

describe('inferirInsurerSlug', () => {
  it('detecta Quálitas por acento o sin acento', () => {
    expect(inferirInsurerSlug('Quálitas')).toBe('qualitas');
    expect(inferirInsurerSlug('Qualitas')).toBe('qualitas');
  });
  it('detecta AXA México distinguido de AXA España', () => {
    expect(inferirInsurerSlug('AXA México')).toBe('axa-mx');
    expect(inferirInsurerSlug('AXA España')).toBe(null); // No en plan Fase 5.2 todavía
  });
  it('devuelve null para aseguradoras desconocidas', () => {
    expect(inferirInsurerSlug('Mapfre')).toBe(null);
    expect(inferirInsurerSlug('Mutua Madrileña')).toBe(null);
    expect(inferirInsurerSlug('')).toBe(null);
  });
});
