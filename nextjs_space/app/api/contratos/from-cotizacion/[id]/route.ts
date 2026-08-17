export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { addContratoTimelineEvent } from '@/lib/contratos/timeline';

import { randomBytes } from 'crypto';

// POST - Crear contrato desde cotización aceptada
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(request, ['contratos:write']);
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
    }

    const tenantId = auth.tenant.id;
    const userId = auth.user?.id || 'api';
    const body = await request.json();

    // Obtener cotización
    const cotizacion = await prisma.cotizacion.findFirst({
      where: { id: params.id, tenantId },
      include: { items: true, lead: true, deal: true }
    });

    if (!cotizacion) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });
    }

    if (cotizacion.estado !== 'aceptada') {
      return NextResponse.json({ 
        error: 'Solo se pueden convertir cotizaciones aceptadas' 
      }, { status: 400 });
    }

    // Generar número de contrato
    const year = new Date().getFullYear();
    const lastContrato = await prisma.contrato.findFirst({
      where: { tenantId, numero: { startsWith: `CONT-${year}` } },
      orderBy: { numero: 'desc' }
    });

    let nextNum = 1;
    if (lastContrato) {
      const parts = lastContrato.numero.split('-');
      nextNum = parseInt(parts[2] || '0', 10) + 1;
    }
    const numero = `CONT-${year}-${String(nextNum).padStart(4, '0')}`;
    const tokenPublico = randomBytes(32).toString('hex');

    // Crear contrato
    const contrato = await prisma.contrato.create({
      data: {
        tenantId,
        numero,
        tokenPublico,
        titulo: body.titulo || cotizacion.titulo,
        descripcion: body.descripcion || cotizacion.descripcion,
        tipo: body.tipo || 'servicio',
        estado: 'borrador',
        cotizacionId: cotizacion.id,
        dealId: cotizacion.dealId,
        leadId: cotizacion.leadId,
        subtotal: cotizacion.subtotal,
        descuentoPorcentaje: cotizacion.descuentoPorcentaje,
        descuentoMonto: cotizacion.descuentoMonto,
        impuestos: cotizacion.impuestos,
        total: cotizacion.total,
        moneda: cotizacion.moneda,
        condicionesPago: body.condicionesPago || cotizacion.terminosPago,
        clausulas: body.clausulas || cotizacion.clausulas || undefined,
        notasInternas: body.notasInternas,
        notasCliente: body.notasCliente || cotizacion.notasCliente,
        fechaInicio: body.fechaInicio ? new Date(body.fechaInicio) : null,
        fechaFin: body.fechaFin ? new Date(body.fechaFin) : null,
        clienteNombre: cotizacion.clienteNombre,
        clienteEmail: cotizacion.clienteEmail,
        clienteTelefono: cotizacion.clienteTelefono,
        clienteEmpresa: cotizacion.clienteEmpresa,
        clienteRfc: body.clienteRfc,
        clienteDireccion: body.clienteDireccion,
        creadoPorId: userId !== 'api' ? userId : null,
        items: {
          create: cotizacion.items.map((item, index) => ({
            concepto: item.concepto,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            descuento: item.descuento,
            impuestos: item.impuestos,
            total: item.total,
            orden: index,
            categoria: item.categoria,
            sku: item.sku
          }))
        }
      },
      include: { items: true, cotizacion: true }
    });

    // Timeline del contrato: evento de creación
    await addContratoTimelineEvent({
      contratoId: contrato.id,
      actorId: userId !== 'api' ? userId : null,
      actorType: 'USER',
      action: 'created',
      note: `Contrato ${numero} creado desde la cotización ${cotizacion.numero} por ${contrato.total} ${contrato.moneda}`,
      metadata: { numero, cotizacionId: cotizacion.id, total: contrato.total, moneda: contrato.moneda },
    });

    return NextResponse.json(contrato, { status: 201 });
  } catch (error) {
    console.error('Error creating contrato from cotizacion:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
