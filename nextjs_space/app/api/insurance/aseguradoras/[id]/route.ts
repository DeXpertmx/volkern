export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

// GET - Obtener aseguradora individual
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['insurance:read', 'catalogo:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const aseguradora = await prisma.aseguradora.findFirst({
      where: { id: params.id, tenantId: auth.tenant!.id },
      include: {
        productos: { where: { activo: true }, orderBy: { nombre: 'asc' } },
        _count: { select: { polizas: true } },
      },
    });

    if (!aseguradora) {
      return NextResponse.json({ error: 'Aseguradora no encontrada' }, { status: 404 });
    }

    return NextResponse.json(aseguradora);
  } catch (error) {
    console.error('Error al obtener aseguradora:', error);
    return NextResponse.json({ error: 'Error al obtener aseguradora' }, { status: 500 });
  }
}

// PATCH - Actualizar aseguradora
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['insurance:write', 'config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const existing = await prisma.aseguradora.findFirst({
      where: { id: params.id, tenantId: auth.tenant!.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Aseguradora no encontrada' }, { status: 404 });
    }

    const data = await req.json();
    const updateData: any = {};

    if (data.nombre !== undefined) {
      const dup = await prisma.aseguradora.findFirst({
        where: { tenantId: auth.tenant!.id, nombre: data.nombre, id: { not: params.id } },
      });
      if (dup) return NextResponse.json({ error: 'Ya existe una aseguradora con este nombre' }, { status: 400 });
      updateData.nombre = data.nombre;
    }

    if (data.nif !== undefined) updateData.nif = data.nif;
    if (data.direccion !== undefined) updateData.direccion = data.direccion;
    if (data.telefono !== undefined) updateData.telefono = data.telefono;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.web !== undefined) updateData.web = data.web;
    if (data.activa !== undefined) updateData.activa = data.activa;

    const aseguradora = await prisma.aseguradora.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(aseguradora);
  } catch (error) {
    console.error('Error al actualizar aseguradora:', error);
    return NextResponse.json({ error: 'Error al actualizar aseguradora' }, { status: 500 });
  }
}

// DELETE - Eliminar aseguradora
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['insurance:write', 'config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const existing = await prisma.aseguradora.findFirst({
      where: { id: params.id, tenantId: auth.tenant!.id },
      include: { _count: { select: { polizas: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Aseguradora no encontrada' }, { status: 404 });
    }

    if (existing._count.polizas > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: tiene ${existing._count.polizas} pólizas asociadas` },
        { status: 400 }
      );
    }

    await prisma.aseguradora.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar aseguradora:', error);
    return NextResponse.json({ error: 'Error al eliminar aseguradora' }, { status: 500 });
  }
}
