export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// PATCH /api/contratos/plantillas/[id] - Actualizar plantilla
export const PATCH = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id;
    const id = params.id;

    const existente = await prisma.contratoTemplate.findFirst({ where: { id, tenantId } });
    if (!existente) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
    }

    const body = await request.json();
    const data: any = {};
    if (body.nombre !== undefined) data.nombre = String(body.nombre).trim();
    if (body.tipo !== undefined) data.tipo = body.tipo;
    if (body.descripcion !== undefined) data.descripcion = body.descripcion || null;
    if (body.clausulas !== undefined) data.clausulas = body.clausulas || null;
    if (body.condicionesPago !== undefined) data.condicionesPago = body.condicionesPago || null;
    if (body.activo !== undefined) data.activo = Boolean(body.activo);
    if (!data.nombre) {
      return NextResponse.json({ error: 'El nombre de la plantilla es requerido' }, { status: 400 });
    }

    const plantilla = await prisma.contratoTemplate.update({ where: { id }, data });
    return NextResponse.json({ plantilla });
  } catch (error: any) {
    console.error('Error actualizando plantilla de contrato:', error.message);
    return NextResponse.json({ error: 'Error al actualizar la plantilla' }, { status: 500 });
  }
});

// DELETE /api/contratos/plantillas/[id] - Eliminar plantilla
export const DELETE = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id;
    const id = params.id;

    const existente = await prisma.contratoTemplate.findFirst({ where: { id, tenantId } });
    if (!existente) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
    }

    await prisma.contratoTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error eliminando plantilla de contrato:', error.message);
    return NextResponse.json({ error: 'Error al eliminar la plantilla' }, { status: 500 });
  }
});
