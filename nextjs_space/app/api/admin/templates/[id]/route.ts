import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/admin/templates/[id] - Obtener una plantilla global específica
 */
export const GET = withTenantAuth(async (req, auth, params) => {
  try {
    const { id } = params;
    const plantilla = await globalPrisma.pageTemplate.findUnique({
      where: { id }
    });

    if (!plantilla) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
    }

    return NextResponse.json(plantilla);
  } catch (error: any) {
    console.error('Error obteniendo plantilla global:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}, ['admin:read', 'cms:read']);

/**
 * PUT /api/admin/templates/[id] - Actualizar una plantilla global
 */
export const PUT = withTenantAuth(async (req, auth, params) => {
  try {
    const { id } = params;
    
    // Solo Superadmin puede editar plantillas globales
    if (auth.user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const body = await req.json();
    const { nombre, descripcion, categoria, etiquetas, contenido, configuracionDefecto, imagenPreview, esPublica } = body;

    const updated = await globalPrisma.pageTemplate.update({
      where: { id },
      data: {
        nombre,
        descripcion,
        categoria,
        etiquetas: etiquetas || undefined,
        contenido: contenido || undefined,
        configuracionDefecto: configuracionDefecto || undefined,
        imagenPreview: imagenPreview || undefined,
        esPublica: typeof esPublica === 'boolean' ? esPublica : undefined,
      }
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Error actualizando plantilla global:', error);
    return NextResponse.json({ error: 'Error interno al actualizar' }, { status: 500 });
  }
}, ['admin:write', 'cms:write']);

/**
 * DELETE /api/admin/templates/[id] - Eliminar una plantilla global
 */
export const DELETE = withTenantAuth(async (req, auth, params) => {
  try {
    const { id } = params;
    
    if (auth.user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    await globalPrisma.pageTemplate.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error eliminando plantilla global:', error);
    return NextResponse.json({ error: 'Error interno al eliminar' }, { status: 500 });
  }
}, ['admin:write', 'cms:write']);
