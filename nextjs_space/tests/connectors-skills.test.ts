/**
 * Tests para `lib/insurance/connectors-skills.ts`.
 *
 * Estrategia:
 *   - Mockear Prisma completo (los 5 modelos que la skill toca).
 *   - Mockear `getInsurerConnector` para devolver un QualitasMock fake
 *     sin tocar la implementación real (aislamiento + determinismo).
 *
 * Cobertura:
 *   sync_cartera_desde_aseguradora
 *     1. happy path: 3 ExternalPolicies → 3 creados
 *     2. dryRun: no escribe, marca accion='dry-run'
 *     3. existente sin actualizarExistentes → skipped
 *     4. existente con actualizarExistentes → updated, no skip
 *     5. cliente no encontrado → error CLIENT_NOT_FOUND
 *     6. 0 pólizas del partner → mensaje neutral, sin throws
 *     7. Aseguradora interna se crea si no existe (codigoExterno=slug)
 *     8. ProductoSeguro se crea si no existe
 *     9. mapeo de estado: ACTIVA, PROXIMA_A_VENCER, VENCIDA, CANCELADA, EN_TRAMITE
 *    10. notas con prefijo `[Sync ${slug}]`
 *
 *   emitir_poliza_en_aseguradora
 *     1. happy path: Poliza → issuePolicy → notas con [doc:URL]
 *     2. dryRun: polizaId estable, accion='dry-run', no DB write
 *     3. Poliza no encontrada → error
 *     4. cliente sin RFC (México) → error con mensaje
 *     5. sumaAsegurada<=0 o primaAnual<=0 → error
 *     6. ConnectorError del backend → propaga sin tragar
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock Prisma (vi.hoisted para evitar ReferenceError por hoisting) ──────

const {
  polizaFindUnique,
  polizaFindFirst,
  polizaCreate,
  polizaUpdate,
  contactFindUnique,
  contactFindFirst,
  contactFindMany,
  productoSeguroFindFirst,
  productoSeguroCreate,
  aseguradoraFindFirst,
  aseguradoraCreate,
  aseguradoraUpdate,
  userFindFirst,
} = vi.hoisted(() => ({
  polizaFindUnique: vi.fn(),
  polizaFindFirst: vi.fn(),
  polizaCreate: vi.fn(),
  polizaUpdate: vi.fn(),
  contactFindUnique: vi.fn(),
  contactFindFirst: vi.fn(),
  contactFindMany: vi.fn(),
  productoSeguroFindFirst: vi.fn(),
  productoSeguroCreate: vi.fn(),
  aseguradoraFindFirst: vi.fn(),
  aseguradoraCreate: vi.fn(),
  aseguradoraUpdate: vi.fn(),
  userFindFirst: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    poliza: {
      findUnique: polizaFindUnique,
      findFirst: polizaFindFirst,
      create: polizaCreate,
      update: polizaUpdate,
    },
    contact: {
      findUnique: contactFindUnique,
      findFirst: contactFindFirst,
      findMany: contactFindMany,
    },
    productoSeguro: {
      findFirst: productoSeguroFindFirst,
      create: productoSeguroCreate,
    },
    aseguradora: {
      findFirst: aseguradoraFindFirst,
      create: aseguradoraCreate,
      update: aseguradoraUpdate,
    },
    user: {
      findFirst: userFindFirst,
    },
  },
}));

// ─── Mock InsurerConnector factory ──────────────────────────────────────────

const {
  mockFetchPolicies,
  mockIssuePolicy,
  mockAuthenticate,
} = vi.hoisted(() => ({
  mockFetchPolicies: vi.fn(),
  mockIssuePolicy: vi.fn(),
  mockAuthenticate: vi.fn(),
}));

vi.mock('@/lib/insurance/connectors/InsurerConnector', () => {
  return {
    getInsurerConnector: vi.fn(async () => ({
      metadata: {
        slug: 'qualitas',
        nombre: 'Quálitas Compañía de Seguros, S.A. de C.V.',
        country: 'MX',
        regulatoryId: 'CNSF-S0098-0314-2000',
        website: 'https://www.qualitas.com.mx',
        monedaBase: 'MXN',
        supportedRamos: ['AUTO'],
        capabilities: ['AUTH_API_KEY', 'POLICIES_LIST', 'POLICIES_ISSUE', 'CLAIMS_SUBMIT'],
        isMock: true,
      },
      authenticate: mockAuthenticate,
      fetchPolicies: mockFetchPolicies,
      issuePolicy: mockIssuePolicy,
      submitClaim: vi.fn(),
    })),
    ConnectorError: class ConnectorError extends Error {
      code: string;
      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    },
  };
});

// ─── Imports (después de los mocks) ───────────────────────────────────────

import {
  sync_cartera_desde_aseguradora,
  emitir_poliza_en_aseguradora,
} from '@/lib/insurance/connectors-skills';
import { getInsurerConnector, ConnectorError } from '@/lib/insurance/connectors/InsurerConnector';

// ─── Reset global por test ─────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Defaults razonables: authenticate siempre ok
  mockAuthenticate.mockResolvedValue({
    token: 'qualitas-mock-token-xyz',
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  // Defaults: tenant tiene usuario
  userFindFirst.mockResolvedValue({ id: 'USER_ID' });

  // Defaults: contact findFirst devuelve null (= hay que crear)
  contactFindFirst.mockResolvedValue(null);
  contactFindUnique.mockResolvedValue(null);

  // Defaults: product / aseguradora no existen → se crean
  productoSeguroFindFirst.mockResolvedValue(null);
  productoSeguroCreate.mockImplementation(({ data }) =>
    Promise.resolve({ id: 'PROD_NEW_ID', nombre: data.nombre, ramo: data.ramo }),
  );

  aseguradoraFindFirst.mockResolvedValue(null);
  aseguradoraCreate.mockImplementation(({ data }) =>
    Promise.resolve({ id: 'ASE_NEW_ID', nombre: data.nombre, codigoExterno: data.codigoExterno }),
  );
  aseguradoraUpdate.mockImplementation(({ data }) =>
    Promise.resolve({ id: 'ASE_NEW_ID', ...data }),
  );

  // Defaults: poliza no existe → se crea
  polizaFindUnique.mockResolvedValue(null);
  polizaFindFirst.mockResolvedValue(null);
  polizaCreate.mockImplementation(({ data }) =>
    Promise.resolve({
      id: 'POL_NEW_ID',
      ...data,
    }),
  );
  polizaUpdate.mockImplementation(({ where, data }) =>
    Promise.resolve({ id: where.tenantId_numeroPoliza?.numeroPoliza ?? 'POL_UPD', ...data }),
  );

  // Defaults: contact findMany (resolver cliente) devuelve nuestro contacto base
  contactFindMany.mockImplementation(({ where }) => {
    const nombre = where?.nombre?.contains;
    if (nombre?.toLowerCase().includes('roberto')) {
      return Promise.resolve([{ id: 'CONT_ROBERTO', nombre: 'Roberto Hernández Mendoza' }]);
    }
    return Promise.resolve([]);
  });
});

// ─── FIXTURES ─────────────────────────────────────────────────────────────

const TENANT = 'TENANT_001';
const USER = 'USER_ID';

function externalPolicy(over: any = {}) {
  return {
    externalId: 'qua-pol-2024-001',
    numeroPoliza: 'Q-2024-001-AUTO',
    clienteId: 'cli-mx-001',
    clienteNombre: 'Roberto Hernández Mendoza',
    ramo: 'AUTO',
    productoNombre: 'Auto Quálitas Estándar',
    sumaAsegurada: 380000,
    primaAnual: 13200,
    moneda: 'MXN',
    fechaInicio: new Date('2024-08-01'),
    fechaVencimiento: new Date('2026-08-01'),
    estado: 'PROXIMA_A_VENCER',
    documentoUrl: 'https://api.qualitas.com.mx/policies/Q-2024-001-AUTO.pdf',
    ...over,
  };
}

// ════════════════════════════════════════════════════════════════════════
// sync_cartera_desde_aseguradora
// ════════════════════════════════════════════════════════════════════════

describe('sync_cartera_desde_aseguradora', () => {
  describe('validaciones tempranas', () => {
    it('lanza si slug falta', async () => {
      await expect(
        sync_cartera_desde_aseguradora({ slug: '', tenantId: TENANT } as any),
      ).rejects.toThrow(/slug.*requerido/);
    });
    it('lanza si tenantId falta', async () => {
      await expect(
        sync_cartera_desde_aseguradora({ slug: 'qualitas', tenantId: '' } as any),
      ).rejects.toThrow(/tenantId.*requerido/);
    });
  });

  describe('happy path', () => {
    beforeEach(() => {
      mockFetchPolicies.mockResolvedValue({
        policies: [
          externalPolicy(),
          externalPolicy({ externalId: 'qua-pol-2024-002', numeroPoliza: 'Q-2024-002-AUTO', clienteNombre: 'Roberto Hernández Mendoza' }),
          externalPolicy({ externalId: 'qua-pol-2024-003', numeroPoliza: 'Q-2024-003-AUTO', clienteNombre: 'Roberto Hernández Mendoza' }),
        ],
        total: 3,
        page: 1,
        totalPages: 1,
      });
    });

    it('importa 3 pólizas nuevas → created=3, skipped=0, errors=0', async () => {
      const r = await sync_cartera_desde_aseguradora({ slug: 'qualitas', tenantId: TENANT });

      expect(r.summary.created).toBe(3);
      expect(r.summary.skipped).toBe(0);
      expect(r.summary.errors).toBe(0);
      expect(r.totalEnPartner).toBe(3);
      expect(r.processed.every((p) => p.accion === 'created')).toBe(true);
      expect(r.errors).toEqual([]);
    });

    it('llama prisma.poliza.create N veces', async () => {
      await sync_cartera_desde_aseguradora({ slug: 'qualitas', tenantId: TENANT });
      expect(polizaCreate).toHaveBeenCalledTimes(3);
    });

    it('mapea estado PROXIMA_A_VENCER correctamente', async () => {
      const r = await sync_cartera_desde_aseguradora({ slug: 'qualitas', tenantId: TENANT });
      expect(r.processed[0].estado).toBe('PROXIMA_A_VENCER');
    });

    it('construye notas con prefijo [Sync qualitas YYYY-MM-DD] + documentoUrl', async () => {
      await sync_cartera_desde_aseguradora({ slug: 'qualitas', tenantId: TENANT });
      const createCall = polizaCreate.mock.calls[0][0];
      expect(createCall.data.notas).toMatch(/\[Sync qualitas \d{4}-\d{2}-\d{2}\]/);
      expect(createCall.data.notas).toContain('Documento: https://api.qualitas.com.mx');
    });

    it('pasa page y limit al connector', async () => {
      await sync_cartera_desde_aseguradora({
        slug: 'qualitas',
        tenantId: TENANT,
        page: 2,
        limit: 25,
      });
      expect(mockFetchPolicies).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: 25 }),
      );
    });

    it('autentica contra el connector antes de fetchPolicies', async () => {
      const order: string[] = [];
      mockAuthenticate.mockImplementation(() => {
        order.push('auth');
        return Promise.resolve({ token: 't', expiresAt: new Date() });
      });
      mockFetchPolicies.mockImplementation(() => {
        order.push('fetch');
        return Promise.resolve({ policies: [], total: 0, page: 1, totalPages: 0 });
      });
      await sync_cartera_desde_aseguradora({ slug: 'qualitas', tenantId: TENANT });
      expect(order).toEqual(['auth', 'fetch']);
    });
  });

  describe('dryRun', () => {
    it('NO escribe en BD pero reporta "would create"', async () => {
      mockFetchPolicies.mockResolvedValue({
        policies: [externalPolicy(), externalPolicy({ numeroPoliza: 'Q-2024-002-AUTO' })],
        total: 2,
        page: 1,
        totalPages: 1,
      });
      const r = await sync_cartera_desde_aseguradora({
        slug: 'qualitas',
        tenantId: TENANT,
        dryRun: true,
      });
      expect(polizaCreate).not.toHaveBeenCalled();
      expect(polizaUpdate).not.toHaveBeenCalled();
      expect(r.summary.created).toBe(0);
      expect(r.summary.dryRun).toBe(true);
      expect(r.processed.every((p) => p.accion === 'dry-run')).toBe(true);
      expect(r.mensaje).toMatch(/dry-run/i);
    });

    it('en dryRun + actualizarExistentes sigue sin escribir en BD', async () => {
      polizaFindUnique.mockResolvedValue({ id: 'POL_EXISTING' });
      mockFetchPolicies.mockResolvedValue({
        policies: [externalPolicy()],
        total: 1,
        page: 1,
        totalPages: 1,
      });
      await sync_cartera_desde_aseguradora({
        slug: 'qualitas',
        tenantId: TENANT,
        dryRun: true,
        actualizarExistentes: true,
      });
      expect(polizaUpdate).not.toHaveBeenCalled();
    });
  });

  describe('idempotencia', () => {
    it('existentes sin actualizarExistentes → skipped', async () => {
      polizaFindUnique.mockResolvedValue({ id: 'POL_EXISTING' });
      mockFetchPolicies.mockResolvedValue({
        policies: [externalPolicy()],
        total: 1,
        page: 1,
        totalPages: 1,
      });
      const r = await sync_cartera_desde_aseguradora({
        slug: 'qualitas',
        tenantId: TENANT,
      });
      expect(r.summary.created).toBe(0);
      expect(r.summary.skipped).toBe(1);
      expect(r.processed[0]).toMatchObject({
        accion: 'skipped',
        polizaId: 'POL_EXISTING',
      });
      expect(polizaCreate).not.toHaveBeenCalled();
    });

    it('existentes con actualizarExistentes → updated', async () => {
      polizaFindUnique.mockResolvedValue({ id: 'POL_EXISTING' });
      mockFetchPolicies.mockResolvedValue({
        policies: [externalPolicy()],
        total: 1,
        page: 1,
        totalPages: 1,
      });
      const r = await sync_cartera_desde_aseguradora({
        slug: 'qualitas',
        tenantId: TENANT,
        actualizarExistentes: true,
      });
      expect(r.summary.updated).toBe(1);
      expect(r.summary.skipped).toBe(0);
      expect(r.processed[0].accion).toBe('updated');
      expect(polizaUpdate).toHaveBeenCalledTimes(1);
      expect(polizaCreate).not.toHaveBeenCalled();
    });
  });

  describe('resolución de cliente / producto / aseguradora', () => {
    beforeEach(() => {
      mockFetchPolicies.mockResolvedValue({
        policies: [externalPolicy()],
        total: 1,
        page: 1,
        totalPages: 1,
      });
    });

    it('asegura que la aseguradora interna tenga codigoExterno=slug', async () => {
      await sync_cartera_desde_aseguradora({ slug: 'qualitas', tenantId: TENANT });
      // Crear 1 vez: la aseguradora (ASEG_ID se crea porque findFirst retorna null)
      expect(aseguradoraCreate).toHaveBeenCalledTimes(1);
      expect(aseguradoraCreate.mock.calls[0][0].data.codigoExterno).toBe('qualitas');
    });

    it('asegura producto interno con ramo=external.ramo', async () => {
      await sync_cartera_desde_aseguradora({ slug: 'qualitas', tenantId: TENANT });
      const createCall = productoSeguroCreate.mock.calls[0][0];
      expect(createCall.data.ramo).toBe('AUTO');
      expect(createCall.data.nombre).toContain('Quálitas Estándar');
    });

    it('cliente no encontrado → error CLIENT_NOT_FOUND', async () => {
      contactFindMany.mockResolvedValueOnce([]); // ningún match por nombre
      const r = await sync_cartera_desde_aseguradora({
        slug: 'qualitas',
        tenantId: TENANT,
      });
      expect(r.summary.created).toBe(0);
      expect(r.summary.errors).toBe(1);
      expect(r.errors[0]).toMatchObject({
        code: 'CLIENT_NOT_FOUND',
        numeroPoliza: 'Q-2024-001-AUTO',
      });
    });

    it('cliente match se enlaza por ID', async () => {
      await sync_cartera_desde_aseguradora({ slug: 'qualitas', tenantId: TENANT });
      const createCall = polizaCreate.mock.calls[0][0];
      expect(createCall.data.clienteId).toBe('CONT_ROBERTO');
    });
  });

  describe('mapeo de estados externos → internos', () => {
    const mapeos: Array<[string, string]> = [
      ['ACTIVA', 'ACTIVA'],
      ['PROXIMA_A_VENCER', 'PROXIMA_A_VENCER'],
      ['VENCIDA', 'VENCIDA'],
      ['CANCELADA', 'CANCELADA'],
      ['EN_TRAMITE', 'EN_TRAMITE'],
    ];

    it.each(mapeos)('externo %s → interno %s', async (ext, int) => {
      mockFetchPolicies.mockResolvedValue({
        policies: [externalPolicy({ estado: ext })],
        total: 1,
        page: 1,
        totalPages: 1,
      });
      const r = await sync_cartera_desde_aseguradora({ slug: 'qualitas', tenantId: TENANT });
      expect(r.processed[0].estado).toBe(int);
    });
  });

  describe('casos neutros', () => {
    it('0 pólizas del partner → mensaje neutral, sin throws', async () => {
      mockFetchPolicies.mockResolvedValue({
        policies: [],
        total: 0,
        page: 1,
        totalPages: 0,
      });
      const r = await sync_cartera_desde_aseguradora({ slug: 'qualitas', tenantId: TENANT });
      expect(r.summary.created).toBe(0);
      expect(r.processed).toEqual([]);
      expect(r.mensaje).toMatch(/No se encontraron.*qualitas/);
      expect(polizaCreate).not.toHaveBeenCalled();
    });

    it('all errors y 0 creates → mensaje de error', async () => {
      mockFetchPolicies.mockResolvedValue({
        policies: [
          externalPolicy(),
          externalPolicy({ numeroPoliza: 'Q-2024-002-AUTO' }),
        ],
        total: 2,
        page: 1,
        totalPages: 1,
      });
      contactFindMany.mockReset();
      contactFindMany.mockResolvedValue([]); // ambos fallan match
      const r = await sync_cartera_desde_aseguradora({ slug: 'qualitas', tenantId: TENANT });
      expect(r.summary.errors).toBe(2);
      expect(r.mensaje).toMatch(/❌.*0 procesadas.*2 con error/);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// emitir_poliza_en_aseguradora
// ════════════════════════════════════════════════════════════════════════

function polizaMock(over: any = {}) {
  return {
    id: 'POL_INTERNAL_ID',
    tenantId: TENANT,
    numeroPoliza: 'Q-2024-001-AUTO-INT',
    fechaInicio: new Date('2026-09-01'),
    fechaVencimiento: new Date('2027-09-01'),
    primaAnual: 13200,
    sumaAsegurada: 380000,
    moneda: 'MXN',
    notas: 'notas previas',
    cliente: {
      id: 'CONT_ROBERTO',
      nombre: 'Roberto Hernández Mendoza',
      email: 'roberto@example.com',
      telefono: '+52 55 1234 5678',
      direccion: 'Av Reforma 123',
      customerFiscalData: {
        rfc: 'HEMR800525AB3',
        stripeTaxId: null,
      },
    },
    productoSeguro: {
      id: 'PROD_Q_ESTANDAR',
      nombre: 'Auto Quálitas Estándar',
      ramo: 'AUTO',
    },
    aseguradora: {
      id: 'ASE_QUALITAS',
      nombre: 'Quálitas Compañía de Seguros, S.A. de C.V.',
    },
    ...over,
  };
}

describe('emitir_poliza_en_aseguradora', () => {
  describe('validaciones tempranas', () => {
    it('lanza si slug falta', async () => {
      await expect(
        emitir_poliza_en_aseguradora({ slug: '', tenantId: TENANT, polizaId: 'P' }),
      ).rejects.toThrow(/slug.*requerido/);
    });
    it('lanza si tenantId falta', async () => {
      await expect(
        emitir_poliza_en_aseguradora({ slug: 'qualitas', tenantId: '', polizaId: 'P' }),
      ).rejects.toThrow(/tenantId.*requerido/);
    });
    it('lanza si polizaId falta', async () => {
      await expect(
        emitir_poliza_en_aseguradora({ slug: 'qualitas', tenantId: TENANT, polizaId: '' }),
      ).rejects.toThrow(/polizaId.*requerido/);
    });
  });

  describe('happy path', () => {
    it('emite y guarda [doc:URL] en notas', async () => {
      polizaFindFirst.mockResolvedValue(polizaMock());
      mockIssuePolicy.mockResolvedValue({
        externalId: 'qua-pol-2025-XXX',
        numeroPoliza: 'Q-2025-XXX-AUTO',
        primaAnual: 13200,
        emision: 1,
        documentoUrl: 'https://api.qualitas.com.mx/policies/Q-2025-XXX-AUTO.pdf',
        mensaje: 'Póliza emitida por Quálitas',
      });

      const r = await emitir_poliza_en_aseguradora({
        slug: 'qualitas',
        tenantId: TENANT,
        polizaId: 'POL_INTERNAL_ID',
      });

      expect(r.accion).toBe('issued');
      expect(r.numeroPolizaPartner).toBe('Q-2025-XXX-AUTO');
      expect(r.documentoUrl).toBe('https://api.qualitas.com.mx/policies/Q-2025-XXX-AUTO.pdf');
      expect(r.mensaje).toMatch(/emitida/);

      // Notas actualizadas con [doc:URL] preservando notas previas
      expect(polizaUpdate).toHaveBeenCalledTimes(1);
      const updateData = polizaUpdate.mock.calls[0][0].data;
      expect(updateData.notas).toContain('notas previas');
      expect(updateData.notas).toContain('[doc:https://api.qualitas.com.mx/policies/Q-2025-XXX-AUTO.pdf]');
    });

    it('mapea correctamente los campos al IssuePolicyInput', async () => {
      polizaFindFirst.mockResolvedValue(polizaMock());
      mockIssuePolicy.mockResolvedValue({
        externalId: 'x', numeroPoliza: 'Q-1-AUTO', primaAnual: 13200, emision: 1,
        documentoUrl: 'https://x', mensaje: 'ok',
      });

      await emitir_poliza_en_aseguradora({
        slug: 'qualitas',
        tenantId: TENANT,
        polizaId: 'POL_INTERNAL_ID',
      });

      expect(mockIssuePolicy).toHaveBeenCalledTimes(1);
      const input = mockIssuePolicy.mock.calls[0][0];
      expect(input.cliente.taxId).toBe('HEMR800525AB3');
      expect(input.moneda).toBe('MXN');
      expect(input.producto.ramo).toBe('AUTO');
      expect(input.sumaAsegurada).toBe(380000);
      expect(input.primaAnual).toBe(13200);
    });

    it('dryRun=true → no escribe en BD', async () => {
      polizaFindFirst.mockResolvedValue(polizaMock());
      mockIssuePolicy.mockResolvedValue({
        externalId: 'x', numeroPoliza: 'Q-1-AUTO', primaAnual: 13200, emision: 1,
        documentoUrl: 'https://x', mensaje: 'ok',
      });

      const r = await emitir_poliza_en_aseguradora({
        slug: 'qualitas',
        tenantId: TENANT,
        polizaId: 'POL_INTERNAL_ID',
        dryRun: true,
      });
      expect(r.accion).toBe('dry-run');
      expect(r.mensaje).toMatch(/dry-run/i);
      expect(polizaUpdate).not.toHaveBeenCalled();
    });
  });

  describe('errores', () => {
    it('Poliza no encontrada → error claro', async () => {
      polizaFindFirst.mockResolvedValue(null);
      await expect(
        emitir_poliza_en_aseguradora({
          slug: 'qualitas',
          tenantId: TENANT,
          polizaId: 'NO_EXISTE',
        }),
      ).rejects.toThrow(/No se encontró la Poliza NO_EXISTE/);
    });

    it('cliente sin RFC (MX) → error con mensaje útil', async () => {
      polizaFindFirst.mockResolvedValue(polizaMock({
        cliente: {
          ...polizaMock().cliente,
          customerFiscalData: { rfc: null, stripeTaxId: null },
        },
      }));
      await expect(
        emitir_poliza_en_aseguradora({
          slug: 'qualitas',
          tenantId: TENANT,
          polizaId: 'POL_INTERNAL_ID',
        }),
      ).rejects.toThrow(/Roberto.*no tiene RFC/);
    });

    it('sumaAsegurada = 0 → error antes de llamar al connector', async () => {
      polizaFindFirst.mockResolvedValue(polizaMock({ sumaAsegurada: 0 }));
      await expect(
        emitir_poliza_en_aseguradora({
          slug: 'qualitas',
          tenantId: TENANT,
          polizaId: 'POL_INTERNAL_ID',
        }),
      ).rejects.toThrow(/sumaAsegurada.*o primaAnual.*inválidas/);
      expect(mockIssuePolicy).not.toHaveBeenCalled();
    });

    it('primaAnual negativo → error antes de llamar al connector', async () => {
      polizaFindFirst.mockResolvedValue(polizaMock({ primaAnual: -100 }));
      await expect(
        emitir_poliza_en_aseguradora({
          slug: 'qualitas',
          tenantId: TENANT,
          polizaId: 'POL_INTERNAL_ID',
        }),
      ).rejects.toThrow(/sumaAsegurada.*o primaAnual.*inválidas/);
      expect(mockIssuePolicy).not.toHaveBeenCalled();
    });

    it('ConnectorError del backend → propaga el código', async () => {
      polizaFindFirst.mockResolvedValue(polizaMock());
      mockIssuePolicy.mockRejectedValue(
        new ConnectorError('INVALID_INPUT', 'sumaAsegurada inválida en partner'),
      );
      await expect(
        emitir_poliza_en_aseguradora({
          slug: 'qualitas',
          tenantId: TENANT,
          polizaId: 'POL_INTERNAL_ID',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('no toca BD si el connector falla', async () => {
      polizaFindFirst.mockResolvedValue(polizaMock());
      mockIssuePolicy.mockRejectedValue(new Error('partner caído'));
      await expect(
        emitir_poliza_en_aseguradora({
          slug: 'qualitas',
          tenantId: TENANT,
          polizaId: 'POL_INTERNAL_ID',
        }),
      ).rejects.toThrow();
      expect(polizaUpdate).not.toHaveBeenCalled();
    });
  });
});
