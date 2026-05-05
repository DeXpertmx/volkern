import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const dynamic = 'force-dynamic';

/**
 * API: Cadena de Integridad (Veri*factu + VISION-LOCK)
 * Retorna los últimos 50 registros financieros con sus hashes y geolocalización.
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // 1. Obtener Facturas (Invoices)
    const invoices = await prisma.invoice.findMany({
      where: { tenantId, verifactuVersion: 2 },
      orderBy: { sequenceNumber: 'desc' },
      take: 25,
      select: {
        id: true,
        numero: true,
        monto: true,
        fechaEmision: true,
        fingerprint: true,
        parentFingerprint: true,
        verifactuVersion: true
      }
    });

    // 2. Obtener Gastos (Expenses)
    const expenses = await prisma.expense.findMany({
      where: { tenantId },
      orderBy: { date: 'desc' },
      take: 25,
      select: {
        id: true,
        description: true,
        amount: true,
        date: true,
        fingerprint: true,
        parentFingerprint: true,
        exifLat: true,
        exifLng: true,
        isAnomaly: true,
        verificationStatus: true
      }
    });

    // 3. Unificar y ordenar por fecha descendente
    const chain = [
      ...invoices.map(inv => ({
        id: inv.id,
        type: 'INVOICE',
        title: inv.numero,
        amount: inv.monto,
        date: inv.fechaEmision,
        fingerprint: inv.fingerprint,
        parentFingerprint: inv.parentFingerprint,
        lat: null,
        lng: null,
        isAnomaly: false
      })),
      ...expenses.map(exp => ({
        id: exp.id,
        type: 'EXPENSE',
        title: exp.description,
        amount: exp.amount,
        date: exp.date,
        fingerprint: exp.fingerprint,
        parentFingerprint: exp.parentFingerprint,
        lat: exp.exifLat,
        lng: exp.exifLng,
        isAnomaly: exp.isAnomaly || exp.verificationStatus === 'REJECTED'
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      success: true,
      chain,
      meta: {
        tenantId,
        totalChecked: chain.length
      }
    });

  } catch (error: any) {
    console.error('[IntegrityChainAPI] Error:', error);
    return NextResponse.json({ error: 'Error al obtener la cadena de integridad' }, { status: 500 });
  }
});
