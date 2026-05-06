export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { ExpenseIntegrityService } from '@/lib/finance/expense-integrity';

/**
 * POST /api/v1/finance/verify-expense
 * Core de validación Veri*factu y VISION-LOCK.
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const { expenseId, action, metadata } = body;

    if (!expenseId || !action) {
      return NextResponse.json({ error: 'expenseId y action son requeridos' }, { status: 400 });
    }

    // 1. Obtener el gasto actual
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId, tenantId: auth.tenant!.id },
      include: { tenant: true }
    });

    if (!expense) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    }

    if (action === 'REJECT') {
      const updated = await prisma.expense.update({
        where: { id: expenseId },
        data: { 
          verificationStatus: 'REJECTED',
          metadata: { 
            ...(expense.metadata as any || {}),
            rejectionComments: metadata?.comments 
          }
        }
      });
      return NextResponse.json(updated);
    }

    if (action === 'VALIDATE') {
      // 2. Verificación VISION-LOCK (Geolocalización)
      const { isAnomaly, distance } = ExpenseIntegrityService.checkLocationAnomaly(
        expense.exifLat,
        expense.exifLng,
        expense.tenant.baseLatitude,
        expense.tenant.baseLongitude
      );

      // Si hay anomalía y no se ha marcado overrideLocation, solicitamos revisión
      if (isAnomaly && !metadata?.overrideLocation) {
        const updated = await prisma.expense.update({
          where: { id: expenseId },
          data: { 
            verificationStatus: 'REQUIRES_REVIEW',
            isAnomaly: true,
            metadata: {
              ...(expense.metadata as any || {}),
              anomalyDistance: distance,
              validationComments: metadata?.comments
            }
          }
        });
        return NextResponse.json({ 
          status: 'WARNING', 
          message: 'Anomalía de ubicación detectada. Revisión requerida.',
          expense: updated 
        });
      }

      // 3. Veri*factu: Encadenamiento de Hash
      // Buscar el último gasto validado para obtener el parentFingerprint
      const lastValidated = await prisma.expense.findFirst({
        where: { 
          tenantId: auth.tenant!.id, 
          verificationStatus: 'VALIDATED',
          id: { not: expenseId } 
        },
        orderBy: { createdAt: 'desc' },
        select: { fingerprint: true }
      });

      const parentFingerprint = lastValidated?.fingerprint || null;

      // Calcular nuevo fingerprint SHA-256(ID + Amount + parentFingerprint)
      const fingerprint = ExpenseIntegrityService.calculateFingerprint({
        id: expense.id,
        amount: expense.amount,
        createdById: expense.createdById,
        parentFingerprint
      });

      // 4. Sellar el gasto
      const updated = await prisma.expense.update({
        where: { id: expenseId },
        data: {
          fingerprint,
          parentFingerprint,
          verificationStatus: 'VALIDATED',
          isAnomaly: isAnomaly,
          metadata: {
            ...(expense.metadata as any || {}),
            validatedAt: new Date().toISOString(),
            validationComments: metadata?.comments,
            distanceAtValidation: distance
          }
        }
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  } catch (error) {
    console.error('[VerifyExpenseAPI] Fatal Error:', error);
    return NextResponse.json({ error: 'Error interno de validación' }, { status: 500 });
  }
}, ['erp:write']);
