
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * PATCH /api/equality/complaints/[id] - Actualizar estado y notas de resolución
 */
export const PATCH = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const { id } = params;
    const body = await request.json();
    const { status, resolutionNote } = body;

    // Verificar si el usuario es el responsable configurado
    const config = await prisma.equalityConfig.findUnique({
      where: { tenantId }
    });

    if (config?.responsibleId !== userId && auth.user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const updated = await prisma.equalityComplaint.update({
      where: { id, tenantId },
      data: {
        status,
        resolutionNote,
        // El resto de campos son INMUTABLES y no se tocan aquí
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  }
}, ['compliance:write']);
