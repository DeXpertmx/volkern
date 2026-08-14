export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/compliance/alerts/config
 * Obtiene la configuración de umbrales de alertas del tenant
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Sin tenant' }, { status: 403 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { configuracion: true },
    });

    const config = (tenant?.configuracion as Record<string, any>) || {};
    const alertConfig = config.alertThresholds || {
      contratosPendientesDias: 7,
      cotizacionesBorradorDias: 14,
      dealsEstancadosDias: 30,
      tareasPendientesDias: 7,
      aprobacionesPendientesDias: 5,
      eliminacionesMasivasUmbral: 10,
      cambiosUsuariosUmbral: 3,
      cierresRapidosHoras: 1,
      cierresRapidosCantidad: 3,
    };

    return NextResponse.json({ success: true, config: alertConfig });
  } catch (error: any) {
    console.error('[AlertsConfig GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/compliance/alerts/config
 * Guarda la configuración de umbrales de alertas
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Sin tenant' }, { status: 403 });
    }

    const body = await request.json();

    // Validar campos requeridos
    const requiredFields = [
      'contratosPendientesDias',
      'cotizacionesBorradorDias',
      'dealsEstancadosDias',
      'tareasPendientesDias',
      'aprobacionesPendientesDias',
      'eliminacionesMasivasUmbral',
      'cambiosUsuariosUmbral',
      'cierresRapidosHoras',
      'cierresRapidosCantidad',
    ];

    for (const field of requiredFields) {
      if (typeof body[field] !== 'number' || body[field] <= 0) {
        return NextResponse.json(
          { error: `Campo inválido: ${field} debe ser un número positivo` },
          { status: 400 }
        );
      }
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { configuracion: true },
    });

    const config = (tenant?.configuracion as Record<string, any>) || {};
    config.alertThresholds = {
      contratosPendientesDias: body.contratosPendientesDias,
      cotizacionesBorradorDias: body.cotizacionesBorradorDias,
      dealsEstancadosDias: body.dealsEstancadosDias,
      tareasPendientesDias: body.tareasPendientesDias,
      aprobacionesPendientesDias: body.aprobacionesPendientesDias,
      eliminacionesMasivasUmbral: body.eliminacionesMasivasUmbral,
      cambiosUsuariosUmbral: body.cambiosUsuariosUmbral,
      cierresRapidosHoras: body.cierresRapidosHoras,
      cierresRapidosCantidad: body.cierresRapidosCantidad,
    };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { configuracion: config },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: (session.user as any).id || null,
        accion: 'ALERT_THRESHOLD_UPDATED',
        entidad: 'Tenant',
        entidadId: tenantId,
        descripcion: 'Umbrales de alertas de compliance actualizados',
        metadata: config.alertThresholds,
      },
    });

    return NextResponse.json({ success: true, config: config.alertThresholds });
  } catch (error: any) {
    console.error('[AlertsConfig PUT] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
