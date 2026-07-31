export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

// GET - Obtener póliza individual
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['insurance:read', 'catalogo:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const poliza = await prisma.poliza.findFirst({
      where: { id: params.id, tenantId: auth.tenant!.id },
      include: {
        cliente: { select: { id: true, nombre: true, email: true, telefono: true } },
        aseguradora: { select: { id: true, nombre: true } },
        productoSeguro: { select: { id: true, nombre: true, ramo: true, subramo: true, descripcion: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        renovaciones: {
          orderBy: { periodoInicio: 'desc' },
          take: 5,
        },
        oportunidades: {
          where: { estado: { not: 'PERDIDA' } },
          take: 5,
        },
      },
    });

    if (!poliza) {
      return NextResponse.json({ error: 'Póliza no encontrada' }, { status: 404 });
    }

    return NextResponse.json(poliza);
  } catch (error) {
    console.error('Error al obtener póliza:', error);
    return NextResponse.json({ error: 'Error al obtener póliza' }, { status: 500 });
  }
}

// PATCH - Actualizar póliza
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['insurance:write', 'config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const existing = await prisma.poliza.findFirst({
      where: { id: params.id, tenantId: auth.tenant!.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Póliza no encontrada' }, { status: 404 });
    }

    const data = await req.json();
    const updateData: any = {};

    if (data.numeroPoliza !== undefined) {
      // Verificar duplicado si cambia el número
      const dup = await prisma.poliza.findFirst({
        where: {
          tenantId: auth.tenant!.id,
          numeroPoliza: data.numeroPoliza,
          id: { not: params.id },
        },
      });
      if (dup) {
        return NextResponse.json({ error: 'Ya existe una póliza con este número' }, { status: 400 });
      }
      updateData.numeroPoliza = data.numeroPoliza;
    }

    if (data.descripcion !== undefined) updateData.descripcion = data.descripcion;
    if (data.sumaAsegurada !== undefined) updateData.sumaAsegurada = parseFloat(data.sumaAsegurada);
    if (data.primaAnual !== undefined) updateData.primaAnual = parseFloat(data.primaAnual);
    if (data.formaPago !== undefined) updateData.formaPago = data.formaPago;
    if (data.moneda !== undefined) updateData.moneda = data.moneda;
    if (data.fechaInicio !== undefined) updateData.fechaInicio = new Date(data.fechaInicio);
    if (data.fechaVencimiento !== undefined) updateData.fechaVencimiento = new Date(data.fechaVencimiento);
    if (data.estado !== undefined) updateData.estado = data.estado;
    if (data.comisionPct !== undefined) updateData.comisionPct = parseFloat(data.comisionPct);
    if (data.notas !== undefined) updateData.notas = data.notas;
    if (data.aseguradoraId !== undefined) updateData.aseguradoraId = data.aseguradoraId;
    if (data.productoSeguroId !== undefined) updateData.productoSeguroId = data.productoSeguroId;

    const poliza = await prisma.poliza.update({
      where: { id: params.id },
      data: updateData,
      include: {
        cliente: { select: { id: true, nombre: true, email: true, telefono: true } },
        aseguradora: { select: { id: true, nombre: true } },
        productoSeguro: { select: { id: true, nombre: true, ramo: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(poliza);
  } catch (error) {
    console.error('Error al actualizar póliza:', error);
    return NextResponse.json({ error: 'Error al actualizar póliza' }, { status: 500 });
  }
}

// DELETE - Eliminar póliza
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['insurance:write', 'config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const existing = await prisma.poliza.findFirst({
      where: { id: params.id, tenantId: auth.tenant!.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Póliza no encontrada' }, { status: 404 });
    }

    await prisma.poliza.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar póliza:', error);
    return NextResponse.json({ error: 'Error al eliminar póliza' }, { status: 500 });
  }
}
