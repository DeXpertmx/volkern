import { prisma } from '@/lib/db';
import { BankingService } from './banking-service';
import { AutoReconciler, type MatchSuggestion } from './auto-reconciler';
import { NordigenService } from '@/lib/banking/nordigen-service';
import { PlaidBankingService } from '@/lib/banking/plaid-banking-service';
import { StripeBankingService } from '@/lib/banking/stripe-banking-service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectionWithStatus {
  id: string;
  provider: string;
  bankName: string;
  status: string;
  lastSync: string | null;
  institutionId: string | null;
  transactionCount: number;
  unreconciledCount: number;
}

export interface TransactionWithConnection {
  id: string;
  bankConnectionId: string;
  date: string;
  description: string;
  amount: number;
  reference: string | null;
  isReconciled: boolean;
  bankName: string;
  provider: string;
}

export interface SyncResult {
  success: boolean;
  count: number;
  error?: string;
}

// ─── Orchestration Service ────────────────────────────────────────────────────

export class ReconciliationService {

  // ─── Connections ──────────────────────────────────────────────────────────

  /**
   * Lista todas las conexiones bancarias de un tenant con métricas
   */
  static async getConnections(tenantId: string): Promise<ConnectionWithStatus[]> {
    const connections = await prisma.bankConnection.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: {
            transactions: true,
          },
        },
      },
    });

    return Promise.all(
      connections.map(async (conn) => {
        const unreconciledCount = await prisma.bankTransaction.count({
          where: {
            bankConnectionId: conn.id,
            isReconciled: false,
          },
        });

        return {
          id: conn.id,
          provider: conn.provider,
          bankName: conn.bankName,
          status: conn.status,
          lastSync: conn.lastSync?.toISOString() ?? null,
          institutionId: conn.institutionId ?? null,
          transactionCount: conn._count.transactions,
          unreconciledCount,
        };
      })
    );
  }

  /**
   * Crea una nueva conexión bancaria
   * Soporta: NORDIGEN (GoCardless), PLAID, STRIPE Financial Connections
   */
  static async createConnection(tenantId: string, data: {
    provider: string;
    providerId?: string;
    publicToken?: string;
    institutionId?: string;
    institutionName?: string;
  }) {
    const { provider, providerId, publicToken, institutionId, institutionName } = data;

    switch (provider) {
      case 'PLAID': {
        if (!publicToken) {
          throw new Error('publicToken requerido para Plaid');
        }
        const metadata = {
          institution: {
            institution_id: institutionId || 'plaid_default',
            name: institutionName || 'Banco (Plaid)',
          },
        };
        return await PlaidBankingService.exchangePublicToken(publicToken, tenantId, metadata);
      }

      case 'STRIPE': {
        const session = await StripeBankingService.createConnectSession(tenantId);
        return { sessionId: session.id, url: (session as any).url || null };
      }

      case 'NORDIGEN': {
        if (!providerId) {
          throw new Error('providerId requerido para Nordigen/GoCardless');
        }
        const connection = await prisma.bankConnection.create({
          data: {
            tenantId,
            provider: 'NORDIGEN',
            providerId,
            bankName: institutionName || 'Banco (Nordigen)',
            institutionId: institutionId || providerId,
            status: 'ACTIVE',
          },
        });
        return connection;
      }

      default:
        throw new Error(`Proveedor no soportado: ${provider}`);
    }
  }

  /**
   * Elimina una conexión bancaria
   */
  static async deleteConnection(connectionId: string, tenantId: string) {
    const conn = await prisma.bankConnection.findFirst({
      where: { id: connectionId, tenantId },
    });
    if (!conn) throw new Error('Conexión no encontrada');

    await prisma.bankConnection.delete({ where: { id: connectionId } });
    return { success: true };
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  /**
   * Obtiene transacciones bancarias con filtros opcionales
   */
  static async getTransactions(
    tenantId: string,
    options?: {
      connectionId?: string;
      unreconciledOnly?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ transactions: TransactionWithConnection[]; total: number }> {
    const where: any = {
      bankConnection: { tenantId },
    };

    if (options?.connectionId) {
      where.bankConnectionId = options.connectionId;
    }
    if (options?.unreconciledOnly) {
      where.isReconciled = false;
    }

    const [transactions, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        orderBy: { date: 'desc' },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
        include: {
          bankConnection: {
            select: { bankName: true, provider: true },
          },
        },
      }),
      prisma.bankTransaction.count({ where }),
    ]);

    return {
      transactions: transactions.map((tx) => ({
        id: tx.id,
        bankConnectionId: tx.bankConnectionId,
        date: tx.date.toISOString(),
        description: tx.description,
        amount: Number(tx.amount),
        reference: tx.reference,
        isReconciled: tx.isReconciled,
        bankName: tx.bankConnection.bankName,
        provider: tx.bankConnection.provider,
      })),
      total,
    };
  }

  // ─── Sync ─────────────────────────────────────────────────────────────────

  /**
   * Sincroniza transacciones de una conexión usando el proveedor adecuado
   */
  static async syncTransactions(connectionId: string): Promise<SyncResult> {
    const connection = await prisma.bankConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      return { success: false, count: 0, error: 'Conexión no encontrada' };
    }

    switch (connection.provider) {
      case 'NORDIGEN': {
        const result = await NordigenService.syncTransactions(connectionId);
        return {
          success: result.success,
          count: 'count' in result ? (result as any).count : 0,
          error: 'error' in result ? (result as any).error : undefined,
        };
      }

      case 'PLAID': {
        try {
          const count = await PlaidBankingService.syncTransactions(connectionId);
          return { success: true, count };
        } catch (error: any) {
          return { success: false, count: 0, error: error.message };
        }
      }

      case 'STRIPE': {
        try {
          const txns = await StripeBankingService.syncTransactions(connectionId);
          return { success: true, count: txns.length };
        } catch (error: any) {
          return { success: false, count: 0, error: error.message };
        }
      }

      default: {
        // Fallback: usar el BankingService mock
        try {
          const txns = await BankingService.syncTransactions(connectionId);
          return { success: true, count: txns.length };
        } catch (error: any) {
          return { success: false, count: 0, error: error.message };
        }
      }
    }
  }

  /**
   * Sincroniza TODAS las conexiones activas de un tenant
   */
  static async syncAllConnections(tenantId: string): Promise<SyncResult[]> {
    const connections = await prisma.bankConnection.findMany({
      where: { tenantId, status: 'ACTIVE' },
    });

    const results: SyncResult[] = [];
    for (const conn of connections) {
      const result = await this.syncTransactions(conn.id);
      results.push(result);
    }

    return results;
  }

  // ─── Auto-Matching (IA) ───────────────────────────────────────────────────

  /**
   * Obtiene sugerencias de match entre transacciones bancarias y asientos contables
   * usando el AutoReconciler con algoritmo de confianza multi-factor
   */
  static async getMatchSuggestions(
    tenantId: string,
    options?: {
      minConfidence?: number;
      connectionId?: string;
      limit?: number;
    }
  ): Promise<MatchSuggestion[]> {
    let suggestions = await AutoReconciler.getSuggestions(tenantId);

    // Filtrar por conexión específica si se pide
    if (options?.connectionId) {
      suggestions = suggestions.filter(
        (s) => s.transaction?.bankConnectionId === options.connectionId
      );
    }

    // Filtrar por confianza mínima
    const minConf = options?.minConfidence ?? 0.5;
    suggestions = suggestions.filter((s) => s.confidence >= minConf);

    // Limitar resultados
    if (options?.limit && suggestions.length > options.limit) {
      suggestions = suggestions.slice(0, options.limit);
    }

    return suggestions;
  }

  // ─── Reconcile ────────────────────────────────────────────────────────────

  /**
   * Ejecuta la reconciliación entre una transacción bancaria y un asiento contable
   */
  static async reconcile(
    transactionId: string,
    entryId: string,
    matchedBy: string = 'USER'
  ) {
    return await BankingService.reconcile(transactionId, entryId, matchedBy);
  }

  /**
   * Reconciliación masiva (varios pares transacción-asiento en una transacción DB)
   */
  static async bulkReconcile(
    matches: Array<{ transactionId: string; entryId: string }>,
    matchedBy: string = 'BULK'
  ) {
    const results = [];

    for (const match of matches) {
      try {
        const recon = await BankingService.reconcile(
          match.transactionId,
          match.entryId,
          matchedBy
        );
        results.push({ transactionId: match.transactionId, success: true, recon });
      } catch (error: any) {
        results.push({
          transactionId: match.transactionId,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  // ─── Stats / Dashboard ────────────────────────────────────────────────────

  /**
   * Estadísticas de conciliación para el dashboard contable
   */
  static async getStats(tenantId: string) {
    const [
      totalConnections,
      totalTransactions,
      reconciledCount,
      unreconciledCount,
      todayCount,
    ] = await Promise.all([
      prisma.bankConnection.count({ where: { tenantId } }),
      prisma.bankTransaction.count({
        where: { bankConnection: { tenantId } },
      }),
      prisma.bankTransaction.count({
        where: { bankConnection: { tenantId }, isReconciled: true },
      }),
      prisma.bankTransaction.count({
        where: { bankConnection: { tenantId }, isReconciled: false },
      }),
      prisma.bankReconciliation.count({
        where: {
          transaction: { bankConnection: { tenantId } },
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    return {
      totalConnections,
      totalTransactions,
      reconciledCount,
      unreconciledCount,
      reconciliationRate:
        totalTransactions > 0
          ? Math.round((reconciledCount / totalTransactions) * 100)
          : 0,
      todayReconciliations: todayCount,
    };
  }

  /**
   * Genera un link token para Plaid Link (frontend embebido)
   */
  static async createPlaidLinkToken(userId: string, tenantId: string) {
    return await PlaidBankingService.createLinkToken(userId, tenantId);
  }

  /**
   * Procesa el callback de Stripe Financial Connections
   */
  static async handleStripeCallback(tenantId: string, sessionId: string) {
    return await StripeBankingService.handleSessionCallback(tenantId, sessionId);
  }
}
