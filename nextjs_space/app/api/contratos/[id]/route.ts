export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// GET /api/contratos/[id]
export const GET = withTenantAuth(async (request, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;

    const contrato = await prisma.contrato.findFirst({
      where: {
        id: params.id,
        tenantId: tenantId
      },
      include: {
        deal: { select: { id: true, titulo: true, valor: true } },
        lead: { select: { id: true, nombre: true, email: true, empresa: true } },
        cotizacion: { select: { id: true, numero: true, titulo: true } },
        creadoPor: { select: { id: true, name: true, email: true } },
        firmadoPor: { select: { id: true, name: true } },
        items: { orderBy: { orden: 'asc' } },
        pagos: { orderBy: { fechaProgramada: 'asc' } },
        signatureRequests: {
          orderBy: { createdAt: 'desc' },
          include: { auditEvents: { orderBy: { timestamp: 'desc' }, take: 5 } }
        }
      }
    });

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
    }

    return NextResponse.json(contrato);
  } catch (error) {
    console.error('Error fetching contrato:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}, ['contratos:read']);

// PATCH /api/contratos/[id]
export const PATCH = withTenantAuth(async (request, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const body = await request.json();

    const existing = await prisma.contrato.findFirst({
      where: { id: params.id, tenantId }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
    }

    // Actualizar items si se proporcionan (DB del Tenant)
    if (body.items) {
      await prisma.contratoItem.deleteMany({ where: { contratoId: params.id } });
      await prisma.contratoItem.createMany({
        data: body.items.map((item: any, index: number) => ({
          contratoId: params.id,
          concepto: item.concepto || item.nombre,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          descuento: item.descuento || 0,
          impuestos: item.impuestos || 0,
          total: item.cantidad * item.precioUnitario,
          orden: index,
          categoria: item.categoria,
          sku: item.sku
        }))
      });

      // Recalcular totales
      const subtotal = body.items.reduce((sum: number, item: any) => 
        sum + (item.cantidad * item.precioUnitario), 0);
      const descuentoMonto = body.descuentoPorcentaje 
        ? subtotal * body.descuentoPorcentaje / 100 
        : (body.descuentoMonto || existing.descuentoMonto);
      const subtotalConDescuento = subtotal - descuentoMonto;
      const impuestos = body.incluyeIva !== undefined 
        ? (body.incluyeIva ? subtotalConDescuento * 0.16 : 0)
        : existing.impuestos;
      const total = subtotalConDescuento + impuestos;

      body.subtotal = subtotal;
      body.descuentoMonto = descuentoMonto;
      body.impuestos = impuestos;
      body.total = total;
    }

    // Limpieza de body para el update
    const { items, incluyeIva, ...updateData } = body;

    // Procesar fechas
    if (updateData.fechaInicio) updateData.fechaInicio = new Date(updateData.fechaInicio);
    if (updateData.fechaFin) updateData.fechaFin = new Date(updateData.fechaFin);

    const contrato = await prisma.contrato.update({
      where: { id: params.id },
      data: updateData,
      include: {
        items: true,
        pagos: true,
        deal: true,
        lead: true
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        accion: 'actualizar',
        entidad: 'contrato',
        entidadId: params.id,
        descripcion: `Contrato ${contrato.numero} actualizado`,
        cambiosDespues: JSON.stringify(contrato)
      }
    });

    return NextResponse.json(contrato);
  } catch (error) {
    console.error('Error updating contrato:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}, ['contratos:write']);

// DELETE /api/contratos/[id]
export const DELETE = withTenantAuth(async (request, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;

    const contrato = await prisma.contrato.findFirst({
      where: { id: params.id, tenantId }
    });

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
    }

    if (contrato.estado !== 'borrador') {
      return NextResponse.json({ 
        error: 'Solo se pueden eliminar contratos en estado borrador' 
      }, { status: 400 });
    }

    await prisma.contrato.delete({ where: { id: params.id } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        accion: 'eliminar',
        entidad: 'contrato',
        entidadId: params.id,
        descripcion: `Contrato ${contrato.numero} eliminado`,
        cambiosAntes: JSON.stringify(contrato)
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contrato:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}, ['contratos:delete']);
