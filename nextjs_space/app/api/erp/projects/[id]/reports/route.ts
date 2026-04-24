import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * POST /api/erp/projects/[id]/reports - Guardar reporte de auditoría actual
 */
export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id: projectId } = params;
    const body = await request.json(); // Esperamos el análisis financiero aquí

    if (!body.financials) {
      return NextResponse.json({ error: 'Datos del reporte incompletos' }, { status: 400 });
    }

    const report = await prisma.auditLog.create({
      data: {
        tenantId: auth.tenant!.id,
        userId: auth.user!.id,
        accion: 'PROJECT_AUDIT_SAVED',
        entidad: 'Project',
        entidadId: projectId,
        descripcion: `Reporte de auditoría guardado. Margen: ${body.financials.marginPercentage.toFixed(2)}%`,
        cambiosDespues: body as any
      }
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error saving project report:', error);
    return NextResponse.json({ error: 'Error al guardar el reporte' }, { status: 500 });
  }
}, ['erp:write']);

/**
 * GET /api/erp/projects/[id]/reports - Listar reportes guardados
 */
export const GET = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id: projectId } = params;

    const reports = await prisma.auditLog.findMany({
      where: {
        entidad: 'Project',
        entidadId: projectId,
        accion: 'PROJECT_AUDIT_SAVED',
        tenantId: auth.tenant!.id
      },
      orderBy: { fechaCreacion: 'desc' }
    });

    return NextResponse.json(reports);
  } catch (error) {
    console.error('Error fetching project reports:', error);
    return NextResponse.json({ error: 'Error al cargar reportes' }, { status: 500 });
  }
}, ['erp:read']);
