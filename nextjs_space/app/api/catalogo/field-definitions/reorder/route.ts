export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

/**
 * POST /api/catalogo/field-definitions/reorder
 * Reordena las definiciones de campos
 * 
 * Body: { orderedIds: ['id1', 'id2', 'id3', ...] }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, ['catalogo:write']);
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { orderedIds } = body;

    if (!orderedIds || !Array.isArray(orderedIds)) {
      return NextResponse.json(
        { error: 'orderedIds es requerido y debe ser un array' },
        { status: 400 }
      );
    }

    // Verificar que todos los IDs pertenecen al tenant
    const existentes = await prisma.catalogoFieldDefinition.findMany({
      where: {
        id: { in: orderedIds },
        tenantId: auth.tenant.id
      },
      select: { id: true }
    });

    const idsExistentes = new Set(existentes.map(f => f.id));
    const idsInvalidos = orderedIds.filter((id: string) => !idsExistentes.has(id));

    if (idsInvalidos.length > 0) {
      return NextResponse.json(
        { error: 'Algunos IDs no existen o no pertenecen al tenant', idsInvalidos },
        { status: 400 }
      );
    }

    // Actualizar el orden de cada campo
    const updates = orderedIds.map((id: string, index: number) =>
      prisma.catalogoFieldDefinition.update({
        where: { id },
        data: { orden: index }
      })
    );

    await prisma.$transaction(updates);

    // Audit log
    if (auth.user?.id) {
      await prisma.auditLog.create({
        data: {
          tenantId: auth.tenant.id,
          userId: auth.user.id,
          accion: 'UPDATE',
          entidad: 'CatalogoFieldDefinition',
          entidadId: 'bulk-reorder',
          descripcion: `Campos personalizados reordenados (${orderedIds.length} campos)`,
          cambiosDespues: JSON.stringify({ orderedIds })
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: `${orderedIds.length} campos reordenados`
    });
  } catch (error: any) {
    console.error('Error reordering field definitions:', error);
    return NextResponse.json(
      { error: 'Error al reordenar campos', details: error.message },
      { status: 500 }
    );
  }
}
