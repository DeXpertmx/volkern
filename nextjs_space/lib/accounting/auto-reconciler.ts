import { prisma } from '@/lib/db';

export interface MatchSuggestion {
  entryId: string;
  transactionId: string;
  confidence: number; // 0.0 a 1.0
  reason: string;
  entry?: any;
  transaction?: any;
}

/**
 * Concilia automáticamente movimientos bancarios con asientos contables
 */
export class AutoReconciler {
  static async getSuggestions(tenantId: string): Promise<MatchSuggestion[]> {
    const suggestions: MatchSuggestion[] = [];

    // 1. Obtener transacciones sin conciliar
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        bankConnection: { tenantId },
        isReconciled: false,
      },
      include: { bankConnection: true }
    });

    // 2. Obtener asientos sin conciliar (que no tengan registros en BankReconciliation)
    const entries = await prisma.accountingEntry.findMany({
      where: {
        tenantId,
        status: 'POSTED',
        reconciliations: { none: {} },
      },
      include: { lines: { include: { account: true } } },
    });

    for (const txn of transactions) {
      for (const entry of entries) {
        const match = this.calculateMatchConfidence(txn, entry);
        if (match.confidence > 0.7) { // Bajamos un poco el umbral para mostrar más opciones
          suggestions.push({
            entryId: entry.id,
            transactionId: txn.id,
            confidence: match.confidence,
            reason: match.reason,
            entry,
            transaction: txn
          });
        }
      }
    }

    // Ordenar por confianza descendente
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calcula la confianza de un match entre transacción y asiento
   */
  private static calculateMatchConfidence(
    transaction: any,
    entry: any
  ): { confidence: number; reason: string } {
    let confidence = 0;
    const reasons: string[] = [];

    // A. Coincidencia exacta de importe
    // Sumamos las líneas del asiento (Debe - Haber)
    const entryTotal = entry.lines.reduce((sum: number, line: any) => sum + (Number(line.debit) - Number(line.credit)), 0);
    
    // El importe del banco puede ser positivo (cobro) o negativo (pago)
    // Comparamos el valor absoluto si el signo coincide con la naturaleza del asiento
    if (Math.abs(Number(transaction.amount) - entryTotal) < 0.01) {
      confidence += 0.4;
      reasons.push('Importe exacto');
    } else if (Math.abs(Math.abs(Number(transaction.amount)) - Math.abs(entryTotal)) < 0.01) {
       // Si el importe coincide en valor absoluto pero no en signo, damos menos confianza
       confidence += 0.2;
       reasons.push('Importe coincide en valor absoluto');
    }

    // B. Coincidencia de fecha (±5 días)
    const txDate = new Date(transaction.date);
    const entryDate = new Date(entry.date);
    const diffTime = Math.abs(txDate.getTime() - entryDate.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    
    if (diffDays <= 1) {
      confidence += 0.3;
      reasons.push('Fecha muy cercana (±1 día)');
    } else if (diffDays <= 5) {
      confidence += 0.15;
      reasons.push('Fecha cercana (±5 días)');
    }

    // C. Coincidencia parcial de descripción
    const txDesc = transaction.description.toLowerCase();
    const entryDesc = entry.description.toLowerCase();
    
    if (entryDesc.includes(txDesc) || txDesc.includes(entryDesc)) {
      confidence += 0.3;
      reasons.push('Descripción similar');
    } else {
       // Buscar palabras clave comunes (ej: número de factura)
       const txWords = txDesc.split(/\s+/).filter((w: string) => w.length > 3);
       const entryWords = entryDesc.split(/\s+/).filter((w: string) => w.length > 3);
       const commonWords = txWords.filter((w: string) => entryWords.includes(w));
       
       if (commonWords.length > 0) {
         confidence += 0.15;
         reasons.push(`Palabras comunes: ${commonWords.join(', ')}`);
       }
    }

    return {
      confidence: Math.min(confidence, 1),
      reason: reasons.join(', '),
    };
  }
}
