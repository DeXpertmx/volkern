export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { randomBytes } from 'crypto';

// GET /api/contratos - Listar contratos
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const tipo = searchParams.get('tipo');
    const dealId = searchParams.get('dealId');
    const leadId = searchParams.get('leadId');
    const search = searchParams.get('search');

    const where: any = { tenantId };
    if (estado) where.estado = estado;
    if (tipo) where.tipo = tipo;
    if (dealId) where.dealId = dealId;
    if (leadId) where.leadId = leadId;
    if (search) {
      where.OR = [
        { numero: { contains: search, mode: 'insensitive' } },
        { titulo: { contains: search, mode: 'insensitive' } },
        { clienteNombre: { contains: search, mode: 'insensitive' } },
        { clienteEmpresa: { contains: search, mode: 'insensitive' } }
      ];
    }

    // El proxy de prisma redirige automáticamente a la base de datos física del tenant
    const contratos = await prisma.contrato.findMany({
      where,
      include: {
        deal: { select: { id: true, titulo: true } },
        lead: { select: { id: true, nombre: true } },
        cotizacion: { select: { id: true, numero: true } },
        creadoPor: { select: { id: true, name: true } },
        items: true,
        pagos: true
      },
      orderBy: { fechaCreacion: 'desc' }
    });

    return NextResponse.json(contratos);
  } catch (error) {
    console.error('Error fetching contratos:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}, ['contratos:read']);

// POST /api/contratos - Crear contrato
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const body = await request.json();

    // 1. Generar número secuencial (Específico del tenant en su DB física)
    const year = new Date().getFullYear();
    const lastContrato = await prisma.contrato.findFirst({
      where: {
        tenantId,
        numero: { startsWith: `CONT-${year}` }
      },
      orderBy: { numero: 'desc' }
    });

    let nextNum = 1;
    if (lastContrato) {
      const parts = lastContrato.numero.split('-');
      nextNum = parseInt(parts[2] || '0', 10) + 1;
    }
    const numero = `CONT-${year}-${String(nextNum).padStart(4, '0')}`;

    // 2. Generar token público
    const tokenPublico = randomBytes(32).toString('hex');

    // 3. Calcular totales
    const items = body.items || [];
    const subtotal = items.reduce((sum: number, item: any) => 
      sum + (item.cantidad * item.precioUnitario), 0);
    const descuentoMonto = body.descuentoPorcentaje 
      ? subtotal * body.descuentoPorcentaje / 100 
      : (body.descuentoMonto || 0);
    const subtotalConDescuento = subtotal - descuentoMonto;
    const impuestos = body.incluyeIva ? subtotalConDescuento * 0.16 : 0;
    const total = subtotalConDescuento + impuestos;

    // 4. Crear contrato en la DB del Tenant
    const contrato = await prisma.contrato.create({
      data: {
        tenantId,
        numero,
        tokenPublico,
        titulo: body.titulo,
        descripcion: body.descripcion,
        tipo: body.tipo || 'servicio',
        estado: 'borrador',
        dealId: body.dealId || null,
        leadId: body.leadId || null,
        cotizacionId: body.cotizacionId || null,
        subtotal,
        descuentoPorcentaje: body.descuentoPorcentaje || 0,
        descuentoMonto,
        impuestos,
        total,
        moneda: body.moneda || 'EUR',
        metodoPago: body.metodoPago,
        condicionesPago: body.condicionesPago,
        frecuenciaPago: body.frecuenciaPago,
        diaPago: body.diaPago,
        clausulas: body.clausulas,
        notasInternas: body.notasInternas,
        notasCliente: body.notasCliente,
        fechaInicio: body.fechaInicio ? new Date(body.fechaInicio) : null,
        fechaFin: body.fechaFin ? new Date(body.fechaFin) : null,
        clienteNombre: body.clienteNombre,
        clienteEmail: body.clienteEmail,
        clienteTelefono: body.clienteTelefono,
        clienteEmpresa: body.clienteEmpresa,
        clienteRfc: body.clienteRfc,
        clienteDireccion: body.clienteDireccion,
        creadoPorId: userId,
        items: {
          create: items.map((item: any, index: number) => ({
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
        }
      },
      include: {
        items: true,
        deal: true,
        lead: true,
        cotizacion: true
      }
    });

    // Audit log (Proxied to tenant DB)
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        accion: 'crear',
        entidad: 'contrato',
        entidadId: contrato.id,
        descripcion: `Contrato ${numero} creado para ${contrato.clienteNombre}`,
        cambiosDespues: JSON.stringify(contrato)
      }
    });

    return NextResponse.json(contrato, { status: 201 });
  } catch (error) {
    console.error('Error creating contrato:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}, ['contratos:write']);
