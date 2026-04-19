import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/academy/paths
 * Obtiene las rutas de carrera disponibles.
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const paths = await prisma.academyPath.findMany({
      where: {
        OR: [
          { tenantId: tenantId },
          { tenantId: null } // Rutas globales/base
        ]
      },
      include: {
        cursos: {
          select: {
            id: true,
            titulo: true,
            nivel: true,
            duracionEstimadaHoras: true
          }
        }
      }
    });

    return NextResponse.json(paths);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['erp:read']);
