/**
 * Tests para `lib/insurance/connectors/tirea/`.
 *
 * Diferencia con `gnp-connector.test.ts` (México multi-ramo):
 *   - TIREA opera en España: moneda EUR (vs MXN), NIF/CIF/NIE (vs RFC).
 *   - TIREA es el operador del estándar de ficheros (no REST) — el mock
 *     demuestra que la interfaz `InsurerConnector` no se acopla al canal.
 *   - Todos sus ramos exigen capital asegurado numérico (GNP exime a
 *     SALUD/GASTOS_MEDICOS con sumaAsegurada=0).
 *
 * Estrategia:
 *   - Usamos la interfaz `InsurerConnector` para cargar TIREA vía factory.
 *   - Mockeamos NADA — el connector mock está diseñado para ser determinístico.
 *   - Validamos los 4 métodos + metadata + factory wiring.
 *
 * Cobertura (~27 tests):
 *   factory:        3 tests  (resuelve 'tirea', rechaza desconocido, empty)
 *   metadata:       4 tests  (slug, country/ES+EUR, supportedRamos=6, isMock=true)
 *   authenticate:   2 tests  (rechaza empty, acepta con TTL)
 *   fetchPolicies:  9 tests  (sin filtros, clienteId, ramo AUTO/HOGAR/VIDA/SALUD/RC/TRANS, paginación, combinado, ramo no soportado)
 *   issuePolicy:    9 tests  (happy AUTO/HOGAR/VIDA/SALUD/RC/TRANS, NIF inválido, moneda, ramo no soportado, sums≤0, fechas)
 *   submitClaim:    4 tests  (happy, not found, VENCIDA, monto > capital asegurado)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getInsurerConnector,
  VALID_INSURER_SLUGS,
  ConnectorError,
  validarTaxId,
  type InsurerConnector,
  type InsurerRam,
} from '@/lib/insurance/connectors/InsurerConnector';

// ─── Setup ──────────────────────────────────────────────────────────────────

let c: InsurerConnector;

beforeEach(async () => {
  c = await getInsurerConnector('tirea');
});

// ─── FACTORY ────────────────────────────────────────────────────────────────

describe('TIREA — factory wiring', () => {
  it('getInsurerConnector("tirea") devuelve un connector con metadata.slug="tirea"', async () => {
    const conn = await getInsurerConnector('tirea');
    expect(conn.metadata.slug).toBe('tirea');
  });

  it('lanza ConnectorError para slug desconocido', async () => {
    await expect(getInsurerConnector('mapfre')).rejects.toBeInstanceOf(ConnectorError);
  });

  it('rechaza slug vacío', async () => {
    await expect(getInsurerConnector('')).rejects.toThrow(/no implementado/i);
  });

  it('VALID_INSURER_SLUGS incluye "tirea"', () => {
    expect(VALID_INSURER_SLUGS).toContain('tirea');
  });
});

// ─── METADATA ───────────────────────────────────────────────────────────────

describe('TIREA — metadata', () => {
  it('country = ES, monedaBase = EUR', () => {
    expect(c.metadata.country).toBe('ES');
    expect(c.metadata.monedaBase).toBe('EUR');
  });

  it('isMock = true hasta Partner Engineering', () => {
    expect(c.metadata.isMock).toBe(true);
  });

  it('supportedRamos incluye los 6 ramos del mercado español', () => {
    const expected: InsurerRam[] = [
      'AUTO', 'HOGAR', 'VIDA', 'SALUD', 'RESPONSABILIDAD_CIVIL', 'TRANSPORTE',
    ];
    for (const r of expected) {
      expect(c.metadata.supportedRamos).toContain(r);
    }
    expect(c.metadata.supportedRamos.length).toBe(6);
  });

  it('capabilities incluye AUTH_API_KEY, POLICIES_LIST, POLICIES_ISSUE, CLAIMS_SUBMIT, CLAIMS_STATUS', () => {
    for (const cap of ['AUTH_API_KEY', 'POLICIES_LIST', 'POLICIES_ISSUE', 'CLAIMS_SUBMIT', 'CLAIMS_STATUS']) {
      expect(c.metadata.capabilities).toContain(cap);
    }
  });
});

// ─── AUTHENTICATE ───────────────────────────────────────────────────────────

describe('TIREA — authenticate', () => {
  it('rechaza apiKey vacía', async () => {
    await expect(c.authenticate({ apiKey: '' })).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('acepta apiKey no-vacía y devuelve token con TTL de 1h', async () => {
    const r = await c.authenticate({ apiKey: 'agente-12345' });
    expect(r.token).toMatch(/^tirea-mock-token-/);
    const ttl = r.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
  });
});

// ─── FETCH POLICIES ─────────────────────────────────────────────────────────

describe('TIREA — fetchPolicies', () => {
  it('lista todas las pólizas sin filtros (8 totales)', async () => {
    const r = await c.fetchPolicies({});
    expect(r.total).toBe(8);
    expect(r.policies.length).toBe(8);
    expect(r.page).toBe(1);
    expect(r.totalPages).toBe(1);
  });

  it('todas las pólizas son moneda EUR', async () => {
    const r = await c.fetchPolicies({});
    r.policies.forEach((p) => expect(p.moneda).toBe('EUR'));
  });

  it('filtra por clienteId', async () => {
    const r = await c.fetchPolicies({ clienteId: 'cli-es-002' });
    expect(r.total).toBe(2); // Marta: 001 (AUTO) + 003 (VIDA)
    expect(r.policies.every((p) => p.clienteId === 'cli-es-002')).toBe(true);
  });

  it('filtra por ramo=AUTO (2 pólizas)', async () => {
    const r = await c.fetchPolicies({ ramo: 'AUTO' });
    expect(r.total).toBe(2);
    expect(r.policies.every((p) => p.ramo === 'AUTO')).toBe(true);
  });

  it('filtra por ramo=HOGAR (2 pólizas)', async () => {
    const r = await c.fetchPolicies({ ramo: 'HOGAR' });
    expect(r.total).toBe(2);
  });

  it('filtra por ramo=VIDA (1 póliza)', async () => {
    const r = await c.fetchPolicies({ ramo: 'VIDA' });
    expect(r.total).toBe(1);
  });

  it('filtra por ramo=SALUD (1 póliza)', async () => {
    const r = await c.fetchPolicies({ ramo: 'SALUD' });
    expect(r.total).toBe(1);
  });

  it('filtra por ramo=RESPONSABILIDAD_CIVIL (1 póliza)', async () => {
    const r = await c.fetchPolicies({ ramo: 'RESPONSABILIDAD_CIVIL' });
    expect(r.total).toBe(1);
  });

  it('filtra por ramo=TRANSPORTE (1 póliza)', async () => {
    const r = await c.fetchPolicies({ ramo: 'TRANSPORTE' });
    expect(r.total).toBe(1);
  });

  it('rechaza ramo distinto con UNSUPPORTED_CAPABILITY', async () => {
    // INCENDIO y GASTOS_MEDICOS NO están en supportedRamos de TIREA.
    await expect(c.fetchPolicies({ ramo: 'INCENDIO' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
    });
    await expect(c.fetchPolicies({ ramo: 'GASTOS_MEDICOS' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
    });
  });

  it('paginación correcta: page=1 limit=3 + page=2 limit=3 = 6 únicas', async () => {
    const p1 = await c.fetchPolicies({ page: 1, limit: 3 });
    const p2 = await c.fetchPolicies({ page: 2, limit: 3 });
    expect(p1.policies).toHaveLength(3);
    expect(p2.policies).toHaveLength(3);
    expect(p1.totalPages).toBe(3);
    const ids1 = new Set(p1.policies.map((p) => p.externalId));
    p2.policies.forEach((p) => expect(ids1.has(p.externalId)).toBe(false));
  });

  it('cliente + ramo combinados funcionan (intersección)', async () => {
    const r = await c.fetchPolicies({ clienteId: 'cli-es-001', ramo: 'TRANSPORTE' });
    expect(r.total).toBe(1);
    expect(r.policies[0].numeroPoliza).toContain('TIREA-2024-006-ES-TRANS');
  });
});

// ─── ISSUE POLICY ───────────────────────────────────────────────────────────

const baseInput = {
  cliente: {
    nombre: 'Cliente Test',
    taxId: '45329018K', // NIF válido 8 dígitos + letra
    email: 'test@example.com',
  },
  producto: {
    ramo: 'AUTO' as InsurerRam,
    nombre: 'Auto TIREA Multirriesgo',
    externalProductId: 'tirea-auto-multirriesgo',
  },
  sumaAsegurada: 35000,
  primaAnual: 480,
  fechaInicio: new Date('2026-09-01'),
  fechaVencimiento: new Date('2027-09-01'),
  moneda: 'EUR' as const,
};

describe('TIREA — issuePolicy (happy paths multi-ramo)', () => {
  it('AUTO: emite correctamente con código AUTO', async () => {
    const r = await c.issuePolicy({ ...baseInput });
    expect(r.numeroPoliza).toMatch(/^TIREA-\d{4}-\d{3}-ES-AUTO$/);
    expect(r.externalId).toMatch(/^tirea-pol-\d{4}-\d{3}$/);
    expect(r.primaAnual).toBe(480);
    expect(r.documentoUrl).toMatch(/^https:\/\/api\.tirea\.es\/files\//);
  });

  it('HOGAR: emite con código HOGAR', async () => {
    const r = await c.issuePolicy({
      ...baseInput,
      producto: { ...baseInput.producto, ramo: 'HOGAR', nombre: 'Hogar TIREA Plus', externalProductId: 'tirea-hogar-plus' },
      sumaAsegurada: 300000,
      primaAnual: 235,
    });
    expect(r.numeroPoliza).toMatch(/^TIREA-\d{4}-\d{3}-ES-HOGAR$/);
  });

  it('VIDA: emite con código VIDA', async () => {
    const r = await c.issuePolicy({
      ...baseInput,
      producto: { ...baseInput.producto, ramo: 'VIDA', nombre: 'Vida TIREA Temporal 15', externalProductId: 'tirea-vida-temporal' },
      sumaAsegurada: 150000,
      primaAnual: 340,
    });
    expect(r.numeroPoliza).toMatch(/^TIREA-\d{4}-\d{3}-ES-VIDA$/);
  });

  it('SALUD: emite con código SALUD (a diferencia de GNP, TIREA exige capital numérico)', async () => {
    const r = await c.issuePolicy({
      ...baseInput,
      producto: { ...baseInput.producto, ramo: 'SALUD', nombre: 'Salud TIREA Completa', externalProductId: 'tirea-salud-completa' },
      sumaAsegurada: 200000,
      primaAnual: 1180,
    });
    expect(r.numeroPoliza).toMatch(/^TIREA-\d{4}-\d{3}-ES-SALUD$/);
  });

  it('RESPONSABILIDAD_CIVIL: emite con código RC (mapping corto)', async () => {
    const r = await c.issuePolicy({
      ...baseInput,
      producto: { ...baseInput.producto, ramo: 'RESPONSABILIDAD_CIVIL', nombre: 'RC Profesional TIREA', externalProductId: 'tirea-rc-profesional' },
      sumaAsegurada: 500000,
      primaAnual: 590,
    });
    expect(r.numeroPoliza).toMatch(/^TIREA-\d{4}-\d{3}-ES-RC$/);
  });

  it('TRANSPORTE: emite con código TRANS (mapping corto)', async () => {
    const r = await c.issuePolicy({
      ...baseInput,
      producto: { ...baseInput.producto, ramo: 'TRANSPORTE', nombre: 'Transporte TIREA Mercancías', externalProductId: 'tirea-transporte-mercancias' },
      sumaAsegurada: 180000,
      primaAnual: 1480,
    });
    expect(r.numeroPoliza).toMatch(/^TIREA-\d{4}-\d{3}-ES-TRANS$/);
  });
});

describe('TIREA — issuePolicy (validaciones)', () => {
  it('NIF/CIF inválido → INVALID_TAX_ID', async () => {
    await expect(
      c.issuePolicy({ ...baseInput, cliente: { ...baseInput.cliente, taxId: 'X' } }),
    ).rejects.toMatchObject({ code: 'INVALID_TAX_ID' });
  });

  it('acepta CIF y NIE en taxId (mercado español)', () => {
    expect(validarTaxId('ES', 'B62738101')).toBe(true); // CIF
    expect(validarTaxId('ES', 'X1234567A')).toBe(true); // NIE
  });

  it('moneda != EUR → INVALID_INPUT', async () => {
    await expect(
      c.issuePolicy({ ...baseInput, moneda: 'USD' as any }),
    ).rejects.toThrow(/EUR/);
  });

  it('ramo no soportado → INVALID_RAMO', async () => {
    await expect(
      c.issuePolicy({
        ...baseInput,
        producto: { ...baseInput.producto, ramo: 'INCENDIO' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RAMO' });
  });

  it('sumaAsegurada = 0 → INVALID_INPUT (todos los ramos exigen capital)', async () => {
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

describe('TIREA — submitClaim', () => {
  it('happy path en póliza AUTO: abre expediente con SLA 48h e indemnización estimada', async () => {
    const r = await c.submitClaim({
      externalPolicyId: 'tirea-pol-2024-007', // Auto Todo Riesgo 28k, ACTIVA
      descripcion: 'Colisión con turismo en rotonda',
      fechaSuceso: new Date('2026-07-01'),
      montoReclamado: 4000,
    });
    expect(r.externalClaimId).toMatch(/^TIREA-CLM-\d{4}$/);
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
        externalPolicyId: 'tirea-pol-2024-004', // SALUD VENCIDA
        descripcion: 'X',
        fechaSuceso: new Date(),
        montoReclamado: 1000,
      }),
    ).rejects.toMatchObject({ code: 'POLICY_EXPIRED' });
  });

  it('rechaza si montoReclamado > capital asegurado (CLAIM_AMOUNT_EXCEEDS_COVERAGE)', async () => {
    await expect(
      c.submitClaim({
        // tirea-pol-2024-001 (AUTO) tiene capital asegurado de 35000
        externalPolicyId: 'tirea-pol-2024-001',
        descripcion: 'X',
        fechaSuceso: new Date(),
        montoReclamado: 999999,
      }),
    ).rejects.toMatchObject({ code: 'CLAIM_AMOUNT_EXCEEDS_COVERAGE' });
  });
});
