import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const dynamic = 'force-dynamic';

// PATCH /api/social/posts/[id] - Actualizar fecha de un post (drag & drop)
export const PATCH = withTenantAuth(async (req, auth) => {
  try {
    const url = new URL(req.url);
    const id = url.pathname.split('/').filter(Boolean).pop();

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    const tenantId = auth.tenant!.id;

    // Verificar pertenencia al tenant
    const existing = await prisma.socialPost.findUnique({
      where: { id },
    });

    if (!existing || existing.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });
    }

    const body = await req.json();
    const { scheduledFor, status, content, platforms, mediaUrls } = body;

    const updateData: Record<string, any> = {};

    if (scheduledFor !== undefined) {
      updateData.scheduledFor = scheduledFor ? new Date(scheduledFor) : null;
      // Si se asigna fecha, cambiar a 'scheduled' si es borrador
      if (existing.status === 'draft' && scheduledFor) {
        updateData.status = 'scheduled';
      }
    }

    if (status !== undefined) updateData.status = status;
    if (content !== undefined) updateData.content = content;
    if (platforms !== undefined) updateData.platforms = platforms;
    if (mediaUrls !== undefined) updateData.mediaUrls = mediaUrls;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 });
    }

    const updated = await prisma.socialPost.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, post: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['social:write']);

// DELETE /api/social/posts/[id] - Eliminar un post
export const DELETE = withTenantAuth(async (req, auth) => {
  try {
    const url = new URL(req.url);
    const id = url.pathname.split('/').filter(Boolean).pop();

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    const tenantId = auth.tenant!.id;

    const existing = await prisma.socialPost.findUnique({
      where: { id },
    });

    if (!existing || existing.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });
    }

    await prisma.socialPost.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Publicación eliminada' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['social:write']);
