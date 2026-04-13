import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isAdminRequest } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/audit/alerts
 * Lista alertas del sistema (sin resolver primero, luego resueltas).
 */
export async function GET(request: NextRequest) {
  const authResult = await isAdminRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const showResolved = url.searchParams.get('resolved') === 'true';

  const alerts = await prisma.systemAlert.findMany({
    where: showResolved ? {} : { resolved: false },
    orderBy: [{ resolved: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  });

  return NextResponse.json({ success: true, alerts });
}

/**
 * PATCH /api/admin/audit/alerts
 * Resuelve una alerta. Opcionalmente reactiva el módulo de IA.
 * 
 * Body: {
 *   alertId: string,
 *   note: string,             // Justificación obligatoria (mínimo 20 caracteres)
 *   reactivateModule?: boolean // Si true, activa el Kill Switch de vuelta
 *   auditId?: string          // ID del AuditVault para registrar la resolución
 * }
 */
export async function PATCH(request: NextRequest) {
  const authResult = await isAdminRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const body = await request.json();
  const { alertId, note, reactivateModule, auditId } = body;

  if (!alertId) {
    return NextResponse.json({ error: 'alertId es requerido' }, { status: 400 });
  }
  if (!note || note.trim().length < 20) {
    return NextResponse.json(
      { error: 'La justificación debe tener al menos 20 caracteres para el audit trail' },
      { status: 400 }
    );
  }

  const adminEmail = authResult.email || 'superadmin';
  const now = new Date();

  // Resolver la alerta
  const alert = await prisma.systemAlert.update({
    where: { id: alertId },
    data: {
      resolved: true,
      resolvedBy: adminEmail,
      resolvedAt: now,
    },
  });

  // Registrar la resolución en el AuditVault si se proporciona auditId
  if (auditId) {
    await prisma.auditVault.update({
      where: { id: auditId },
      data: {
        resolvedBy: adminEmail,
        resolvedAt: now,
        resolutionNote: note.trim(),
      },
    }).catch(() => {
      // No fallar si el auditId no existe, la alerta ya fue resuelta
    });
  }

  // Reactivar módulo si se solicita
  if (reactivateModule) {
    await prisma.aiModuleControl.upsert({
      where: { moduleKey: 'random_presence_tests' },
      update: {
        isActive: true,
        updatedBy: adminEmail,
        reason: `Reactivación manual por ${adminEmail}: ${note.trim()}`,
      },
      create: {
        moduleKey: 'random_presence_tests',
        isActive: true,
        updatedBy: adminEmail,
        reason: `Activación inicial por ${adminEmail}`,
      },
    });

    // Crear alerta informativa de reactivación
    await prisma.systemAlert.create({
      data: {
        level: 'INFO',
        message: `Módulo de Pruebas Aleatorias REACTIVADO por ${adminEmail}. Justificación: ${note.trim()}`,
      },
    });
  }

  return NextResponse.json({
    success: true,
    alert,
    moduleReactivated: !!reactivateModule,
  });
}
