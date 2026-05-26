import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Auth ────────────────────────────────────────────────────────────────
const currentAccountType = vi.hoisted(() => ({ value: 'AGENCY' }));

// El objeto prisma se define primero para poder referenciarlo en $transaction
const __mockPrisma = vi.hoisted(() => {
  const m: Record<string, any> = {
    bankConnection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    bankTransaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    bankReconciliation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    accountingEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    accountingAccount: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  m.$transaction = vi.fn((cb: any) => cb(m));
  return m;
});

vi.mock('@/lib/db', () => ({
  prisma: __mockPrisma,
}));

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => {
    return async (request: Request, _context?: any) => {
      const isSuperadmin = currentAccountType.value === 'SUPERADMIN';
      const auth = {
        user: {
          id: 'user-1',
          accountType: currentAccountType.value,
          role: isSuperadmin ? { nombre: 'Superadmin' } : { nombre: 'User' },
        },
        tenant: { id: 'tenant-1', nombre: 'Despacho Contable Test' },
      };
      return handler(request, auth);
    };
  },
}));

// ─── Mock servicios externos ───────────────────────────────────────────────────

vi.mock('@/lib/accounting/auto-reconciler', () => ({
  AutoReconciler: { getSuggestions: vi.fn() },
}));

vi.mock('@/lib/accounting/banking-service', () => ({
  BankingService: {
    reconcile: vi.fn(),
    syncTransactions: vi.fn(),
  },
}));

vi.mock('@/lib/banking/nordigen-service', () => ({
  NordigenService: { syncTransactions: vi.fn() },
}));

vi.mock('@/lib/banking/plaid-banking-service', () => ({
  PlaidBankingService: {
    exchangePublicToken: vi.fn(),
    syncTransactions: vi.fn(),
    createLinkToken: vi.fn(),
  },
}));

vi.mock('@/lib/banking/stripe-banking-service', () => ({
  StripeBankingService: {
    handleSessionCallback: vi.fn(),
    createConnectSession: vi.fn(),
    syncTransactions: vi.fn(),
  },
}));

