export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// ─── GET /api/accounting/reconciliation/[id] ──────────────────────────────────

export const GET = withTenantAuth(async (request, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
  if (auth.user?.accountType !== 'AGENCY' && !isSuperadmin) {
    return NextResponse.json({ error: 'Solo disponible para cuentas de Asesoría o Administradores' }, { status: 403 });
  }

  const tenantId = auth.tenant!.id;
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop()!;
  const type = url.searchParams.get('type') || 'transaction';

  try {
    if (type === 'connection') {
      // Detalle de conexión bancaria
      const connection = await prisma.bankConnection.findFirst({
        where: { id, tenantId },
        include: {
          _count: { select: { transactions: true } },
          transactions: {
            orderBy: { date: 'desc' },
            take: 10,
          },
        },
      });

      if (!connection) {
        return NextResponse.json({ error: 'Conexión no encontrada' }, { status: 404 });
      }

      return NextResponse.json({
        id: connection.id,
        provider: connection.provider,
        bankName: connection.bankName,
        status: connection.status,
        lastSync: connection.lastSync?.toISOString() ?? null,
        institutionId: connection.institutionId,
        transactionCount: connection._count.transactions,
        recentTransactions: connection.transactions.map((tx) => ({
          id: tx.id,
          date: tx.date.toISOString(),
          description: tx.description,
          amount: Number(tx.amount),
          isReconciled: tx.isReconciled,
        })),
      });
    }

    // Detalle de transacción bancaria
    const transaction = await prisma.bankTransaction.findFirst({
      where: { id, bankConnection: { tenantId } },
      include: {
        bankConnection: {
          select: { bankName: true, provider: true },
        },
        reconciliations: {
          include: {
            entry: {
              include: {
                lines: { include: { account: true } },
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 });
    }

    return NextResponse.json({
      id: transaction.id,
      bankName: transaction.bankConnection.bankName,
      provider: transaction.bankConnection.provider,
      date: transaction.date.toISOString(),
      description: transaction.description,
      amount: Number(transaction.amount),
      reference: transaction.reference,
      isReconciled: transaction.isReconciled,
      reconciliations: transaction.reconciliations.map((r) => ({
        id: r.id,
        matchedBy: r.matchedBy,
        confidenceScore: r.confidenceScore ? Number(r.confidenceScore) : null,
        createdAt: r.createdAt.toISOString(),
        entry: {
          id: r.entry.id,
          description: r.entry.description,
          date: r.entry.date.toISOString(),
          reference: r.entry.reference,
          status: r.entry.status,
          lines: r.entry.lines.map((l) => ({
            accountName: l.account?.name || '',
            debit: Number(l.debit),
            credit: Number(l.credit),
          })),
        },
      })),
    });
  } catch (error: any) {
    console.error('[Reconciliation GET:id] Error:', error);
    return NextResponse.json({ error: 'Error al obtener detalle' }, { status: 500 });
  }
});

// ─── PATCH /api/accounting/reconciliation/[id] ────────────────────────────────

export const PATCH = withTenantAuth(async (request, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
  if (auth.user?.accountType !== 'AGENCY' && !isSuperadmin) {
    return NextResponse.json({ error: 'Solo disponible para cuentas de Asesoría o Administradores' }, { status: 403 });
  }

  const tenantId = auth.tenant!.id;
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop()!;

  try {
    const body = await request.json();
    const { isReconciled } = body;

    if (isReconciled === false) {
      // Marcar transacción como no reconciliada (deshacer)
      const transaction = await prisma.bankTransaction.findFirst({
        where: { id, bankConnection: { tenantId } },
      });
      if (!transaction) {
        return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 });
      }

      // Leer reconciliaciones ANTES de eliminar
      const reconciliations = await prisma.bankReconciliation.findMany({
        where: { transactionId: id },
      });

      // Restaurar asientos contables a POSTED
      for (const r of reconciliations) {
        await prisma.accountingEntry.update({
          where: { id: r.entryId },
          data: { status: 'POSTED' },
        });
      }

      // Eliminar reconciliaciones (después de leer los entryIds)
      await prisma.bankReconciliation.deleteMany({
        where: { transactionId: id },
      });

      // Marcar transacción
      await prisma.bankTransaction.update({
        where: { id },
        data: { isReconciled: false },
      });

      return NextResponse.json({ success: true, isReconciled: false });
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (error: any) {
    console.error('[Reconciliation PATCH:id] Error:', error);
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  }
});

// ─── DELETE /api/accounting/reconciliation/[id] ───────────────────────────────

export const DELETE = withTenantAuth(async (request, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
  if (auth.user?.accountType !== 'AGENCY' && !isSuperadmin) {
    return NextResponse.json({ error: 'Solo disponible para cuentas de Asesoría o Administradores' }, { status: 403 });
  }

  const tenantId = auth.tenant!.id;
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop()!;
  const type = url.searchParams.get('type') || 'transaction';

  try {
    if (type === 'connection') {
      // Eliminar conexión bancaria (cascade elimina transacciones y reconciliaciones)
      const conn = await prisma.bankConnection.findFirst({
        where: { id, tenantId },
      });
      if (!conn) {
        return NextResponse.json({ error: 'Conexión no encontrada' }, { status: 404 });
      }
      await prisma.bankConnection.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    // Eliminar reconciliación específica
    const recon = await prisma.bankReconciliation.findFirst({
      where: { id, transaction: { bankConnection: { tenantId } } },
    });
    if (!recon) {
      return NextResponse.json({ error: 'Reconciliación no encontrada' }, { status: 404 });
    }

    await prisma.bankReconciliation.delete({ where: { id: recon.id } });

    // Si no quedan reconciliaciones, marcar transacción como no reconciliada
    const remaining = await prisma.bankReconciliation.count({
      where: { transactionId: recon.transactionId },
    });
    if (remaining === 0) {
      await prisma.bankTransaction.update({
        where: { id: recon.transactionId },
        data: { isReconciled: false },
      });
      await prisma.accountingEntry.update({
        where: { id: recon.entryId },
        data: { status: 'POSTED' },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Reconciliation DELETE:id] Error:', error);
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
  }
});
