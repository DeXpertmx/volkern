/**
 * Test de Integración: Conciliación Bancaria (DB real)
 *
 * Verifica que los endpoints GET/POST /api/accounting/reconciliation
 * y GET/PATCH/DELETE /api/accounting/reconciliation/[id] funcionan
 * correctamente contra la base de datos real.
 *
 * Nota: Los tests de sync no se incluyen porque requieren credenciales
 * de servicios externos (Nordigen/GoCardless, Plaid, Stripe).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { generateApiKey } from '@/lib/api-keys';
import { GET, POST } from '@/app/api/accounting/reconciliation/route';
import {
  GET as GET_ID,
  PATCH as PATCH_ID,
  DELETE as DELETE_ID,
} from '@/app/api/accounting/reconciliation/[id]/route';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(
  method: 'GET' | 'POST',
  apiKey: string,
  url?: string,
  body?: unknown,
): Request {
  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
  const opts: RequestInit = { method, headers };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request(
    url || 'https://volkern.app/api/accounting/reconciliation',
    opts,
  );
}

function makeIdRequest(
  method: 'GET' | 'PATCH' | 'DELETE',
  apiKey: string,
  id: string,
  queryParams?: string,
  body?: unknown,
): Request {
  const url = `https://volkern.app/api/accounting/reconciliation/${id}${
    queryParams ? `?${queryParams}` : ''
  }`;
  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
  const opts: RequestInit = { method, headers };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request(url, opts);
}

// ─── Test Data (unique slugs to avoid collisions) ─────────────────────────

const TS = Date.now();
const AGENCY_SLUG = `test-rec-agency-${TS}`;
const BUSINESS_SLUG = `test-rec-business-${TS}`;
const CONNECTION_ID = `test-conn-${TS}`;
const CONNECTION_2_ID = `test-conn-2-${TS}`;

let agencyTenant: any;
let businessTenant: any;
let testUser: any;
let agencyApiKey: string;
let businessApiKey: string;
let isSuperadminUser = false;

// ─── Setup / Teardown ─────────────────────────────────────────────────────

describe('Integración: Conciliación Bancaria (DB real)', () => {
  beforeAll(async () => {
    // 1. Obtener usuario base
    testUser =
      (await prisma.user.findFirst({
        where: { role: { isNot: { nombre: 'Superadmin' } } },
      })) ||
      (await prisma.user.findFirst({ where: { email: { contains: 'volkern' } } })) ||
      (await prisma.user.findFirst());

    if (!testUser) {
      throw new Error('No se encontró ningún usuario en la base de datos para las pruebas');
    }

    const userWithRole = await prisma.user.findUnique({
      where: { id: testUser.id },
      select: { role: { select: { nombre: true } } },
    });
    isSuperadminUser = userWithRole?.role?.nombre === 'Superadmin';

    // 2. Crear tenant de tipo AGENCY (despacho contable)
    agencyTenant = await prisma.tenant.create({
      data: {
        nombre: 'Test Reconciliation Agency',
        slug: AGENCY_SLUG,
        accountType: 'AGENCY',
        enabledModules: ['crm', 'finanzas', 'conciliacion'],
        plan: 'pro-accounting',
        maxSlots: 10,
        brandingConfig: {
          showPoweredBy: true,
          primaryColor: '#059669',
        },
        estado: 'activo',
      },
    });

    // 3. Crear API key para la agencia
    const { key: rawAgencyKey, keyHash: agencyHash, prefix: agencyPrefix } = generateApiKey('prod');
    await prisma.apiKey.create({
      data: {
        nombre: 'Test Reconciliation Agency Key',
        keyHash: agencyHash,
        prefix: agencyPrefix,
        tenantId: agencyTenant.id,
        userId: testUser.id,
        scopes: ['accounting:write'],
      },
    });
    agencyApiKey = rawAgencyKey;

    // 4. Crear tenant de tipo BUSINESS (para test 403)
    businessTenant = await prisma.tenant.create({
      data: {
        nombre: 'Test Reconciliation Business',
        slug: BUSINESS_SLUG,
        accountType: 'BUSINESS',
        enabledModules: ['crm'],
        plan: 'basico',
        estado: 'activo',
      },
    });

    // 5. Crear API key para BUSINESS
    const { key: rawBizKey, keyHash: bizHash, prefix: bizPrefix } = generateApiKey('prod');
    await prisma.apiKey.create({
      data: {
        nombre: 'Test Reconciliation Business Key',
        keyHash: bizHash,
        prefix: bizPrefix,
        tenantId: businessTenant.id,
        userId: testUser.id,
        scopes: ['accounting:write'],
      },
    });
    businessApiKey = rawBizKey;

    // 6. Crear una conexión bancaria de prueba (para tests de detalle)
    await prisma.bankConnection.create({
      data: {
        id: CONNECTION_ID,
        tenantId: agencyTenant.id,
        provider: 'NORDIGEN',
        providerId: `test-provider-${TS}`,
        bankName: 'Banco Integración Test',
        status: 'ACTIVE',
        institutionId: `INST_TEST_${TS}`,
        lastSync: new Date(),
      },
    });

    // 7. Crear una segunda conexión (para tests de delete)
    await prisma.bankConnection.create({
      data: {
        id: CONNECTION_2_ID,
        tenantId: agencyTenant.id,
        provider: 'NORDIGEN',
        providerId: `test-provider-2-${TS}`,
        bankName: 'Banco a Eliminar',
        status: 'ACTIVE',
        institutionId: `INST_DEL_${TS}`,
      },
    });
  });

  afterAll(async () => {
    // Limpiar en orden inverso
    const tenantIds = [agencyTenant?.id, businessTenant?.id].filter(Boolean);
    if (tenantIds.length > 0) {
      const allTenantIds = [...tenantIds];

      // También recoger slots creados durante las pruebas
      const createdSlots = await prisma.tenant.findMany({
        where: { parentId: agencyTenant?.id },
        select: { id: true },
      });
      createdSlots.forEach((s: any) => allTenantIds.push(s.id));

      // Eliminar reconciliaciones, transacciones, conexiones bancarias asociadas
      await prisma.bankReconciliation.deleteMany({
        where: { transaction: { bankConnection: { tenantId: { in: allTenantIds } } } },
      });
      await prisma.bankTransaction.deleteMany({
        where: { bankConnection: { tenantId: { in: allTenantIds } } },
      });
      await prisma.bankConnection.deleteMany({
        where: { tenantId: { in: allTenantIds } },
      });
      await prisma.apiKey.deleteMany({ where: { tenantId: { in: allTenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: allTenantIds } } });
    }
  });

  // ─── GET /api/accounting/reconciliation ────────────────────────────────

  describe('GET /api/accounting/reconciliation', () => {
    it('debe retornar lista de conexiones (view=connections)', async () => {
      const response = await GET(
        makeRequest('GET', agencyApiKey, 'https://volkern.app/api/accounting/reconciliation?view=connections'),
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.connections).toBeDefined();
      expect(Array.isArray(json.connections)).toBe(true);
      // Debería incluir la conexión creada en beforeAll
      const found = json.connections.find((c: any) => c.id === CONNECTION_ID);
      expect(found).toBeDefined();
      expect(found.bankName).toBe('Banco Integración Test');
      expect(found.provider).toBe('NORDIGEN');
      expect(found.status).toBe('ACTIVE');
      expect(typeof found.transactionCount).toBe('number');
      expect(typeof found.unreconciledCount).toBe('number');
    });

    it('debe retornar lista vacía de transacciones (view=transactions)', async () => {
      const response = await GET(
        makeRequest('GET', agencyApiKey, 'https://volkern.app/api/accounting/reconciliation?view=transactions'),
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.transactions).toBeDefined();
      expect(Array.isArray(json.transactions)).toBe(true);
      expect(json.transactions).toHaveLength(0);
      expect(typeof json.total).toBe('number');
    });

    it('debe retornar estadísticas en cero (view=stats)', async () => {
      const response = await GET(
        makeRequest('GET', agencyApiKey, 'https://volkern.app/api/accounting/reconciliation?view=stats'),
      );

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json.totalConnections).toBeGreaterThanOrEqual(2); // 2 conexiones creadas
      expect(json.totalTransactions).toBe(0);
      expect(json.reconciledCount).toBe(0);
      expect(json.unreconciledCount).toBe(0);
      expect(json.reconciliationRate).toBe(0);
      expect(json.todayReconciliations).toBe(0);
    });

    it('debe retornar sugerencias vacías (view=suggestions)', async () => {
      const response = await GET(
        makeRequest('GET', agencyApiKey, 'https://volkern.app/api/accounting/reconciliation?view=suggestions'),
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.suggestions).toBeDefined();
      expect(Array.isArray(json.suggestions)).toBe(true);
    });

    it('debe retornar 403 si el tenant no es AGENCY', async () => {
      if (isSuperadminUser) {
        console.warn('[SKIP] Usuario de prueba es Superadmin — no se puede probar 403 para BUSINESS');
        return;
      }

      const response = await GET(
        makeRequest('GET', businessApiKey, 'https://volkern.app/api/accounting/reconciliation'),
      );

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain('Solo disponible para cuentas de Asesoría');
    });
  });

  // ─── POST /api/accounting/reconciliation ───────────────────────────────

  describe('POST /api/accounting/reconciliation', () => {
    it('debe crear conexión bancaria (action=create-connection) y devolver 201', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, undefined, {
          action: 'create-connection',
          provider: 'NORDIGEN',
          providerId: `new-conn-${TS}`,
          institutionName: 'Banco Nuevo',
          institutionId: `INST_NEW_${TS}`,
        }),
      );

      expect(response.status).toBe(201);
      const json = await response.json();

      expect(json.id).toBeDefined();
      expect(json.provider).toBe('NORDIGEN');
      expect(json.bankName).toContain('Banco Nuevo');

      // Verificar en DB
      const dbConn = await prisma.bankConnection.findUnique({
        where: { id: json.id },
      });
      expect(dbConn).not.toBeNull();
      expect(dbConn?.tenantId).toBe(agencyTenant.id);

      // Limpiar
      if (dbConn) {
        await prisma.bankConnection.delete({ where: { id: dbConn.id } });
      }
    });

    it('debe eliminar conexión bancaria (action=delete-connection)', async () => {
      // Primero crear una conexión temporal
      const tempConn = await prisma.bankConnection.create({
        data: {
          tenantId: agencyTenant.id,
          provider: 'NORDIGEN',
          providerId: `del-conn-${TS}`,
          bankName: 'Banco a Eliminar via POST',
          status: 'ACTIVE',
        },
      });

      const response = await POST(
        makeRequest('POST', agencyApiKey, undefined, {
          action: 'delete-connection',
          connectionId: tempConn.id,
        }),
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);

      // Verificar eliminación en DB
      const dbConn = await prisma.bankConnection.findUnique({
        where: { id: tempConn.id },
      });
      expect(dbConn).toBeNull();
    });

    it('debe rechazar action desconocida', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, undefined, {
          action: 'nonexistent-action',
        }),
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('no soportada');
    });

    it('debe rechazar create-connection con provider inválido', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, undefined, {
          action: 'create-connection',
          provider: 'INVALID',
        }),
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Datos de conexión inválidos');
      expect(json.details).toBeDefined();
    });

    it('debe rechazar create-connection con provider válido sin providerId', async () => {
      // Para NORDIGEN se requiere providerId
      // El servicio lanza error, pero como no contiene "no encontrada" ni "no soportado",
      // el catch del route handler devuelve 500 con mensaje genérico
      const response = await POST(
        makeRequest('POST', agencyApiKey, undefined, {
          action: 'create-connection',
          provider: 'NORDIGEN',
          // Sin providerId — Zod lo acepta como opcional,
          // pero el servicio lanza error en tiempo de ejecución
        }),
      );

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Error en la conciliación bancaria');
    });

    it('debe rechazar sync sin connectionId', async () => {
      const response = await POST(
        makeRequest('POST', agencyApiKey, undefined, {
          action: 'sync',
          // Sin connectionId
        }),
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Datos de sincronización inválidos');
    });

    it('debe devolver 403 si el tenant no es AGENCY', async () => {
      if (isSuperadminUser) {
        console.warn('[SKIP] Usuario de prueba es Superadmin — no se puede probar 403 para BUSINESS');
        return;
      }

      const response = await POST(
        makeRequest('POST', businessApiKey, undefined, {
          action: 'sync',
          connectionId: 'fake-id',
        }),
      );

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain('Solo disponible para cuentas de Asesoría');
    });
  });

  // ─── GET /api/accounting/reconciliation/[id] ──────────────────────────

  describe('GET /api/accounting/reconciliation/[id]', () => {
    it('debe retornar detalle de conexión (type=connection)', async () => {
      const response = await GET_ID(
        makeIdRequest('GET', agencyApiKey, CONNECTION_ID, 'type=connection'),
      );

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json.id).toBe(CONNECTION_ID);
      expect(json.provider).toBe('NORDIGEN');
      expect(json.bankName).toBe('Banco Integración Test');
      expect(json.status).toBe('ACTIVE');
      expect(json.institutionId).toBe(`INST_TEST_${TS}`);
      expect(json.lastSync).toBeDefined();
      expect(json.transactionCount).toBe(0);
      expect(json.recentTransactions).toBeDefined();
      expect(Array.isArray(json.recentTransactions)).toBe(true);
    });

    it('debe retornar 404 para conexión inexistente', async () => {
      const response = await GET_ID(
        makeIdRequest('GET', agencyApiKey, 'nonexistent-connection-id', 'type=connection'),
      );

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toContain('no encontrada');
    });

    it('debe retornar detalle de transacción (default)', async () => {
      // Crear una transacción bancaria directamente en DB
      const tx = await prisma.bankTransaction.create({
        data: {
          bankConnectionId: CONNECTION_ID,
          date: new Date('2026-05-20'),
          description: 'COBRO FACTURA #INTEGRATION',
          amount: 1500.0,
          reference: `REF-INT-${TS}`,
          isReconciled: false,
        },
      });

      const response = await GET_ID(
        makeIdRequest('GET', agencyApiKey, tx.id),
      );

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json.id).toBe(tx.id);
      expect(json.bankName).toBe('Banco Integración Test');
      expect(json.description).toBe('COBRO FACTURA #INTEGRATION');
      expect(json.amount).toBe(1500.0);
      expect(json.reference).toBe(`REF-INT-${TS}`);
      expect(json.isReconciled).toBe(false);
      expect(json.reconciliations).toBeDefined();
      expect(json.reconciliations).toHaveLength(0);

      // Limpiar
      await prisma.bankTransaction.delete({ where: { id: tx.id } });
    });

    it('debe retornar 404 para transacción inexistente', async () => {
      const response = await GET_ID(
        makeIdRequest('GET', agencyApiKey, 'nonexistent-tx-id'),
      );

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toContain('no encontrada');
    });
  });

  // ─── PATCH /api/accounting/reconciliation/[id] ────────────────────────

  describe('PATCH /api/accounting/reconciliation/[id]', () => {
    it('debe marcar transacción como no reconciliada (unreconcile)', async () => {
      // Crear una transacción y reconciliarla primero
      const tx = await prisma.bankTransaction.create({
        data: {
          bankConnectionId: CONNECTION_ID,
          date: new Date('2026-05-21'),
          description: 'PAGO PROVEEDOR #002',
          amount: -500.0,
          reference: `REF-PATCH-${TS}`,
          isReconciled: true,
        },
      });

      // Crear un asiento contable para reconciliar
      // Nota: se omite status 'RECONCILED' porque podría no ser un valor válido del enum;
      // el PATCH handler no valida el status actual, solo lo sobreescribe a POSTED
      const entry = await prisma.accountingEntry.create({
        data: {
          tenantId: agencyTenant.id,
          date: new Date('2026-05-21'),
          description: 'PAGO PROVEEDOR #002',
          reference: `REF-PATCH-${TS}`,
          entryHash: `hash-patch-test-${TS}`,
        },
      });

      // Crear la reconciliación
      const recon = await prisma.bankReconciliation.create({
        data: {
          transactionId: tx.id,
          entryId: entry.id,
          matchedBy: 'USER',
          confidenceScore: 1.0,
        },
      });

      // Ahora hacer PATCH para deshacer la reconciliación
      const response = await PATCH_ID(
        makeIdRequest('PATCH', agencyApiKey, tx.id, undefined, {
          isReconciled: false,
        }),
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.isReconciled).toBe(false);

      // Verificar que la transacción se marcó como no reconciliada
      const updatedTx = await prisma.bankTransaction.findUnique({
        where: { id: tx.id },
      });
      expect(updatedTx?.isReconciled).toBe(false);

      // Verificar que el asiento volvió a POSTED
      const updatedEntry = await prisma.accountingEntry.findUnique({
        where: { id: entry.id },
      });
      expect(updatedEntry?.status).toBe('POSTED');

      // Verificar que la reconciliación se eliminó
      const remainingRecons = await prisma.bankReconciliation.findMany({
        where: { transactionId: tx.id },
      });
      expect(remainingRecons).toHaveLength(0);

      // Limpiar — la reconciliación ya fue eliminada por el PATCH,
      // y el afterAll se encarga de lo demás
      await prisma.bankTransaction.delete({ where: { id: tx.id } }).catch(() => {});
      await prisma.accountingEntry.delete({ where: { id: entry.id } }).catch(() => {});
    });

    it('debe retornar 404 para transacción inexistente', async () => {
      const response = await PATCH_ID(
        makeIdRequest('PATCH', agencyApiKey, 'nonexistent-tx', undefined, {
          isReconciled: false,
        }),
      );

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toContain('no encontrada');
    });
  });

  // ─── DELETE /api/accounting/reconciliation/[id] ───────────────────────

  describe('DELETE /api/accounting/reconciliation/[id]', () => {
    it('debe eliminar conexión bancaria (type=connection)', async () => {
      const response = await DELETE_ID(
        makeIdRequest('DELETE', agencyApiKey, CONNECTION_2_ID, 'type=connection'),
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);

      // Verificar eliminación en DB
      const dbConn = await prisma.bankConnection.findUnique({
        where: { id: CONNECTION_2_ID },
      });
      expect(dbConn).toBeNull();
    });

    it('debe retornar 404 para conexión inexistente', async () => {
      const response = await DELETE_ID(
        makeIdRequest('DELETE', agencyApiKey, 'nonexistent-connection', 'type=connection'),
      );

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toContain('no encontrada');
    });
  });
});
