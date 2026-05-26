/**
 * Test de Integración: Sync de Conciliación Bancaria con Mocks
 *
 * Verifica el flujo completo de sync de transacciones bancarias mockeando
 * los servicios externos (Nordigen/GoCardless, Plaid, Stripe) para no
 * depender de credenciales reales.
 *
 * Los mocks simulan la creación de transacciones en DB para que podamos
 * verificar no solo la respuesta de la API sino también la persistencia.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { generateApiKey } from '@/lib/api-keys';

// ─── Mock de servicios externos ───────────────────────────────────────────
//
// Estos mocks se reemplazan a nivel de módulo: ReconciliationService
// (importado por la ruta) usará estos mocks en lugar de los reales.
//
// Las implementaciones concretas se configuran en beforeAll para poder
// usar prisma y crear transacciones reales en DB.

vi.mock('@/lib/banking/nordigen-service', () => ({
  NordigenService: {
    syncTransactions: vi.fn(),
  },
}));

vi.mock('@/lib/banking/plaid-banking-service', () => ({
  PlaidBankingService: {
    syncTransactions: vi.fn(),
  },
}));

vi.mock('@/lib/banking/stripe-banking-service', () => ({
  StripeBankingService: {
    syncTransactions: vi.fn(),
  },
}));

// ─── Imports (después de vi.mock para obtener versiones mockeadas) ────────

import { POST, GET } from '@/app/api/accounting/reconciliation/route';
import { NordigenService } from '@/lib/banking/nordigen-service';
import { PlaidBankingService } from '@/lib/banking/plaid-banking-service';
import { StripeBankingService } from '@/lib/banking/stripe-banking-service';

// Pequeño helper para upsert de transacciones en mocks
// Evita unique constraint violations en re-syncs
async function upsertTransaction(params: {
  bankConnectionId: string;
  date: Date;
  description: string;
  amount: number;
  reference: string;
}) {
  try {
    await prisma.bankTransaction.create({ data: { ...params, isReconciled: false } });
  } catch (err: any) {
    if (err.code === 'P2002') {
      // Unique constraint — ya existe, es idempotente
      return;
    }
    throw err;
  }
}

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

// ─── Test Data ────────────────────────────────────────────────────────────

const TS = Date.now();
const AGENCY_SLUG = `test-sync-agency-${TS}`;

let agencyTenant: any;
let testUser: any;
let apiKey: string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────

describe('Sync de Conciliación Bancaria (mocks externos, DB real)', () => {
  beforeAll(async () => {
    // 1. Buscar usuario base
    testUser =
      (await prisma.user.findFirst({
        where: { role: { isNot: { nombre: 'Superadmin' } } },
      })) ||
      (await prisma.user.findFirst());

    if (!testUser) {
      throw new Error('No se encontró ningún usuario en la base de datos');
    }

    // 2. Crear tenant AGENCY
    agencyTenant = await prisma.tenant.create({
      data: {
        nombre: 'Test Sync Agency',
        slug: AGENCY_SLUG,
        accountType: 'AGENCY',
        enabledModules: ['crm', 'finanzas', 'conciliacion'],
        plan: 'pro-accounting',
        maxSlots: 10,
        brandingConfig: { showPoweredBy: true, primaryColor: '#059669' },
        estado: 'activo',
      },
    });

    // 3. Crear API key
    const { key: rawKey, keyHash, prefix } = generateApiKey('prod');
    await prisma.apiKey.create({
      data: {
        nombre: 'Test Sync Agency Key',
        keyHash,
        prefix,
        tenantId: agencyTenant.id,
        userId: testUser.id,
        scopes: ['accounting:write'],
      },
    });
    apiKey = rawKey;

    // 4. Crear conexiones bancarias para cada proveedor
    await prisma.bankConnection.create({
      data: {
        id: `sync-nordigen-${TS}`,
        tenantId: agencyTenant.id,
        provider: 'NORDIGEN',
        providerId: `nordigen-provider-${TS}`,
        bankName: 'Banco Nordigen Test',
        status: 'ACTIVE',
        institutionId: `INST_NORD_${TS}`,
      },
    });

    await prisma.bankConnection.create({
      data: {
        id: `sync-plaid-${TS}`,
        tenantId: agencyTenant.id,
        provider: 'PLAID',
        providerId: `plaid-item-${TS}`,
        accessToken: 'access-sandbox-xxxxxxxxxx',
        bankName: 'Banco Plaid Test',
        status: 'ACTIVE',
      },
    });

    await prisma.bankConnection.create({
      data: {
        id: `sync-stripe-${TS}`,
        tenantId: agencyTenant.id,
        provider: 'STRIPE',
        providerId: `stripe-account-${TS}`,
        bankName: 'Banco Stripe Test',
        status: 'ACTIVE',
      },
    });

    await prisma.bankConnection.create({
      data: {
        id: `sync-mock-${TS}`,
        tenantId: agencyTenant.id,
        provider: 'MOCK',
        providerId: `mock-provider-${TS}`,
        bankName: 'Banco Mock Test',
        status: 'ACTIVE',
      },
    });

    // 5. Configurar implementaciones de los mocks
    // Cada mock crea transacciones reales en DB para verificar persistencia

    vi.mocked(NordigenService.syncTransactions).mockImplementation(
      async (connectionId: string) => {
        // Usar upsert helper para que re-syncs no fallen por unique constraint
        await upsertTransaction({
          bankConnectionId: connectionId,
          date: new Date('2026-05-15'),
          description: 'COBRO CLIENTE NORDIGEN',
          amount: 1250.0,
          reference: `NORD-REF-${TS}-1`,
        });
        await upsertTransaction({
          bankConnectionId: connectionId,
          date: new Date('2026-05-16'),
          description: 'PAGO PROVEEDOR NORDIGEN',
          amount: -800.0,
          reference: `NORD-REF-${TS}-2`,
        });
        await upsertTransaction({
          bankConnectionId: connectionId,
          date: new Date('2026-05-17'),
          description: 'TRANSFERENCIA RECIBIDA',
          amount: 3000.0,
          reference: `NORD-REF-${TS}-3`,
        });

        await prisma.bankConnection.update({
          where: { id: connectionId },
          data: { lastSync: new Date() },
        });

        return { success: true, count: 3 };
      },
    );

    vi.mocked(PlaidBankingService.syncTransactions).mockImplementation(
      async (connectionId: string) => {
        await upsertTransaction({
          bankConnectionId: connectionId,
          date: new Date('2026-05-18'),
          description: 'DEBITO TARJETA PLAID',
          amount: -45.99,
          reference: `PLD-REF-${TS}-1`,
        });

        await prisma.bankConnection.update({
          where: { id: connectionId },
          data: { lastSync: new Date() },
        });

        return 1;
      },
    );

    vi.mocked(StripeBankingService.syncTransactions).mockImplementation(
      async (connectionId: string) => {
        await upsertTransaction({
          bankConnectionId: connectionId,
          date: new Date('2026-05-19'),
          description: 'STRIPE PAYOUT',
          amount: 2500.0,
          reference: `STR-REF-${TS}-1`,
        });

        await prisma.bankConnection.update({
          where: { id: connectionId },
          data: { lastSync: new Date() },
        });

        // StripeService devuelve BankTransaction[] — recuperar la txn creada
        const txn = await prisma.bankTransaction.findFirst({
          where: { bankConnectionId: connectionId, reference: `STR-REF-${TS}-1` },
        });
        return txn ? [txn] : [];
      },
    );

    // NOTA: MOCK no necesita mock porque BankingService no está mockeado
    // y su syncTransactions crea 3 transacciones por defecto
  });

  afterAll(async () => {
    // Limpiar datos de prueba
    const tenantIds = [agencyTenant?.id].filter(Boolean);
    if (tenantIds.length > 0) {
      // Reconciliations → Transactions → Connections → API Keys → Tenant
      await prisma.bankReconciliation.deleteMany({
        where: { transaction: { bankConnection: { tenantId: { in: tenantIds } } } },
      });
      await prisma.bankTransaction.deleteMany({
        where: { bankConnection: { tenantId: { in: tenantIds } } },
      });
      await prisma.bankConnection.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await prisma.apiKey.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
  });

  // ─── Tests ─────────────────────────────────────────────────────────────

  it('01 - sync NORDIGEN: crea 3 transacciones y devuelve success', async () => {
    const response = await POST(
      makeRequest('POST', apiKey, undefined, {
        action: 'sync',
        connectionId: `sync-nordigen-${TS}`,
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(3);

    // Verificar persistencia en DB
    const txns = await prisma.bankTransaction.findMany({
      where: { bankConnectionId: `sync-nordigen-${TS}` },
    });
    expect(txns).toHaveLength(3);
    expect(txns.map((t: any) => t.description)).toContain('COBRO CLIENTE NORDIGEN');
    expect(txns.map((t: any) => t.description)).toContain('PAGO PROVEEDOR NORDIGEN');
    expect(txns.map((t: any) => t.description)).toContain('TRANSFERENCIA RECIBIDA');

    // Verificar lastSync actualizado
    const conn = await prisma.bankConnection.findUnique({
      where: { id: `sync-nordigen-${TS}` },
    });
    expect(conn?.lastSync).toBeDefined();
  });

  it('02 - sync PLAID: crea 1 transacción y devuelve count', async () => {
    const response = await POST(
      makeRequest('POST', apiKey, undefined, {
        action: 'sync',
        connectionId: `sync-plaid-${TS}`,
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(1);

    // Verificar persistencia
    const txns = await prisma.bankTransaction.findMany({
      where: { bankConnectionId: `sync-plaid-${TS}` },
    });
    expect(txns).toHaveLength(1);
    expect(txns[0].description).toContain('DEBITO TARJETA PLAID');
  });

  it('03 - sync STRIPE: crea 1 transacción y devuelve count', async () => {
    const response = await POST(
      makeRequest('POST', apiKey, undefined, {
        action: 'sync',
        connectionId: `sync-stripe-${TS}`,
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(1);

    // Verificar persistencia
    const txns = await prisma.bankTransaction.findMany({
      where: { bankConnectionId: `sync-stripe-${TS}` },
    });
    expect(txns).toHaveLength(1);
    expect(txns[0].description).toContain('STRIPE PAYOUT');
  });

  it('04 - sync MOCK (BankingService real): crea 3 transacciones', async () => {
    // BankingService.syncTransactions crea 3 transacciones mock por defecto
    const response = await POST(
      makeRequest('POST', apiKey, undefined, {
        action: 'sync',
        connectionId: `sync-mock-${TS}`,
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(3);

    // Verificar persistencia
    const txns = await prisma.bankTransaction.findMany({
      where: { bankConnectionId: `sync-mock-${TS}` },
    });
    expect(txns).toHaveLength(3);
  });

  it('05 - GET transacciones muestra datos sincronizados', async () => {
    const response = await GET(
      makeRequest(
        'GET',
        apiKey,
        `https://volkern.app/api/accounting/reconciliation?view=transactions&connectionId=sync-nordigen-${TS}`,
      ),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.transactions).toHaveLength(3);
    expect(json.total).toBe(3);

    // Verificar formato de respuesta
    const tx = json.transactions[0];
    expect(tx.id).toBeDefined();
    expect(tx.description).toBeDefined();
    expect(typeof tx.amount).toBe('number');
    expect(typeof tx.date).toBe('string');
    expect(tx.isReconciled).toBe(false);
    expect(tx.bankName).toBe('Banco Nordigen Test');
    expect(tx.provider).toBe('NORDIGEN');
  });

  it('06 - GET conexiones muestra transactionCount actualizados', async () => {
    const response = await GET(
      makeRequest(
        'GET',
        apiKey,
        'https://volkern.app/api/accounting/reconciliation?view=connections',
      ),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(Array.isArray(json.connections)).toBe(true);

    const nordigenConn = json.connections.find(
      (c: any) => c.id === `sync-nordigen-${TS}`,
    );
    expect(nordigenConn).toBeDefined();
    expect(nordigenConn.transactionCount).toBe(3);
    expect(nordigenConn.lastSync).toBeDefined();
    expect(nordigenConn.unreconciledCount).toBe(3);

    const plaidConn = json.connections.find(
      (c: any) => c.id === `sync-plaid-${TS}`,
    );
    expect(plaidConn).toBeDefined();
    expect(plaidConn.transactionCount).toBe(1);
  });

  it('07 - GET stats refleja datos sincronizados', async () => {
    const response = await GET(
      makeRequest(
        'GET',
        apiKey,
        'https://volkern.app/api/accounting/reconciliation?view=stats',
      ),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.totalConnections).toBe(4);
    // Total transacciones: 3 (NORDIGEN) + 1 (PLAID) + 1 (STRIPE) + 3 (MOCK) = 8
    expect(json.totalTransactions).toBe(8);
    expect(json.reconciledCount).toBe(0); // Ninguna reconciliada aún
    expect(json.unreconciledCount).toBe(8);
    expect(json.reconciliationRate).toBe(0);
  });

  it('08 - error: sync con connectionId inexistente devuelve 500 con error del servicio', async () => {
    const response = await POST(
      makeRequest('POST', apiKey, undefined, {
        action: 'sync',
        connectionId: 'nonexistent-connection',
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    // El ReconciliationService.syncTransactions devuelve { success: false, error: 'Conexión no encontrada' }
    // y la ruta lo mapea a 500 con ese mismo mensaje
    expect(json.error).toBe('Conexión no encontrada');
  });

  it('09 - error: sync-all sin conexiones activas adicionales', async () => {
    // sync-all sincroniza todas las conexiones activas del tenant
    // Las conexiones ya fueron sincronizadas, pero las volvemos a sincronizar
    // Los mocks volverán a crear transacciones (con referencias únicas o duplicados)
    // BankingService usa prisma.bankTransaction.create que podría chocar con unique
    // Por eso este test verifica que maneja correctamente
    const response = await POST(
      makeRequest('POST', apiKey, undefined, {
        action: 'sync-all',
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.totalCount).toBeGreaterThanOrEqual(0);
    expect(json.results).toBeDefined();
    expect(Array.isArray(json.results)).toBe(true);
  });

  it('10 - error: sync sin connectionId devuelve 400', async () => {
    const response = await POST(
      makeRequest('POST', apiKey, undefined, {
        action: 'sync',
        // Sin connectionId
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos de sincronización inválidos');
  });
});
