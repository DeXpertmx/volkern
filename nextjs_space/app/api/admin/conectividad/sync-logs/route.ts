export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

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

// GET /api/admin/conectividad/sync-logs — historial de pushes (plan §29)
// Filtros: ?tenantId=&tipo=inventory|rates&estado=exito|error&limit=
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const tipo = searchParams.get('tipo');
    const estado = searchParams.get('estado');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50') || 50, 200);

    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (tipo === 'inventory' || tipo === 'rates') where.tipo = tipo;
    if (estado === 'exito' || estado === 'error') where.estado = estado;

    const logs = await prisma.hospitalitySyncLog.findMany({
      where,
      include: {
        tenant: { select: { id: true, nombre: true } },
        property: { select: { id: true, nombre: true } },
      },
      orderBy: { fechaCreacion: 'desc' },
      take: limit,
    });

    // Nunca exponer payloads de petición (pueden contener datos de negocio
    // sensibles): solo resumen y respuesta externa acotada.
    const safe = logs.map((l) => ({
      id: l.id,
      tenant: l.tenant?.nombre || l.tenantId,
      property: l.property?.nombre || null,
      tipo: l.tipo,
      operacion: l.operacion,
      estado: l.estado,
      httpStatus: l.httpStatus,
      errorMensaje: l.errorMensaje,
      duracionMs: l.duracionMs,
      fechaCreacion: l.fechaCreacion,
      responseSummary:
        l.responseBody && typeof l.responseBody === 'object'
          ? {
              success: (l.responseBody as any).success,
              message: (l.responseBody as any).message,
            }
          : undefined,
    }));

    return NextResponse.json({ logs: safe });
  } catch (error) {
    console.error('Error obteniendo logs de sincronización:', error);
    return NextResponse.json({ error: 'Error al obtener logs' }, { status: 500 });
  }
}