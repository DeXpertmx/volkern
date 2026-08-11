export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// GET /api/configuracion/historial — Historial de cambios de configuración
// Lista los cambios registrados en AuditLog (entidad='configuracion') del tenant.
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 200));

    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        entidad: 'configuracion',
      },
      orderBy: { fechaCreacion: 'desc' },
      take: limit,
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({
      logs: logs.map(log => ({
        id: log.id,
        accion: log.accion,
        clave: log.entidadId,
        descripcion: log.descripcion,
        cambiosAntes: log.cambiosAntes,
        cambiosDespues: log.cambiosDespues,
        usuario: log.user
          ? { id: log.user.id, nombre: log.user.name, email: log.user.email }
          : null,
        fecha: log.fechaCreacion.toISOString(),
        hash: log.hash,
      })),
    });
  } catch (error) {
    console.error('Error al obtener historial de configuración:', error);
    return NextResponse.json(
      { error: 'Error al obtener historial de configuración' },
      { status: 500 }
    );
  }
}, ['config:read', 'settings:read'])
