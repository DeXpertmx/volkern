import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { entryId, transactionId, matchedBy, confidenceScore = 0.95 } = await request.json();

  if (!entryId || !transactionId || !matchedBy) {
    return NextResponse.json({ error: 'Faltan parámetros.' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear relación de conciliación
      const recon = await tx.bankReconciliation.create({
        data: {
          entryId,
          transactionId,
          matchedBy,
          confidenceScore,
        },
      });

      // 2. Marcar transacción como reconciliada
      await tx.bankTransaction.update({
        where: { id: transactionId },
        data: { isReconciled: true },
      });

      // 3. Marcar asiento como reconciliado
      await tx.accountingEntry.update({
        where: { id: entryId },
        data: { status: 'RECONCILED' },
      });

      return recon;
    });

    return NextResponse.json({ success: true, reconciliationId: result.id });
  } catch (error: any) {
    console.error('[Reconciliation] Error al aceptar:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
