export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * POST /api/real-estate/properties/[id]/media
 *
 * Añade una imagen a la propiedad.
 * Body: { url: string, alt?: string, order?: number }
 */
export const POST = withTenantAuth(async (req, auth, { params }: { params: { id: string } }) => {
  const tenantId = auth.tenant!.id;
  const { id } = params;

  try {
    const existing = await prisma.catalogoItem.findFirst({
      where: { id, tenantId, tipo: 'inmueble' },
      select: { id: true, media: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Propiedad no encontrada' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { url, alt, order } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL de imagen es requerida' },
        { status: 400 }
      );
    }

    // Obtener array actual de medios
    const currentMedia = Array.isArray(existing.media) ? existing.media : [];

    // Crear nuevo item de media
    const newMediaItem = {
      url,
      alt: alt || '',
      order: order ?? currentMedia.length,
      addedAt: new Date().toISOString(),
    };

    const updatedMedia = [...currentMedia, newMediaItem];

    await prisma.catalogoItem.update({
      where: { id },
      data: { media: updatedMedia },
    });

    return NextResponse.json({
      success: true,
      media: updatedMedia,
      message: 'Imagen añadida correctamente',
    });
  } catch (error) {
    console.error('[Real Estate Media] Error adding image:', error);
    return NextResponse.json(
      { error: 'Error al añadir la imagen' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/real-estate/properties/[id]/media
 *
 * Elimina una imagen de la propiedad.
 * Body: { url: string } — la URL de la imagen a eliminar
 */
export const DELETE = withTenantAuth(async (req, auth, { params }: { params: { id: string } }) => {
  const tenantId = auth.tenant!.id;
  const { id } = params;

  try {
    const existing = await prisma.catalogoItem.findFirst({
      where: { id, tenantId, tipo: 'inmueble' },
      select: { id: true, media: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Propiedad no encontrada' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL de imagen a eliminar es requerida' },
        { status: 400 }
      );
    }

    const currentMedia = Array.isArray(existing.media) ? existing.media : [];
    const updatedMedia = currentMedia.filter(
      (item: any) => item.url !== url && (typeof item === 'string' ? item !== url : true)
    );

    await prisma.catalogoItem.update({
      where: { id },
      data: { media: updatedMedia },
    });

    return NextResponse.json({
      success: true,
      media: updatedMedia,
      message: 'Imagen eliminada correctamente',
    });
  } catch (error) {
    console.error('[Real Estate Media] Error removing image:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la imagen' },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/real-estate/properties/[id]/media
 *
 * Reordena las imágenes de la propiedad.
 * Body: { urls: string[] } — array ordenado de URLs
 */
export const PATCH = withTenantAuth(async (req, auth, { params }: { params: { id: string } }) => {
  const tenantId = auth.tenant!.id;
  const { id } = params;

  try {
    const existing = await prisma.catalogoItem.findFirst({
      where: { id, tenantId, tipo: 'inmueble' },
      select: { id: true, media: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Propiedad no encontrada' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { urls } = body;

    if (!Array.isArray(urls)) {
      return NextResponse.json(
        { error: 'Se requiere un array de URLs ordenadas' },
        { status: 400 }
      );
    }

    // Reordenar según el array de URLs
    const currentMedia = Array.isArray(existing.media) ? existing.media : [];
    const mediaMap = new Map(
      currentMedia.map((item: any, index: number) => [
        typeof item === 'string' ? item : item.url,
        { ...(typeof item === 'object' ? item : { url: item }), order: urls.indexOf(typeof item === 'string' ? item : item.url) },
      ])
    );

    const reordered = urls
      .map((url: string, index: number) => {
        const item = mediaMap.get(url);
        if (item) {
          return { ...item, order: index };
        }
        return { url, alt: '', order: index, addedAt: new Date().toISOString() };
      })
      .filter(Boolean);

    await prisma.catalogoItem.update({
      where: { id },
      data: { media: reordered },
    });

    return NextResponse.json({
      success: true,
      media: reordered,
      message: 'Imágenes reordenadas correctamente',
    });
  } catch (error) {
    console.error('[Real Estate Media] Error reordering images:', error);
    return NextResponse.json(
      { error: 'Error al reordenar las imágenes' },
      { status: 500 }
    );
  }
});
