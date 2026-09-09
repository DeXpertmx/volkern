export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

async function getProperty(tenantId: string, id: string) {
  return prisma.hospitalityProperty.findFirst({
    where: { id, tenantId },
    include: { units: { orderBy: { nombre: 'asc' } }, _count: { select: { reservations: true } } },
  });
}

// GET /api/hospitality/properties/[id] — detalle (con unidades)
export async function GET(_req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(_req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { id } = await ctx.params;
    const property = await getProperty(auth.tenant!.id, id);
    if (!property) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    return NextResponse.json({ property });
  } catch (error) {
    console.error('Error obteniendo propiedad:', error);
    return NextResponse.json({ error: 'Error al obtener propiedad' }, { status: 500 });
  }
}

// PATCH /api/hospitality/properties/[id] — actualizar
export async function PATCH(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { id } = await ctx.params;
    const existing = await getProperty(auth.tenant!.id, id);
    if (!existing) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    const data = await req.json();
    const { nombre, direccion, ciudad, pais, timezone, estado } = data || {};

    const property = await prisma.hospitalityProperty.update({
      where: { id: existing.id },
      data: {
        ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
        ...(direccion !== undefined ? { direccion } : {}),
        ...(ciudad !== undefined ? { ciudad } : {}),
        ...(pais !== undefined ? { pais } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        ...(estado !== undefined ? { estado } : {}),
      },
    });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'actualizar',
      'hospitality_property',
      property.id,
      `Propiedad "${property.nombre}" actualizada`
    ).catch(() => {});

    return NextResponse.json({ property });
  } catch (error) {
    console.error('Error actualizando propiedad:', error);
    return NextResponse.json({ error: 'Error al actualizar propiedad' }, { status: 500 });
  }
}

// DELETE /api/hospitality/properties/[id] — eliminar
export async function DELETE(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { id } = await ctx.params;
    const existing = await getProperty(auth.tenant!.id, id);
    if (!existing) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    await prisma.hospitalityProperty.delete({ where: { id: existing.id } });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'eliminar',
      'hospitality_property',
      existing.id,
      `Propiedad "${existing.nombre}" eliminada`
    ).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error eliminando propiedad:', error);
    return NextResponse.json({ error: 'Error al eliminar propiedad' }, { status: 500 });
  }
}