import { prisma } from '@/lib/db';
import { AutoReconciler } from '@/lib/accounting/auto-reconciler';
import { BankingService } from '@/lib/accounting/banking-service';
import { NordigenService } from '@/lib/banking/nordigen-service';
import { PlaidBankingService } from '@/lib/banking/plaid-banking-service';
import { StripeBankingService } from '@/lib/banking/stripe-banking-service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string, options?: RequestInit): Request {
  return new Request(url, {
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
    ...options,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/accounting/reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAccountType.value = 'AGENCY';
  });

  it('devuelve lista de conexiones (view=connections)', async () => {
    const { GET } = await import('@/app/api/accounting/reconciliation/route');
    (prisma.bankConnection.findMany as any).mockResolvedValue([
      {
        id: 'bc-1',
        provider: 'NORDIGEN',
        bankName: 'Banco Santander',
        status: 'ACTIVE',
        lastSync: new Date('2026-05-25'),
        institutionId: 'SANT_ES',
        _count: { transactions: 15 },
      },
      {
        id: 'bc-2',
        provider: 'PLAID',
        bankName: 'BBVA',
        status: 'ACTIVE',
        lastSync: new Date('2026-05-26'),
        institutionId: 'BBVA_ES',
        _count: { transactions: 8 },
      },
    ]);
    (prisma.bankTransaction.count as any).mockResolvedValue(3);

    const res = await GET(makeRequest('https://volkern.app/api/accounting/reconciliation?view=connections'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.connections).toHaveLength(2);
    expect(json.connections[0].bankName).toBe('Banco Santander');
    expect(json.connections[0].transactionCount).toBe(15);
  });

  it('devuelve 403 si no es AGENCY', async () => {
    currentAccountType.value = 'BUSINESS';
    const { GET } = await import('@/app/api/accounting/reconciliation/route');

    const res = await GET(makeRequest('https://volkern.app/api/accounting/reconciliation'));
    expect(res.status).toBe(403);
  });

  it('devuelve transacciones (view=transactions)', async () => {
    const { GET } = await import('@/app/api/accounting/reconciliation/route');
    (prisma.bankTransaction.findMany as any).mockResolvedValue([
      {
        id: 'tx-1',
        bankConnectionId: 'bc-1',
        date: new Date('2026-05-20'),
        description: 'COBRO FACTURA #001',
        amount: 121.00,
        reference: 'REF-001',
        isReconciled: false,
        bankConnection: { bankName: 'Banco Santander', provider: 'NORDIGEN' },
      },
    ]);
    (prisma.bankTransaction.count as any).mockResolvedValue(1);

    const res = await GET(makeRequest('https://volkern.app/api/accounting/reconciliation?view=transactions'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.transactions).toHaveLength(1);
    expect(json.total).toBe(1);
  });

  it('devuelve estadísticas (view=stats)', async () => {
    const { GET } = await import('@/app/api/accounting/reconciliation/route');
    (prisma.bankConnection.count as any).mockResolvedValue(2);
    (prisma.bankTransaction.count as any)
      .mockResolvedValueOnce(20)  // totalTransactions
      .mockResolvedValueOnce(12)  // reconciledCount
      .mockResolvedValueOnce(8);  // unreconciledCount
    (prisma.bankReconciliation.count as any).mockResolvedValue(5);

    const res = await GET(makeRequest('https://volkern.app/api/accounting/reconciliation?view=stats'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.totalConnections).toBe(2);
    expect(json.totalTransactions).toBe(20);
    expect(json.reconciliationRate).toBe(60);
    expect(json.todayReconciliations).toBe(5);
  });

  it('devuelve 500 si hay error en findMany', async () => {
    const { GET } = await import('@/app/api/accounting/reconciliation/route');
    (prisma.bankConnection.findMany as any).mockRejectedValue(new Error('DB error'));

    const res = await GET(makeRequest('https://volkern.app/api/accounting/reconciliation'));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/accounting/reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAccountType.value = 'AGENCY';
  });

  it('sincroniza transacciones (action=sync) - usa BankingService mock', async () => {
    const { POST } = await import('@/app/api/accounting/reconciliation/route');

    // Usar provider 'MOCK' para caer al default de BankingService
    (prisma.bankConnection.findUnique as any).mockResolvedValue({
      id: 'bc-1',
      provider: 'MOCK',
      tenantId: 'tenant-1',
      bankName: 'Banco Test Mock',
      status: 'ACTIVE',
    });
    vi.mocked(BankingService.syncTransactions).mockResolvedValue([
      { id: 'tx-new-1', bankConnectionId: 'bc-1', reference: 'REF-MOCK-001' } as any,
      { id: 'tx-new-2', bankConnectionId: 'bc-1', reference: 'REF-MOCK-002' } as any,
    ]);

    const res = await POST(makeRequest('https://volkern.app/api/accounting/reconciliation', {
      method: 'POST',
      body: JSON.stringify({
        action: 'sync',
        connectionId: 'bc-1',
      }),
    }));
    expect(res.status).toBe(200);
    expect(BankingService.syncTransactions).toHaveBeenCalledWith('bc-1');
  });

  it('rechaza sync sin connectionId', async () => {
    const { POST } = await import('@/app/api/accounting/reconciliation/route');

    const res = await POST(makeRequest('https://volkern.app/api/accounting/reconciliation', {
      method: 'POST',
      body: JSON.stringify({ action: 'sync' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rechaza action desconocida', async () => {
    const { POST } = await import('@/app/api/accounting/reconciliation/route');

    const res = await POST(makeRequest('https://volkern.app/api/accounting/reconciliation', {
      method: 'POST',
      body: JSON.stringify({ action: 'nonexistent' }),
    }));
    expect(res.status).toBe(400);
  });

  it('procesa reconcile (action=reconcile)', async () => {
    const { POST } = await import('@/app/api/accounting/reconciliation/route');

    vi.mocked(BankingService.reconcile).mockResolvedValue({
      id: 'rec-1',
      transactionId: 'tx-1',
      entryId: 'entry-1',
      matchedBy: 'USER',
      confidenceScore: 1.0,
    } as any);

    const res = await POST(makeRequest('https://volkern.app/api/accounting/reconciliation', {
      method: 'POST',
      body: JSON.stringify({
        action: 'reconcile',
        transactionId: 'tx-1',
        entryId: 'entry-1',
        matchedBy: 'USER',
      }),
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.transactionId).toBe('tx-1');
    expect(BankingService.reconcile).toHaveBeenCalledWith('tx-1', 'entry-1', 'USER');
  });

  it('rechaza reconcile sin transactionId', async () => {
    const { POST } = await import('@/app/api/accounting/reconciliation/route');

    const res = await POST(makeRequest('https://volkern.app/api/accounting/reconciliation', {
      method: 'POST',
      body: JSON.stringify({
        action: 'reconcile',
        entryId: 'entry-1',
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('procesa bulk-reconcile', async () => {
    const { POST } = await import('@/app/api/accounting/reconciliation/route');

    vi.mocked(BankingService.reconcile)
      .mockResolvedValueOnce({ id: 'rec-1', transactionId: 'tx-1' } as any)
      .mockResolvedValueOnce({ id: 'rec-2', transactionId: 'tx-2' } as any);

    const res = await POST(makeRequest('https://volkern.app/api/accounting/reconciliation', {
      method: 'POST',
      body: JSON.stringify({
        action: 'bulk-reconcile',
        matches: [
          { transactionId: 'tx-1', entryId: 'entry-1' },
          { transactionId: 'tx-2', entryId: 'entry-2' },
        ],
      }),
    }));
    expect(res.status).toBe(200);
    expect(BankingService.reconcile).toHaveBeenCalledTimes(2);
  });

  it('devuelve 403 si no es AGENCY', async () => {
    currentAccountType.value = 'BUSINESS';
    const { POST } = await import('@/app/api/accounting/reconciliation/route');

    const res = await POST(makeRequest('https://volkern.app/api/accounting/reconciliation', {
      method: 'POST',
      body: JSON.stringify({ action: 'sync', connectionId: 'bc-1' }),
    }));
    expect(res.status).toBe(403);
  });

  it('crea conexión bancaria (action=create-connection)', async () => {
    const { POST } = await import('@/app/api/accounting/reconciliation/route');

    (prisma.bankConnection.create as any).mockResolvedValue({
      id: 'bc-3',
      provider: 'NORDIGEN',
      bankName: 'Banco Test',
      status: 'ACTIVE',
    });

    const res = await POST(makeRequest('https://volkern.app/api/accounting/reconciliation', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create-connection',
        provider: 'NORDIGEN',
        providerId: 'TEST-001',
        institutionName: 'Banco Test',
      }),
    }));
    expect(res.status).toBe(201);
  });

  it('rechaza create-connection con provider inválido', async () => {
    const { POST } = await import('@/app/api/accounting/reconciliation/route');

    const res = await POST(makeRequest('https://volkern.app/api/accounting/reconciliation', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create-connection',
        provider: 'INVALID',
      }),
    }));
    expect(res.status).toBe(400);
  });

  it('devuelve 500 si hay error en la DB', async () => {
    const { POST } = await import('@/app/api/accounting/reconciliation/route');

    (prisma.bankConnection.findUnique as any).mockRejectedValue(new Error('DB connection failed'));

    const res = await POST(makeRequest('https://volkern.app/api/accounting/reconciliation', {
      method: 'POST',
      body: JSON.stringify({ action: 'sync', connectionId: 'bc-1' }),
    }));
    expect(res.status).toBe(500);
  });
});

describe('ReconciliationService (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getMatchSuggestions ───────────────────────────────────────────────

  describe('getMatchSuggestions', () => {
    it('filtra por confianza mínima 0.5 por defecto', async () => {
      const suggestions = [
        { entryId: 'e1', transactionId: 'tx1', confidence: 0.95, reason: 'Importe exacto', entry: {}, transaction: { bankConnectionId: 'bc-1' } },
        { entryId: 'e2', transactionId: 'tx2', confidence: 0.75, reason: 'Importe aproximado', entry: {}, transaction: { bankConnectionId: 'bc-1' } },
        { entryId: 'e3', transactionId: 'tx3', confidence: 0.40, reason: 'Baja confianza', entry: {}, transaction: { bankConnectionId: 'bc-1' } },
      ];
      vi.mocked(AutoReconciler.getSuggestions).mockResolvedValue(suggestions as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.getMatchSuggestions('tenant-1');

      expect(result).toHaveLength(2);
      expect(result[0].entryId).toBe('e1');
      expect(result[1].entryId).toBe('e2');
      expect(AutoReconciler.getSuggestions).toHaveBeenCalledWith('tenant-1');
    });

    it('filtra por connectionId y minConfidence personalizado', async () => {
      const suggestions = [
        { entryId: 'e1', transactionId: 'tx1', confidence: 0.9, reason: '', entry: {}, transaction: { bankConnectionId: 'bc-1' } },
        { entryId: 'e2', transactionId: 'tx2', confidence: 0.8, reason: '', entry: {}, transaction: { bankConnectionId: 'bc-2' } },
      ];
      vi.mocked(AutoReconciler.getSuggestions).mockResolvedValue(suggestions as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.getMatchSuggestions('tenant-1', {
        connectionId: 'bc-1',
        minConfidence: 0.85,
      });

      expect(result).toHaveLength(1);
      expect(result[0].entryId).toBe('e1');
    });

    it('limita la cantidad de resultados', async () => {
      const suggestions = Array.from({ length: 10 }, (_, i) => ({
        entryId: `e${i}`, transactionId: `tx${i}`, confidence: 0.9, reason: '', entry: {}, transaction: { bankConnectionId: 'bc-1' },
      }));
      vi.mocked(AutoReconciler.getSuggestions).mockResolvedValue(suggestions as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.getMatchSuggestions('tenant-1', { limit: 3 });

      expect(result).toHaveLength(3);
    });

    it('devuelve array vacío si no hay coincidencias', async () => {
      vi.mocked(AutoReconciler.getSuggestions).mockResolvedValue([]);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.getMatchSuggestions('tenant-1', { minConfidence: 0.99 });

      expect(result).toEqual([]);
    });
  });

  // ─── reconcile ─────────────────────────────────────────────────────────

  describe('reconcile', () => {
    it('delega en BankingService.reconcile con los parámetros correctos', async () => {
      const mockRecon = { id: 'rec-1', transactionId: 'tx-1', entryId: 'entry-1', matchedBy: 'USER', confidenceScore: 1.0 };
      vi.mocked(BankingService.reconcile).mockResolvedValue(mockRecon as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.reconcile('tx-1', 'entry-1', 'USER');

      expect(result).toEqual(mockRecon);
      expect(BankingService.reconcile).toHaveBeenCalledWith('tx-1', 'entry-1', 'USER');
    });

    it('usa matchedBy=USER por defecto', async () => {
      vi.mocked(BankingService.reconcile).mockResolvedValue({ id: 'rec-2' } as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      await ReconciliationService.reconcile('tx-2', 'entry-2');

      expect(BankingService.reconcile).toHaveBeenCalledWith('tx-2', 'entry-2', 'USER');
    });
  });

  // ─── bulkReconcile ─────────────────────────────────────────────────────

  describe('bulkReconcile', () => {
    it('procesa múltiples matches exitosamente', async () => {
      vi.mocked(BankingService.reconcile)
        .mockResolvedValueOnce({ id: 'rec-1' } as any)
        .mockResolvedValueOnce({ id: 'rec-2' } as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const results = await ReconciliationService.bulkReconcile([
        { transactionId: 'tx-1', entryId: 'entry-1' },
        { transactionId: 'tx-2', entryId: 'entry-2' },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].transactionId).toBe('tx-1');
      expect(results[1].success).toBe(true);
      expect(BankingService.reconcile).toHaveBeenCalledTimes(2);
    });

    it('maneja fallos parciales sin bloquear el resto', async () => {
      vi.mocked(BankingService.reconcile)
        .mockResolvedValueOnce({ id: 'rec-1' } as any)
        .mockRejectedValueOnce(new Error('Entry ya reconciliado'));

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const results = await ReconciliationService.bulkReconcile([
        { transactionId: 'tx-1', entryId: 'entry-1' },
        { transactionId: 'tx-2', entryId: 'entry-2' },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Entry ya reconciliado');
      expect(BankingService.reconcile).toHaveBeenCalledTimes(2);
    });

    it('usa matchedBy=BULK por defecto', async () => {
      vi.mocked(BankingService.reconcile).mockResolvedValue({ id: 'rec-1' } as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      await ReconciliationService.bulkReconcile([
        { transactionId: 'tx-1', entryId: 'entry-1' },
      ]);

      expect(BankingService.reconcile).toHaveBeenCalledWith('tx-1', 'entry-1', 'BULK');
    });
  });

  // ─── getStats ──────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('calcula estadísticas correctamente con datos', async () => {
      (prisma.bankConnection.count as any).mockResolvedValue(3);
      // totalTransactions, reconciledCount, unreconciledCount
      (prisma.bankTransaction.count as any)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(20);
      (prisma.bankReconciliation.count as any).mockResolvedValue(8);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const stats = await ReconciliationService.getStats('tenant-1');

      expect(stats.totalConnections).toBe(3);
      expect(stats.totalTransactions).toBe(50);
      expect(stats.reconciledCount).toBe(30);
      expect(stats.unreconciledCount).toBe(20);
      expect(stats.reconciliationRate).toBe(60); // 30/50*100
      expect(stats.todayReconciliations).toBe(8);
    });

    it('retorna reconciliationRate=0 cuando no hay transacciones (división por cero)', async () => {
      (prisma.bankConnection.count as any).mockResolvedValue(0);
      (prisma.bankTransaction.count as any)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      (prisma.bankReconciliation.count as any).mockResolvedValue(0);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const stats = await ReconciliationService.getStats('tenant-1');

      expect(stats.reconciliationRate).toBe(0);
      expect(stats.totalConnections).toBe(0);
    });
  });

  // ─── handleStripeCallback ──────────────────────────────────────────────

  describe('handleStripeCallback', () => {
    it('delega en StripeBankingService con los parámetros correctos', async () => {
      const mockConnections = [{ id: 'sc-1', provider: 'Stripe', bankName: 'Banco Test' }];
      vi.mocked(StripeBankingService.handleSessionCallback).mockResolvedValue(mockConnections as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.handleStripeCallback('tenant-1', 'session-123');

      expect(result).toEqual(mockConnections);
      expect(StripeBankingService.handleSessionCallback).toHaveBeenCalledWith('tenant-1', 'session-123');
    });

    it('propaga errores del servicio Stripe', async () => {
      vi.mocked(StripeBankingService.handleSessionCallback).mockRejectedValue(new Error('Sesión expirada'));

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      await expect(ReconciliationService.handleStripeCallback('tenant-1', 'bad-session')).rejects.toThrow('Sesión expirada');
    });
  });

  // ─── createConnection ──────────────────────────────────────────────────

  describe('createConnection', () => {
    it('NORDIGEN: crea conexión en DB con providerId', async () => {
      const mockConn = { id: 'bc-nordigen', provider: 'NORDIGEN', bankName: 'Banco Santander', status: 'ACTIVE' };
      (prisma.bankConnection.create as any).mockResolvedValue(mockConn);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.createConnection('tenant-1', {
        provider: 'NORDIGEN',
        providerId: 'SANT_ES_001',
        institutionName: 'Banco Santander',
      });

      expect(result).toEqual(mockConn);
      expect(prisma.bankConnection.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          provider: 'NORDIGEN',
          providerId: 'SANT_ES_001',
          bankName: 'Banco Santander',
          institutionId: 'SANT_ES_001',
          status: 'ACTIVE',
        },
      });
    });

    it('NORDIGEN: lanza error si falta providerId', async () => {
      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      await expect(
        ReconciliationService.createConnection('tenant-1', { provider: 'NORDIGEN' })
      ).rejects.toThrow('providerId requerido para Nordigen/GoCardless');
    });

    it('PLAID: delega en PlaidBankingService.exchangePublicToken', async () => {
      const mockConn = { id: 'bc-plaid', provider: 'PLAID', bankName: 'BBVA' };
      vi.mocked(PlaidBankingService.exchangePublicToken).mockResolvedValue(mockConn as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.createConnection('tenant-1', {
        provider: 'PLAID',
        publicToken: 'public-sandbox-abc123',
        institutionId: 'BBVA_ES',
        institutionName: 'BBVA',
      });

      expect(result).toEqual(mockConn);
      expect(PlaidBankingService.exchangePublicToken).toHaveBeenCalledWith('public-sandbox-abc123', 'tenant-1', {
        institution: {
          institution_id: 'BBVA_ES',
          name: 'BBVA',
        },
      });
    });

    it('PLAID: lanza error si falta publicToken', async () => {
      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      await expect(
        ReconciliationService.createConnection('tenant-1', { provider: 'PLAID' })
      ).rejects.toThrow('publicToken requerido para Plaid');
    });

    it('STRIPE: delega en StripeBankingService.createConnectSession', async () => {
      vi.mocked(StripeBankingService.createConnectSession).mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://connect.stripe.com/test',
      } as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.createConnection('tenant-1', {
        provider: 'STRIPE',
      });

      expect(result).toEqual({
        sessionId: 'cs_test_123',
        url: 'https://connect.stripe.com/test',
      });
      expect(StripeBankingService.createConnectSession).toHaveBeenCalledWith('tenant-1');
    });

    it('STRIPE: maneja sesión sin url (retorna null)', async () => {
      vi.mocked(StripeBankingService.createConnectSession).mockResolvedValue({ id: 'cs_test_456' } as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.createConnection('tenant-1', {
        provider: 'STRIPE',
      });

      expect(result.url).toBeNull();
    });

    it('provider inválido: lanza error', async () => {
      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      await expect(
        ReconciliationService.createConnection('tenant-1', { provider: 'INVENTED' })
      ).rejects.toThrow('Proveedor no soportado: INVENTED');
    });
  });

  // ─── deleteConnection ──────────────────────────────────────────────────

  describe('deleteConnection', () => {
    it('elimina conexión existente', async () => {
      (prisma.bankConnection.findFirst as any).mockResolvedValue({
        id: 'bc-1',
        tenantId: 'tenant-1',
      });
      (prisma.bankConnection.delete as any).mockResolvedValue({});

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.deleteConnection('bc-1', 'tenant-1');

      expect(result).toEqual({ success: true });
      expect(prisma.bankConnection.findFirst).toHaveBeenCalledWith({
        where: { id: 'bc-1', tenantId: 'tenant-1' },
      });
      expect(prisma.bankConnection.delete).toHaveBeenCalledWith({ where: { id: 'bc-1' } });
    });

    it('lanza error si conexión no existe', async () => {
      (prisma.bankConnection.findFirst as any).mockResolvedValue(null);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      await expect(
        ReconciliationService.deleteConnection('bc-inexistente', 'tenant-1')
      ).rejects.toThrow('Conexión no encontrada');

      expect(prisma.bankConnection.delete).not.toHaveBeenCalled();
    });
  });

  // ─── syncTransactions ──────────────────────────────────────────────────

  describe('syncTransactions', () => {
    beforeEach(() => {
      (prisma.bankConnection.findUnique as any).mockResolvedValue({
        id: 'bc-1',
        provider: 'NORDIGEN',
        tenantId: 'tenant-1',
      });
    });

    it('NORDIGEN: retorna { success, count } desde NordigenService', async () => {
      (prisma.bankConnection.findUnique as any).mockResolvedValue({
        id: 'bc-1', provider: 'NORDIGEN',
      });
      vi.mocked(NordigenService.syncTransactions).mockResolvedValue({ success: true, count: 3 });

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.syncTransactions('bc-1');

      expect(result).toEqual({ success: true, count: 3 });
      expect(NordigenService.syncTransactions).toHaveBeenCalledWith('bc-1');
    });

    it('PLAID: retorna count desde PlaidBankingService.syncTransactions', async () => {
      (prisma.bankConnection.findUnique as any).mockResolvedValue({
        id: 'bc-1', provider: 'PLAID',
      });
      vi.mocked(PlaidBankingService.syncTransactions).mockResolvedValue(5);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.syncTransactions('bc-1');

      expect(result).toEqual({ success: true, count: 5 });
    });

    it('PLAID: captura error y retorna { success: false, error }', async () => {
      (prisma.bankConnection.findUnique as any).mockResolvedValue({
        id: 'bc-1', provider: 'PLAID',
      });
      vi.mocked(PlaidBankingService.syncTransactions).mockRejectedValue(new Error('Token expirado'));

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.syncTransactions('bc-1');

      expect(result).toEqual({ success: false, count: 0, error: 'Token expirado' });
    });

    it('STRIPE: retorna count desde arreglo de transacciones', async () => {
      (prisma.bankConnection.findUnique as any).mockResolvedValue({
        id: 'bc-1', provider: 'STRIPE',
      });
      vi.mocked(StripeBankingService.syncTransactions).mockResolvedValue([
        { id: 'stx-1' },
        { id: 'stx-2' },
      ] as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.syncTransactions('bc-1');

      expect(result).toEqual({ success: true, count: 2 });
    });

    it('STRIPE: captura error y retorna { success: false, error }', async () => {
      (prisma.bankConnection.findUnique as any).mockResolvedValue({
        id: 'bc-1', provider: 'STRIPE',
      });
      vi.mocked(StripeBankingService.syncTransactions).mockRejectedValue(new Error('Cuenta desconectada'));

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.syncTransactions('bc-1');

      expect(result).toEqual({ success: false, count: 0, error: 'Cuenta desconectada' });
    });

    it('MOCK/default: usa BankingService.syncTransactions', async () => {
      (prisma.bankConnection.findUnique as any).mockResolvedValue({
        id: 'bc-1', provider: 'MOCK',
      });
      vi.mocked(BankingService.syncTransactions).mockResolvedValue([
        { id: 'mtx-1' }, { id: 'mtx-2' }, { id: 'mtx-3' },
      ] as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.syncTransactions('bc-1');

      expect(result).toEqual({ success: true, count: 3 });
    });

    it('MOCK/default: captura error de BankingService', async () => {
      (prisma.bankConnection.findUnique as any).mockResolvedValue({
        id: 'bc-1', provider: 'UNKNOWN',
      });
      vi.mocked(BankingService.syncTransactions).mockRejectedValue(new Error('Servicio no disponible'));

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.syncTransactions('bc-1');

      expect(result).toEqual({ success: false, count: 0, error: 'Servicio no disponible' });
    });

    it('retorna error si la conexión no existe', async () => {
      (prisma.bankConnection.findUnique as any).mockResolvedValue(null);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.syncTransactions('bc-inexistente');

      expect(result).toEqual({ success: false, count: 0, error: 'Conexión no encontrada' });
    });
  });

  // ─── syncAllConnections ────────────────────────────────────────────────

  describe('syncAllConnections', () => {
    it('sincroniza todas las conexiones activas', async () => {
      (prisma.bankConnection.findMany as any).mockResolvedValue([
        { id: 'bc-1', status: 'ACTIVE' },
        { id: 'bc-2', status: 'ACTIVE' },
      ]);
      // La primera llamada a syncTransactions es para 'bc-1' (MOCK) -> BankingService
      // La segunda es para 'bc-2' (MOCK) -> BankingService
      // Moqueamos el findUnique dentro de cada syncTransactions
      (prisma.bankConnection.findUnique as any)
        .mockResolvedValueOnce({ id: 'bc-1', provider: 'NORDIGEN' })
        .mockResolvedValueOnce({ id: 'bc-2', provider: 'PLAID' });
      vi.mocked(NordigenService.syncTransactions).mockResolvedValue({ success: true, count: 3 });
      vi.mocked(PlaidBankingService.syncTransactions).mockResolvedValue(5);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const results = await ReconciliationService.syncAllConnections('tenant-1');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ success: true, count: 3 });
      expect(results[1]).toEqual({ success: true, count: 5 });
      expect(prisma.bankConnection.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', status: 'ACTIVE' },
      });
    });

    it('retorna arreglo vacío si no hay conexiones activas', async () => {
      (prisma.bankConnection.findMany as any).mockResolvedValue([]);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const results = await ReconciliationService.syncAllConnections('tenant-1');

      expect(results).toEqual([]);
    });
  });

  // ─── createPlaidLinkToken ──────────────────────────────────────────────

  describe('createPlaidLinkToken', () => {
    it('delega en PlaidBankingService.createLinkToken', async () => {
      vi.mocked(PlaidBankingService.createLinkToken).mockResolvedValue({
        link_token: 'link-sandbox-abc',
        expiration: '2026-06-26T00:00:00Z',
      } as any);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.createPlaidLinkToken('user-1', 'tenant-1');

      expect(result).toEqual({
        link_token: 'link-sandbox-abc',
        expiration: '2026-06-26T00:00:00Z',
      });
      expect(PlaidBankingService.createLinkToken).toHaveBeenCalledWith('user-1', 'tenant-1');
    });
  });

  // ─── getConnections ────────────────────────────────────────────────────

  describe('getConnections', () => {
    it('retorna conexiones mapeadas con conteos', async () => {
      (prisma.bankConnection.findMany as any).mockResolvedValue([
        {
          id: 'bc-1',
          provider: 'NORDIGEN',
          bankName: 'Santander',
          status: 'ACTIVE',
          lastSync: new Date('2026-05-25T10:00:00Z'),
          institutionId: 'SANT_ES',
          _count: { transactions: 15 },
        },
        {
          id: 'bc-2',
          provider: 'PLAID',
          bankName: 'BBVA',
          status: 'ACTIVE',
          lastSync: null,
          institutionId: null,
          _count: { transactions: 8 },
        },
      ]);
      // Primer count para bc-1, segundo para bc-2
      (prisma.bankTransaction.count as any)
        .mockResolvedValueOnce(5)   // bc-1 unreconciled
        .mockResolvedValueOnce(3);  // bc-2 unreconciled

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.getConnections('tenant-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'bc-1',
        provider: 'NORDIGEN',
        bankName: 'Santander',
        status: 'ACTIVE',
        lastSync: '2026-05-25T10:00:00.000Z',
        institutionId: 'SANT_ES',
        transactionCount: 15,
        unreconciledCount: 5,
      });
      expect(result[1]).toEqual({
        id: 'bc-2',
        provider: 'PLAID',
        bankName: 'BBVA',
        status: 'ACTIVE',
        lastSync: null,
        institutionId: null,
        transactionCount: 8,
        unreconciledCount: 3,
      });
      expect(prisma.bankConnection.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        include: { _count: { select: { transactions: true } } },
      });
    });

    it('retorna arreglo vacío si no hay conexiones', async () => {
      (prisma.bankConnection.findMany as any).mockResolvedValue([]);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.getConnections('tenant-1');

      expect(result).toEqual([]);
    });
  });

  // ─── getTransactions ───────────────────────────────────────────────────

  describe('getTransactions', () => {
    const mockTx = {
      id: 'tx-1',
      bankConnectionId: 'bc-1',
      date: new Date('2026-05-20'),
      description: 'COBRO FACTURA #001',
      amount: 121,
      reference: 'REF-001',
      isReconciled: false,
      bankConnection: { bankName: 'Santander', provider: 'NORDIGEN' },
    };

    it('retorna transacciones mapeadas con total', async () => {
      (prisma.bankTransaction.findMany as any).mockResolvedValue([mockTx]);
      (prisma.bankTransaction.count as any).mockResolvedValue(1);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      const result = await ReconciliationService.getTransactions('tenant-1');

      expect(result.total).toBe(1);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toEqual({
        id: 'tx-1',
        bankConnectionId: 'bc-1',
        date: '2026-05-20T00:00:00.000Z',
        description: 'COBRO FACTURA #001',
        amount: 121,
        reference: 'REF-001',
        isReconciled: false,
        bankName: 'Santander',
        provider: 'NORDIGEN',
      });
    });

    it('filtra por connectionId', async () => {
      (prisma.bankTransaction.findMany as any).mockResolvedValue([mockTx]);
      (prisma.bankTransaction.count as any).mockResolvedValue(1);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      await ReconciliationService.getTransactions('tenant-1', { connectionId: 'bc-1' });

      expect(prisma.bankTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bankConnectionId: 'bc-1',
          }),
        })
      );
    });

    it('filtra solo no reconciliadas (unreconciledOnly)', async () => {
      (prisma.bankTransaction.findMany as any).mockResolvedValue([mockTx]);
      (prisma.bankTransaction.count as any).mockResolvedValue(1);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      await ReconciliationService.getTransactions('tenant-1', { unreconciledOnly: true });

      expect(prisma.bankTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isReconciled: false,
          }),
        })
      );
    });

    it('aplica limit y offset', async () => {
      (prisma.bankTransaction.findMany as any).mockResolvedValue([]);
      (prisma.bankTransaction.count as any).mockResolvedValue(50);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      await ReconciliationService.getTransactions('tenant-1', { limit: 10, offset: 20 });

      expect(prisma.bankTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        })
      );
    });

    it('usa valores por defecto: limit=50, offset=0', async () => {
      (prisma.bankTransaction.findMany as any).mockResolvedValue([]);
      (prisma.bankTransaction.count as any).mockResolvedValue(0);

      const { ReconciliationService } = await import('@/lib/accounting/reconciliation-service');
      await ReconciliationService.getTransactions('tenant-1');

      expect(prisma.bankTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0,
        })
      );
    });
  });
});
