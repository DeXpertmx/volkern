export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getTenantDb, dbContext } from '@/lib/db';
import { createSystemContext } from '@/lib/skills/context';
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

// POST /api/contratos - Crear contrato inviolable
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const body = await request.json();

    // 1. Validar Contacto y capturar Snapshot Fiscal (Gobernanza)
    const contactId = body.contactId;
    if (!contactId) {
      return NextResponse.json({ error: 'El ID de contacto es obligatorio para contratos inviolables' }, { status: 400 });
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { perfilFiscal: true }
    });

    if (!contact) {
      return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });
    }

    // El NIF es obligatorio para la validez legal del contrato
    const nif = contact.perfilFiscal?.nif || null;
    if (!nif) {
      return NextResponse.json({ 
        error: 'El contacto debe tener un NIF/CIF validado en su perfil fiscal para generar un contrato legal.' 
      }, { status: 400 });
    }

    const snapshotNombre = contact.nombre;
    const snapshotNif = nif;
    const snapshotDireccion = contact.perfilFiscal?.direccion || contact.ubicacion || '';
    const snapshotMetadata = {
      email: contact.email,
      telefono: contact.telefono,
      tipo: contact.tipo,
      tenantId: tenantId,
      timestamp: new Date().toISOString()
    };

    // 2. Generar número secuencial (Específico del tenant)
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

    // 3. Generar token público (UUID v4) para acceso externo inalterable
    const tokenPublico = crypto.randomUUID();

    // 4. Importar de Cotización si aplica
    let finalItems = body.items || [];
    if (body.cotizacionId && finalItems.length === 0) {
      const cotizacion = await prisma.cotizacion.findUnique({
        where: { id: body.cotizacionId },
        include: { items: true }
      });
      if (cotizacion) {
        finalItems = cotizacion.items.map(i => ({
          concepto: i.concepto,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
          porcentajeImpuesto: i.porcentajeImpuesto || 0,
          sku: i.sku
        }));
      }
    }

    // 5. Calcular totales
    const subtotal = finalItems.reduce((sum: number, item: any) => 
      sum + (item.cantidad * item.precioUnitario), 0);
    const descuentoMonto = body.descuentoPorcentaje 
      ? subtotal * body.descuentoPorcentaje / 100 
      : (body.descuentoMonto || 0);
    const subtotalConDescuento = subtotal - descuentoMonto;
    
    // Tasa de IVA por defecto del tenant si no se especifica
    const tasaIva = body.tasaIva !== undefined ? body.tasaIva : 0.16;
    const impuestos = body.incluyeIva ? subtotalConDescuento * tasaIva : 0;
    const total = subtotalConDescuento + impuestos;

    // 6. Crear contrato en la DB del Tenant con Snapshot Fiscal
    const contrato = await prisma.contrato.create({
      data: {
        tenantId,
        numero,
        tokenPublico,
        titulo: body.titulo,
        descripcion: body.descripcion,
        tipo: body.tipo || 'servicio',
        estado: 'borrador',
        contactId: contact.id,
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
        // Snapshot Fiscal Inmutable
        snapshotNombre,
        snapshotNif,
        snapshotDireccion,
        snapshotMetadata,
        // Datos de contacto para compatibilidad legacy UI
        clienteNombre: snapshotNombre,
        clienteEmail: contact.email,
        clienteTelefono: contact.telefono,
        clienteEmpresa: contact.company?.nombre || contact.clienteEmpresa,
        creadoPorId: userId,
        items: {
          create: finalItems.map((item: any, index: number) => ({
            concepto: item.concepto || item.nombre,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            descuento: item.descuento || 0,
            impuestos: item.porcentajeImpuesto || 0,
            total: item.cantidad * item.precioUnitario,
            orden: index,
            sku: item.sku
          }))
        }
      },
      include: {
        items: true,
        deal: true,
        contact: true,
        cotizacion: true
      }
    });

    // 7. Audit Log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        accion: 'crear',
        entidad: 'contrato',
        entidadId: contrato.id,
        descripcion: `Contrato Inviolable ${numero} generado para ${snapshotNombre} (NIF: ${snapshotNif})`,
        cambiosDespues: JSON.stringify({
          numero,
          total,
          snapshot: { snapshotNombre, snapshotNif }
        })
      }
    });

    // 8. Notificación a Telegram (Sales Channel)
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    notifyByTelegram(
      `📑 *Contrato Inviolable Generado*\n\n` +
      `📋 *Número:* \`${numero}\`\n` +
      `👤 *Cliente:* ${snapshotNombre}\n` +
      `🆔 *NIF:* \`${snapshotNif}\`\n` +
      `💰 *Valor:* ${total.toLocaleString()} ${contrato.moneda}\n` +
      `🛠️ *Tipo:* ${contrato.tipo.toUpperCase()}\n\n` +
      `_Esperando firma del cliente vía VolkernSign._`,
      createSystemContext(tenantId)
    ).catch(() => {});

    return NextResponse.json(contrato, { status: 201 });
  } catch (error) {
    console.error('Error creating contrato:', error);
    return NextResponse.json({ error: 'Error interno en la generación del contrato' }, { status: 500 });
  }
}, ['contratos:write']);
