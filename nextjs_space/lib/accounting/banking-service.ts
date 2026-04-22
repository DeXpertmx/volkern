import { prisma } from '@/lib/db';

export class BankingService {
  /**
   * Simulates syncing transactions from a bank.
   */
  static async syncTransactions(connectionId: string) {
    const connection = await prisma.bankConnection.findUnique({
      where: { id: connectionId }
    });

    if (!connection) throw new Error('Conexión bancaria no encontrada');

    // Mock data generation
    const mockTransactions = [
      { date: new Date(), description: 'COBRO FACTURA #001', amount: 121, reference: 'REF-B-001' },
      { date: new Date(), description: 'PAGO NOMINA MARZO', amount: -2100, reference: 'REF-B-002' },
      { date: new Date(), description: 'TRANSFERENCIA RECIBIDA UNKNOWN', amount: 50, reference: 'REF-B-003' }
    ];

    const results = [];
    for (const t of mockTransactions) {
      const tx = await prisma.bankTransaction.create({
        data: {
          bankConnectionId: connectionId,
          date: t.date,
          description: t.description,
          amount: t.amount,
          reference: t.reference
        }
      });
      results.push(tx);
    }

    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: { lastSync: new Date() }
    });

    return results;
  }

  /**
   * Suggests reconciliations for a transaction based on amount and description.
   */
  static async suggestReconciliations(transactionId: string) {
    const tx = await prisma.bankTransaction.findUnique({
      where: { id: transactionId },
      include: { bankConnection: true }
    });

    if (!tx) throw new Error('Transacción no encontrada');

    // Find entries with similar amounts (within a small margin)
    const margin = 0.01;
    const entries = await prisma.accountingEntry.findMany({
      where: {
        tenantId: tx.bankConnection.tenantId,
        status: 'POSTED', // Not yet reconciled
        lines: {
          some: {
            OR: [
              { debit: { gte: Number(tx.amount) - margin, lte: Number(tx.amount) + margin } },
              { credit: { gte: Math.abs(Number(tx.amount)) - margin, lte: Math.abs(Number(tx.amount)) + margin } }
            ]
          }
        }
      },
      include: { lines: { include: { account: true } } }
    });

    return entries.map(e => {
      let score = 0.5; // Base confidence
      if (tx.description.toLowerCase().includes(e.description.toLowerCase())) score += 0.4;
      
      return {
        entry: e,
        confidence: Math.min(score, 0.99)
      };
    }).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Performs the reconciliation.
   */
  static async reconcile(transactionId: string, entryId: string, matchedBy: string = 'USER') {
    return await prisma.$transaction(async (tx) => {
      // 1. Create reconciliation record
      const recon = await tx.bankReconciliation.create({
        data: {
          transactionId,
          entryId,
          matchedBy,
          confidenceScore: 1.0
        }
      });

      // 2. Mark transaction as reconciled
      await tx.bankTransaction.update({
        where: { id: transactionId },
        data: { isReconciled: true }
      });

      // 3. Mark entry as reconciled
      await tx.accountingEntry.update({
        where: { id: entryId },
        data: { status: 'RECONCILED' }
      });

      return recon;
    });
  }
}
