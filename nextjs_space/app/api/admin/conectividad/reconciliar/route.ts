export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { runReconciliation } from '@/lib/hospitality/reconciliation';

async function requireSuperadmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });
  if (!user || user.role?.nombre !== 'Superadmin') {
    return { error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) };
  }
  return { user };
}

// POST /api/admin/conectividad/reconciliar
// Body: { tenantId?, dias?, cancelarAusentes? }
// Sin tenantId reconcilia TODOS los tenants con propiedades mapeadas.
// `cancelarAusentes` (default false): cancela reservas internas activas que
// el proveedor ya no reporta — conservador por defecto (plan §14).
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const tenantId = body.tenantId || undefined;
    const dias = Math.min(Math.max(parseInt(body.dias) || 30, 1), 365);
    const cancelarAusentes = body.cancelarAusentes === true;

    // Sin tenantId: recopilar todos los tenants con mapping activo.
    let tenants: string[];
    if (tenantId) {
      tenants = [tenantId];
    } else {
      const props = await prisma.hospitalityProperty.findMany({
        where: { mappings: { some: { provider: 'channel_connectivity', estado: 'activo' } } },
        select: { tenantId: true },
        distinct: ['tenantId'],
      });
      tenants = props.map((p) => p.tenantId);
    }

    if (tenants.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No hay propiedades con mapping de conectividad activo para reconciliar.',
        resumenes: [],
      });
    }

    const resumenes = [];
    for (const tid of tenants) {
      const resumen = await runReconciliation({ tenantId: tid, dias, cancelarAusentes });
      resumenes.push({ tenantId: tid, ...resumen });
    }

    const totalCreadas = resumenes.reduce((a, r) => a + r.creadas, 0);
    const totalActualizadas = resumenes.reduce((a, r) => a + r.actualizadas, 0);
    const totalCanceladas = resumenes.reduce((a, r) => a + r.canceladas, 0);
    const totalDivergencias = resumenes.reduce((a, r) => a + r.divergencias, 0);
    const errores = resumenes.flatMap((r) => r.errores || []);

    return NextResponse.json({
      ok: errores.length === 0,
      message: `Reconciliación completada: ${totalCreadas} creadas, ${totalActualizadas} actualizadas, ${totalCanceladas} canceladas, ${totalDivergencias} divergencias.`,
      totalCreadas,
      totalActualizadas,
      totalCanceladas,
      totalDivergencias,
      errores,
      resumenes,
    });
  } catch (error) {
    console.error('Error en reconciliación:', error);
    return NextResponse.json({ error: 'Error al ejecutar la reconciliación' }, { status: 500 });
  }
}