import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isAdminRequest } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

const MODULE_KEY = 'random_presence_tests';

/**
 * GET /api/admin/audit/module
 * Devuelve el estado actual del Kill Switch del módulo de presencia aleatoria.
 */
export async function GET(request: NextRequest) {
  const authResult = await isAdminRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const control = await prisma.aiModuleControl.findUnique({
    where: { moduleKey: MODULE_KEY },
  });

  // Si no existe, el módulo está activo por defecto (no hay registro de bloqueo)
  return NextResponse.json({
    success: true,
    control: control ?? {
      moduleKey: MODULE_KEY,
      isActive: true,
      updatedBy: null,
      reason: null,
    },
  });
}

/**
 * PATCH /api/admin/audit/module
 * Activa o desactiva manualmente el módulo de IA con justificación obligatoria.
 * 
 * Body: { isActive: boolean, reason: string }
 */
export async function PATCH(request: NextRequest) {
  const authResult = await isAdminRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const body = await request.json();
  const { isActive, reason } = body;

  if (typeof isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive (boolean) es requerido' }, { status: 400 });
  }
  if (!reason || reason.trim().length < 10) {
    return NextResponse.json(
      { error: 'La justificación debe tener al menos 10 caracteres' },
      { status: 400 }
    );
  }

  const adminEmail = authResult.email || 'superadmin';

  const control = await prisma.aiModuleControl.upsert({
    where: { moduleKey: MODULE_KEY },
    update: {
      isActive,
      updatedBy: adminEmail,
      reason: reason.trim(),
    },
    create: {
      moduleKey: MODULE_KEY,
      isActive,
      updatedBy: adminEmail,
      reason: reason.trim(),
    },
  });

  // Registrar la acción en el log de alertas para trazabilidad
  await prisma.systemAlert.create({
    data: {
      level: isActive ? 'INFO' : 'WARNING',
      message: `Módulo "${MODULE_KEY}" ${isActive ? 'ACTIVADO' : 'DESACTIVADO'} manualmente por ${adminEmail}. Razón: ${reason.trim()}`,
    },
  });

  return NextResponse.json({ success: true, control });
}
