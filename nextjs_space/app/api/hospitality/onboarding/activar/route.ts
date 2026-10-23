export const dynamic = 'force-dynamic';

/**
 * POST /api/hospitality/onboarding/activar — paso 10 de §31.
 *
 * Marca la propiedad como conectada. El servidor revalida los requisitos
 * reales (unidades con tarifa, conectividad, mapping completo y las tres
 * pruebas en éxito): la UI no puede saltarse pasos. Entre ellos está el
 * peaje de revisión: si hay vínculos automáticos `pendiente_revision`, la
 * activación se bloquea hasta que el operador los coteje en el paso 6.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { loadOnboardingSnapshot } from '@/lib/hospitality/onboarding-status';
import { estaConectada } from '@/lib/hospitality/onboarding';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'integraciones.gestionar');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const propertyId = typeof body?.propertyId === 'string' ? body.propertyId.trim() : '';
    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId es requerido' }, { status: 400 });
    }

    const resultado = await loadOnboardingSnapshot(tenantId, propertyId);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }

    const { snapshot } = resultado;
    if (estaConectada(snapshot.propiedad.estado)) {
      return NextResponse.json({ ok: true, yaConectada: true, onboarding: snapshot });
    }

    if (!snapshot.puedeActivar.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Aún no se cumplen los requisitos para conectar la propiedad',
          faltantes: snapshot.puedeActivar.faltantes,
        },
        { status: 400 }
      );
    }

    await prisma.hospitalityProperty.update({
      where: { id: propertyId },
      data: { estado: 'conectada' },
    });

    await logAuditAction(
      auth.user!.id,
      tenantId,
      'actualizar',
      'hospitality_property',
      propertyId,
      `Propiedad "${snapshot.propiedad.nombre}" marcada como conectada tras completar el onboarding`
    ).catch(() => {});

    const actualizado = await loadOnboardingSnapshot(tenantId, propertyId);
    return NextResponse.json({
      ok: true,
      estado: 'conectada',
      onboarding: actualizado.ok ? actualizado.snapshot : snapshot,
    });
  } catch (error) {
    console.error('Error activando la propiedad:', error);
    return NextResponse.json({ error: 'Error al activar la propiedad' }, { status: 500 });
  }
}
