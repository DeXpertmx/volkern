/**
 * Tests para `lib/insurance/connectors/gnp/`.
 *
 * Diferencia con `insurer-connector.test.ts` (que cubre Qualitas):
 *   - Qualitas es mono-ramo (AUTO only).
 *   - GNP es multi-ramo (AUTO + HOGAR + VIDA + SALUD + GASTOS_MEDICOS + EMPRESARIAL).
 *   Estos tests prueban que la interfaz `InsurerConnector` escala a multi-ramo.
 *
 * Estrategia:
 *   - Usamos la interfaz `InsurerConnector` para cargar GNP vía factory.
 *   - Mockeamos NADA — el connector mock está diseñado para ser determinístico.
 *   - Validamos los 4 métodos + metadata + factory wiring.
 *
 * Cobertura (~25 tests):
 *   factory:        4 tests  (resuelve 'gnp', rechaza desconocido, empty, lista)
 *   metadata:       4 tests  (slug, country/MXN, supportedRamos=6, isMock=true)
 *   authenticate:   2 tests  (rechaza empty, acepta con TTL)
 *   fetchPolicies:  7 tests  (sin filtros, clienteId, ramo=AUTO/HOGAR/VIDA/SALUD/GM/EMP, paginación, ramo no soportado)
 *   issuePolicy:    8 tests  (happy AUTO/HOGAR/VIDA/SALUD/GM/EMP, RFC inválido, moneda, ramo no soportado, sums≤0, fechas)
 *   submitClaim:    4 tests  (happy, not found, VENCIDA, monto > cobertura con sumaAsegurada>0)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getInsurerConnector,
  VALID_INSURER_SLUGS,
  ConnectorError,
  type InsurerConnector,
  type InsurerRam,
} from '@/lib/insurance/connectors/InsurerConnector';

// ─── Setup ──────────────────────────────────────────────────────────────────

let c: InsurerConnector;

beforeEach(async () => {
  c = await getInsurerConnector('gnp');
});

// ─── FACTORY ────────────────────────────────────────────────────────────────

describe('GNP — factory wiring', () => {
  it('getInsurerConnector("gnp") devuelve un connector con metadata.slug="gnp"', async () => {
    const conn = await getInsurerConnector('gnp');
    expect(conn.metadata.slug).toBe('gnp');
  });

  it('VALID_INSURER_SLUGS incluye "gnp"', () => {
    expect(VALID_INSURER_SLUGS).toContain('gnp');
  });

  it('lanza ConnectorError para slug desconocido', async () => {
    await expect(getInsurerConnector('mapfre')).rejects.toBeInstanceOf(ConnectorError);
  });

  it('rechaza slug vacío', async () => {
    await expect(getInsurerConnector('')).rejects.toThrow(/no implementado/i);
  });
});

// ─── METADATA ───────────────────────────────────────────────────────────────

describe('GNP — metadata', () => {
  it('country = MX, monedaBase = MXN', () => {
    expect(c.metadata.country).toBe('MX');
    expect(c.metadata.monedaBase).toBe('MXN');
  });

  it('isMock = true hasta Partner Engineering', () => {
    expect(c.metadata.isMock).toBe(true);
  });

  it('supportedRamos incluye los 6 ramos del plan (multi-ramo)', () => {
    const expected: InsurerRam[] = ['AUTO', 'HOGAR', 'VIDA', 'SALUD', 'GASTOS_MEDICOS', 'EMPRESARIAL'];
    for (const r of expected) {
      expect(c.metadata.supportedRamos).toContain(r);
    }
    // Diff estructural vs Quálitas: Quálitas tiene 1 ramo, GNP tiene 6.
    expect(c.metadata.supportedRamos.length).toBe(6);
  });

  it('capabilities incluye AUTH_API_KEY, POLICIES_LIST, POLICIES_ISSUE, CLAIMS_SUBMIT, CLAIMS_STATUS', () => {
    for (const cap of ['AUTH_API_KEY', 'POLICIES_LIST', 'POLICIES_ISSUE', 'CLAIMS_SUBMIT', 'CLAIMS_STATUS']) {
      expect(c.metadata.capabilities).toContain(cap);
    }
  });
});

// ─── AUTHENTICATE ───────────────────────────────────────────────────────────

describe('GNP — authenticate', () => {
  it('rechaza apiKey vacía', async () => {
    await expect(c.authenticate({ apiKey: '' })).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('acepta apiKey no-vacía y devuelve token con TTL de 1h', async () => {
    const r = await c.authenticate({ apiKey: 'agent-12345' });
    expect(r.token).toMatch(/^gnp-mock-token-/);
    const ttl = r.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
  });
});

// ─── FETCH POLICIES ─────────────────────────────────────────────────────────

describe('GNP — fetchPolicies', () => {
  it('lista todas las pólizas sin filtros (12 totales)', async () => {
    const r = await c.fetchPolicies({});
    expect(r.total).toBe(12);
    expect(r.policies.length).toBe(12);
    expect(r.page).toBe(1);
    expect(r.totalPages).toBe(1);
  });

  it('filtra por clienteId', async () => {
    const r = await c.fetchPolicies({ clienteId: 'cli-mx-102' });
    expect(r.total).toBe(2); // Laura tiene 2mock: 102 + 099 (VENCIDA)
    expect(r.policies.every((p) => p.clienteId === 'cli-mx-102')).toBe(true);
  });

  it('filtra por ramo=AUTO (4 pólizas)', async () => {
    const r = await c.fetchPolicies({ ramo: 'AUTO' });
    expect(r.total).toBe(4);
    expect(r.policies.every((p) => p.ramo === 'AUTO')).toBe(true);
  });

  it('filtra por ramo=HOGAR (2 pólizas)', async () => {
    const r = await c.fetchPolicies({ ramo: 'HOGAR' });
    expect(r.total).toBe(2);
    expect(r.policies.every((p) => p.ramo === 'HOGAR')).toBe(true);
  });

  it('filtra por ramo=VIDA (2 pólizas)', async () => {
    const r = await c.fetchPolicies({ ramo: 'VIDA' });
    expect(r.total).toBe(2);
  });

  it('filtra por ramo=SALUD (1 póliza)', async () => {
    const r = await c.fetchPolicies({ ramo: 'SALUD' });
    expect(r.total).toBe(1);
  });

  it('filtra por ramo=GASTOS_MEDICOS (1 póliza)', async () => {
    const r = await c.fetchPolicies({ ramo: 'GASTOS_MEDICOS' });
    expect(r.total).toBe(1);
  });

  it('filtra por ramo=EMPRESARIAL (2 pólizas)', async () => {
    const r = await c.fetchPolicies({ ramo: 'EMPRESARIAL' });
    expect(r.total).toBe(2);
  });

  it('rechaza ramo distinto con UNSUPPORTED_CAPABILITY', async () => {
    // GNP emite 6 ramos; INCENDIO y TRANSPORTE NO están en supportedRamos.
    await expect(c.fetchPolicies({ ramo: 'INCENDIO' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
    });
    await expect(c.fetchPolicies({ ramo: 'TRANSPORTE' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
    });
  });

  it('paginación correcta: page=1 limit=5 + page=2 limit=5 = 10 únicas', async () => {
    const p1 = await c.fetchPolicies({ page: 1, limit: 5 });
    const p2 = await c.fetchPolicies({ page: 2, limit: 5 });
    expect(p1.policies).toHaveLength(5);
    expect(p2.policies).toHaveLength(5);
    expect(p1.totalPages).toBe(3);
    const ids1 = new Set(p1.policies.map((p) => p.externalId));
    p2.policies.forEach((p) => expect(ids1.has(p.externalId)).toBe(false));
  });

  it('cliente + ramo combinados funcionan (intersección)', async () => {
    const r = await c.fetchPolicies({ clienteId: 'cli-mx-103', ramo: 'HOGAR' });
    expect(r.total).toBe(1);
    expect(r.policies[0].numeroPoliza).toContain('GNP-2024-201-HOGAR');
  });
});

// ─── ISSUE POLICY ───────────────────────────────────────────────────────────

const baseInput = {
  cliente: {
    nombre: 'Cliente Test',
    taxId: 'TVA050120KL9', // RFC válido persona moral 12 chars
    email: 'test@example.com',
  },
  producto: {
    ramo: 'AUTO' as InsurerRam,
    nombre: 'GNP Auto Más',
    externalProductId: 'gnp-auto-mas',
  },
  sumaAsegurada: 380000,
  primaAnual: 11800,
  fechaInicio: new Date('2026-09-01'),
  fechaVencimiento: new Date('2027-09-01'),
  moneda: 'MXN' as const,
};

describe('GNP — issuePolicy (happy paths multi-ramo)', () => {
  it('AUTO: emite correctamente con sufijo AUTO', async () => {
    const r = await c.issuePolicy({ ...baseInput });
    expect(r.numeroPoliza).toMatch(/^GNP-\d{4}-\d{3}-AUTO$/);
    expect(r.externalId).toMatch(/^gnp-pol-\d{4}-\d{3}$/);
  });

  it('HOGAR: emite con sufijo HOGAR', async () => {
    const r = await c.issuePolicy({
      ...baseInput,
      producto: { ...baseInput.producto, ramo: 'HOGAR', nombre: 'GNP Hogar Premium', externalProductId: 'gnp-hogar-premium' },
      sumaAsegurada: 4500000,
      primaAnual: 9500,
    });
    expect(r.numeroPoliza).toMatch(/^GNP-\d{4}-\d{3}-HOGAR$/);
  });

  it('VIDA: emite con sufijo VIDA', async () => {
    const r = await c.issuePolicy({
      ...baseInput,
      producto: { ...baseInput.producto, ramo: 'VIDA', nombre: 'GNP Vida Entera', externalProductId: 'gnp-vida-entera' },
      sumaAsegurada: 5000000,
      primaAnual: 12200,
    });
    expect(r.numeroPoliza).toMatch(/^GNP-\d{4}-\d{3}-VIDA$/);
  });

  it('SALUD: emite con sufijo SALUD (sumaAsegurada=0 aceptado porque no es requerido para salud)', async () => {
    const r = await c.issuePolicy({
      ...baseInput,
      producto: { ...baseInput.producto, ramo: 'SALUD', nombre: 'GNP Salud Familiar', externalProductId: 'gnp-salud-familiar' },
      sumaAsegurada: 0,
      primaAnual: 32000,
    });
    expect(r.numeroPoliza).toMatch(/^GNP-\d{4}-\d{3}-SALUD$/);
  });

  it('GASTOS_MEDICOS: emite con sufijo GM (mapping especial para nombres de archivo)', async () => {
    const r = await c.issuePolicy({
      ...baseInput,
      producto: { ...baseInput.producto, ramo: 'GASTOS_MEDICOS', nombre: 'GNP GM Elite Internacional', externalProductId: 'gnp-gm-elite' },
      sumaAsegurada: 0,
      primaAnual: 56000,
    });
    expect(r.numeroPoliza).toMatch(/^GNP-\d{4}-\d{3}-GM$/);
  });

  it('EMPRESARIAL: emite con sufijo EMP (mapping especial)', async () => {
    const r = await c.issuePolicy({
      ...baseInput,
      producto: { ...baseInput.producto, ramo: 'EMPRESARIAL', nombre: 'GNP Empresarial Plus', externalProductId: 'gnp-empresarial-plus' },
      sumaAsegurada: 22000000,
      primaAnual: 92000,
    });
    expect(r.numeroPoliza).toMatch(/^GNP-\d{4}-\d{3}-EMP$/);
  });
});

describe('GNP — issuePolicy (validaciones)', () => {
  it('RFC inválido → INVALID_TAX_ID', async () => {
    await expect(
      c.issuePolicy({ ...baseInput, cliente: { ...baseInput.cliente, taxId: 'X' } }),
    ).rejects.toMatchObject({ code: 'INVALID_TAX_ID' });
  });

  it('moneda != MXN → INVALID_INPUT', async () => {
    await expect(
      c.issuePolicy({ ...baseInput, moneda: 'USD' as any }),
    ).rejects.toThrow(/MXN/);
  });

  it('ramo no soportado → INVALID_RAMO', async () => {
    await expect(
      c.issuePolicy({
        ...baseInput,
        producto: { ...baseInput.producto, ramo: 'INCENDIO' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RAMO' });
  });

  it('sumaAsegurada = 0 → INVALID_INPUT', async () => {
    await expect(
      c.issuePolicy({ ...baseInput, sumaAsegurada: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('primaAnual negativa → INVALID_INPUT', async () => {
    await expect(
      c.issuePolicy({ ...baseInput, primaAnual: -1 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('fechaVencimiento anterior a fechaInicio → INVALID_INPUT', async () => {
    await expect(
      c.issuePolicy({
        ...baseInput,
        fechaInicio: new Date('2026-09-01'),
        fechaVencimiento: new Date('2025-01-01'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

// ─── SUBMIT CLAIM ───────────────────────────────────────────────────────────

describe('GNP — submitClaim', () => {
  it('happy path en póliza AUTO: abre expediente con SLA 48h e indemnización estimada', async () => {
    const r = await c.submitClaim({
      externalPolicyId: 'gnp-pol-2024-103', // AUTO Elite 720k, ACTIVA
      descripcion: 'Choque múltiple en estacionamiento',
      fechaSuceso: new Date('2026-07-01'),
      montoReclamado: 80000,
    });
    expect(r.externalClaimId).toMatch(/^GNP-CLM-\d{4}$/);
    expect(r.estado).toBe('RECIBIDO');
    expect(r.slaRespuestaHoras).toBe(48);
    expect(r.montoEstimadoIndemnizacion).toBeGreaterThan(0);
  });

  it('rechaza si la póliza no existe (POLICY_NOT_FOUND)', async () => {
    await expect(
      c.submitClaim({
        externalPolicyId: 'no-existe',
        descripcion: 'X',
        fechaSuceso: new Date(),
        montoReclamado: 1000,
      }),
    ).rejects.toMatchObject({ code: 'POLICY_NOT_FOUND' });
  });

  it('rechaza si la póliza está VENCIDA (POLICY_EXPIRED)', async () => {
    await expect(
      c.submitClaim({
        externalPolicyId: 'gnp-pol-2023-099', // AUTO VENCIDA
        descripcion: 'X',
        fechaSuceso: new Date(),
        montoReclamado: 1000,
      }),
    ).rejects.toMatchObject({ code: 'POLICY_EXPIRED' });
  });

  it('rechaza si montoReclamado > sumaAsegurada (CLAIM_AMOUNT_EXCEEDS_COVERAGE)', async () => {
    await expect(
      c.submitClaim({
        // gnp-pol-2024-103 (AUTO Elite) tiene sumaAsegurada=720000
        externalPolicyId: 'gnp-pol-2024-103',
        descripcion: 'X',
        fechaSuceso: new Date(),
        montoReclamado: 9999999,
      }),
    ).rejects.toMatchObject({ code: 'CLAIM_AMOUNT_EXCEEDS_COVERAGE' });
  });

  it('SALUD (sumaAsegurada=0): acepta montoReclamado arbitrariamente grande', async () => {
    // SALUD y GM no tienen "suma asegurada" al estilo AUTO/HOGAR.
    // El check de cobertura NO debe aplicar porque sumaAsegurada === 0.
    const r = await c.submitClaim({
      externalPolicyId: 'gnp-pol-2024-401', // SALUD, ACTIVA
      descripcion: 'Hospitalización',
      fechaSuceso: new Date('2026-07-01'),
      montoReclamado: 500000, // cualquiera
    });
    expect(r.estado).toBe('RECIBIDO');
  });
});
