export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

/**
 * GET /api/catalogo/field-definitions/[id]
 * Obtiene una definición de campo específica
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['catalogo:read']);
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      );
    }

    const fieldDefinition = await prisma.catalogoFieldDefinition.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant.id
      }
    });

    if (!fieldDefinition) {
      return NextResponse.json(
        { error: 'Campo no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      fieldDefinition
    });
  } catch (error: any) {
    console.error('Error fetching field definition:', error);
    return NextResponse.json(
      { error: 'Error al obtener definición de campo' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/catalogo/field-definitions/[id]
 * Actualiza una definición de campo
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['catalogo:write']);
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      );
    }

    const existente = await prisma.catalogoFieldDefinition.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant.id
      }
    });

    if (!existente) {
      return NextResponse.json(
        { error: 'Campo no encontrado' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      label,
      type,
      options,
      required,
      orden,
      categoria,
      placeholder,
      unidad,
      valorDefecto,
      activo
    } = body;

    // Validar tipo si se proporciona
    if (type) {
      const tiposValidos = ['text', 'number', 'select', 'boolean', 'date', 'url', 'textarea'];
      if (!tiposValidos.includes(type)) {
        return NextResponse.json(
          { error: `Tipo inválido. Tipos válidos: ${tiposValidos.join(', ')}` },
          { status: 400 }
        );
      }

      // Si es select, options es requerido
      if (type === 'select') {
        const opcionesFinales = options ?? existente.options;
        if (!opcionesFinales || !Array.isArray(opcionesFinales) || opcionesFinales.length === 0) {
          return NextResponse.json(
            { error: 'Para campos tipo "select", options es requerido y debe ser un array no vacío' },
            { status: 400 }
          );
        }
      }
    }

    const updateData: any = {};
    if (label !== undefined) updateData.label = label;
    if (type !== undefined) updateData.type = type;
    if (options !== undefined) updateData.options = options;
    if (required !== undefined) updateData.required = required;
    if (orden !== undefined) updateData.orden = orden;
    if (categoria !== undefined) updateData.categoria = categoria || null;
    if (placeholder !== undefined) updateData.placeholder = placeholder || null;
    if (unidad !== undefined) updateData.unidad = unidad || null;
    if (valorDefecto !== undefined) updateData.valorDefecto = valorDefecto || null;
    if (activo !== undefined) updateData.activo = activo;

    const fieldDefinition = await prisma.catalogoFieldDefinition.update({
      where: { id: params.id },
      data: updateData
    });

    // Audit log
    if (auth.user?.id) {
      await prisma.auditLog.create({
        data: {
          tenantId: auth.tenant.id,
          userId: auth.user.id,
          accion: 'UPDATE',
          entidad: 'CatalogoFieldDefinition',
          entidadId: fieldDefinition.id,
          descripcion: `Campo personalizado "${fieldDefinition.label}" actualizado`,
          cambiosAntes: JSON.stringify(existente),
          cambiosDespues: JSON.stringify(fieldDefinition)
        }
      });
    }

    return NextResponse.json({
      success: true,
      fieldDefinition
    });
  } catch (error: any) {
    console.error('Error updating field definition:', error);
    return NextResponse.json(
      { error: 'Error al actualizar definición de campo', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/catalogo/field-definitions/[id]
 * Elimina una definición de campo (soft delete - desactiva)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['catalogo:write']);
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      );
    }

    const existente = await prisma.catalogoFieldDefinition.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant.id
      }
    });

    if (!existente) {
      return NextResponse.json(
        { error: 'Campo no encontrado' },
        { status: 404 }
      );
    }

    // Verificar si hay un parámetro para eliminación permanente
    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get('hard') === 'true';

    if (hardDelete) {
      // Eliminación permanente
      await prisma.catalogoFieldDefinition.delete({
        where: { id: params.id }
      });
    } else {
      // Soft delete - solo desactivar
      await prisma.catalogoFieldDefinition.update({
        where: { id: params.id },
        data: { activo: false }
      });
    }

    // Audit log
    if (auth.user?.id) {
      await prisma.auditLog.create({
        data: {
          tenantId: auth.tenant.id,
          userId: auth.user.id,
          accion: 'DELETE',
          entidad: 'CatalogoFieldDefinition',
          entidadId: existente.id,
          descripcion: `Campo personalizado "${existente.label}" ${hardDelete ? 'eliminado permanentemente' : 'desactivado'}`,
          cambiosAntes: JSON.stringify(existente)
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: hardDelete ? 'Campo eliminado permanentemente' : 'Campo desactivado'
    });
  } catch (error: any) {
    console.error('Error deleting field definition:', error);
    return NextResponse.json(
      { error: 'Error al eliminar definición de campo', details: error.message },
      { status: 500 }
    );
  }
}
