export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/knowledge/[id] - Obtener detalle
 */
export const GET = withTenantAuth(async (request, auth, context) => {
  try {
    const { id } = await context.params;
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id, tenantId: auth.tenant!.id }
    });

    if (!article) return NextResponse.json({ error: 'Artículo no encontrado' }, { status: 404 });

    return NextResponse.json(article);
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al obtener artículo' }, { status: 500 });
  }
}, ['knowledge:read']);

/**
 * PATCH /api/knowledge/[id] - Actualizar
 */
export const PATCH = withTenantAuth(async (request, auth, context) => {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const article = await prisma.knowledgeArticle.update({
      where: { id, tenantId: auth.tenant!.id },
      data: body
    });

    return NextResponse.json(article);
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al actualizar artículo' }, { status: 500 });
  }
}, ['knowledge:write']);

/**
 * DELETE /api/knowledge/[id] - Eliminar
 */
export const DELETE = withTenantAuth(async (request, auth, context) => {
  try {
    const { id } = await context.params;
    await prisma.knowledgeArticle.delete({
      where: { id, tenantId: auth.tenant!.id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al eliminar artículo' }, { status: 500 });
  }
}, ['knowledge:write']);
