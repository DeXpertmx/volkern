export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma, getTenantDb, dbContext } from '@/lib/db'
import { createSystemContext } from '@/lib/skills/context';
import { authenticateRequest } from '@/lib/api-key-auth'
import { aplicaInversionSujetoPasivo } from '@/lib/fiscal-validation'
import { validateBody } from '@/lib/validation'
import { z } from 'zod'

const FromCotizacionBodySchema = z.object({
  cotizacionId: z.string().min(25, 'ID de cotización inválido'),
  fechaEntrega: z.string().datetime().optional(),
  notas: z.string().max(5000).optional(),
  notasInternas: z.string().max(5000).optional(),
  condicionesVenta: z.string().max(500).optional(),
  referenciaCliente: z.string().max(255).optional(),
  ajustarPrecios: z.boolean().default(false),
});

/**
 * POST /api/ordenes-venta/from-cotizacion
 * Convertir una cotización aceptada en orden de venta
 * Hereda: items, cliente, datos fiscales, referencias al catálogo
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['deals:write', 'orders:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }
    const tenantId = auth.tenant!.id

    const raw = await req.json()
    const parsed = validateBody(FromCotizacionBodySchema, raw)
    if (parsed instanceof NextResponse) return parsed

    const {
      cotizacionId,
      fechaEntrega,
      notas,
      notasInternas,
      condicionesVenta,
      referenciaCliente,
      ajustarPrecios = false,
    } = parsed

    // Obtener cotización con items
    const cotizacion = await prisma.cotizacion.findFirst({
      where: {
        id: cotizacionId,
        tenantId: auth.tenant!.id,
      },
      include: {
        items: {
          include: {
            catalogoItem: {
              include: { tasaImpuesto: true },
            },
            tasaImpuesto: true,
          },
          orderBy: { orden: 'asc' },
        },
        lead: true,
        deal: true,
        emisor: true,
      },
    })

    if (!cotizacion) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    // Verificar estado (debe estar aceptada o al menos enviada)
    if (!['aceptada', 'enviada', 'borrador'].includes(cotizacion.estado)) {
      return NextResponse.json(
        { error: `No se puede convertir cotización en estado: ${cotizacion.estado}` },
        { status: 400 }
      )
    }

    // Obtener perfil fiscal del cliente
    let perfilFiscalCliente = null
    if (cotizacion.leadId) {
      perfilFiscalCliente = await prisma.perfilFiscalCliente.findFirst({
        where: { leadId: cotizacion.leadId },
      })
    }

    // Verificar inversión de sujeto pasivo
    const aplicaReverseCharge = cotizacion.emisor && perfilFiscalCliente
      ? aplicaInversionSujetoPasivo(
          cotizacion.emisor.pais,
          perfilFiscalCliente.country,
          !!perfilFiscalCliente.idIntracomunitario
        )
      : false

    // Procesar items
    const itemsProcessed: any[] = []
    let subtotalOrden = 0
    let totalImpuestosOrden = 0
    let totalRetencionesOrden = 0

    for (const item of cotizacion.items) {
      let precioUnitario = item.precioUnitario
      let porcentajeImpuesto = item.porcentajeImpuesto || 0
      let tasaImpuestoId = item.tasaImpuestoId

      // Si ajustar precios, usar valores actuales del catálogo
      if (ajustarPrecios && item.catalogoItem) {
        precioUnitario = item.catalogoItem.precioBase
        porcentajeImpuesto = item.catalogoItem.tasaImpuesto?.porcentaje || 0
        tasaImpuestoId = item.catalogoItem.tasaImpuestoId
      }

      // Calcular subtotal
      let subtotalItem = item.cantidad * precioUnitario
      if (item.descuento > 0) {
        subtotalItem = subtotalItem * (1 - item.descuento / 100)
      }
      subtotalItem = Math.round(subtotalItem * 100) / 100

      // Si cliente exento o reverse charge, IVA = 0
      if (perfilFiscalCliente?.exentoImpuestos || aplicaReverseCharge) {
        porcentajeImpuesto = 0
      }

      const montoImpuesto = Math.round(subtotalItem * (porcentajeImpuesto / 100) * 100) / 100

      // Retenciones
      const aplicaRetencion = item.aplicaRetencion || perfilFiscalCliente?.aplicaRetencion || false
      const porcentajeRetencion = item.porcentajeRetencion || 0
      let montoRetencion = 0
      if (aplicaRetencion && porcentajeRetencion > 0) {
        montoRetencion = Math.round(subtotalItem * (porcentajeRetencion / 100) * 100) / 100
      }

      const totalItem = subtotalItem + montoImpuesto - montoRetencion

      itemsProcessed.push({
        concepto: item.concepto,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        unidad: item.catalogoItem?.unidad || 'unidad',
        precioUnitario,
        descuento: item.descuento,
        tasaImpuestoId,
        porcentajeImpuesto,
        montoImpuesto,
        aplicaRetencion,
        porcentajeRetencion,
        montoRetencion,
        subtotal: subtotalItem,
        total: totalItem,
        orden: item.orden,
        catalogoItemId: item.catalogoItemId,
      })

      subtotalOrden += subtotalItem
      totalImpuestosOrden += montoImpuesto
      totalRetencionesOrden += montoRetencion
    }

    // Aplicar descuento global de la cotización
    const descuentoGlobal = cotizacion.descuentoPorcentaje || 0
    let descuentoGlobalMonto = 0
    if (descuentoGlobal > 0) {
      descuentoGlobalMonto = subtotalOrden * (descuentoGlobal / 100)
    }

    const totalOrden = subtotalOrden - descuentoGlobalMonto + totalImpuestosOrden - totalRetencionesOrden

    // Generar número de orden
    const year = new Date().getFullYear()
    const ultimaOrden = await prisma.ordenVenta.findFirst({
      where: {
        tenantId: auth.tenant!.id,
        numero: { startsWith: `OV-${year}` },
      },
      orderBy: { numero: 'desc' },
    })

    let siguienteNumero = 1
    if (ultimaOrden) {
      const match = ultimaOrden.numero.match(/OV-\d{4}-(\d+)/)
      if (match) siguienteNumero = parseInt(match[1]) + 1
    }
    const numero = `OV-${year}-${String(siguienteNumero).padStart(4, '0')}`

    // Crear orden de venta
    const orden = await prisma.ordenVenta.create({
      data: {
        tenantId: auth.tenant!.id,
        numero,
        leadId: cotizacion.leadId,
        contactId: null,
        contratoId: null,
        cotizacionId: cotizacion.id,
        dealId: cotizacion.dealId,
        emisorId: cotizacion.emisorId,
        estado: 'borrador',
        fechaOrden: new Date(),
        fechaEntrega: fechaEntrega ? new Date(fechaEntrega) : null,
        subtotal: subtotalOrden,
        descuentoGlobal,
        tipoDescuento: 'porcentaje',
        totalImpuestos: totalImpuestosOrden,
        totalRetenciones: totalRetencionesOrden,
        total: Math.round(totalOrden * 100) / 100,
        moneda: cotizacion.moneda,
        redondeoLinea: true,
        notas: notas || cotizacion.notasCliente,
        notasInternas: notasInternas || cotizacion.notasInternas,
        condicionesVenta,
        referenciaCliente: referenciaCliente || cotizacion.numero,
        creadoPorId: auth.user?.id || null,
        items: {
          create: itemsProcessed,
        },
      },
      include: {
        lead: { select: { id: true, nombre: true, email: true } },
        cotizacion: { select: { id: true, numero: true, titulo: true } },
        emisor: { select: { id: true, razonSocial: true } },
        items: {
          include: {
            catalogoItem: { select: { id: true, nombre: true, sku: true } },
          },
        },
      },
    })

    // Actualizar estado de la cotización
    await prisma.cotizacion.update({
      where: { id: cotizacion.id },
      data: { estado: 'aceptada' },
    })

    // Crear actividad si está asociada a un deal
    if (cotizacion.dealId) {
      await prisma.dealActivity.create({
        data: {
          dealId: cotizacion.dealId,
          tenantId: auth.tenant!.id,
          userId: auth.user?.id || '',
          tipo: 'orden_venta',
          titulo: 'Orden de venta creada desde cotización',
          descripcion: `Orden ${numero} creada desde cotización ${cotizacion.numero} por ${orden.total} ${orden.moneda}`,
        },
      })
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenant!.id,
        userId: auth.user?.id || 'api',
        accion: 'convertir',
        entidad: 'orden_venta',
        entidadId: orden.id,
        descripcion: `Orden de venta ${numero} creada desde cotización ${cotizacion.numero}`,
        cambiosDespues: { ordenId: orden.id, cotizacionId: cotizacion.id },
      },
    })

    // Notificación por Telegram al admin
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    notifyByTelegram(
      `💰 *Nueva Orden de Venta*\n\n📋 *Orden:* ${numero}\n💵 *Monto:* ${orden.total} ${orden.moneda}\n👤 *Cliente:* ${cotizacion.lead?.nombre || 'N/A'}\n📝 *Desde cotización:* ${cotizacion.numero}`,
      createSystemContext(tenantId)
    ).catch(err => console.error('Error en Notificación Telegram:', err))

    return NextResponse.json({
      orden,
      mensaje: `Orden de venta ${numero} creada exitosamente desde cotización ${cotizacion.numero}`,
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error al crear orden desde cotización:', error)
    return NextResponse.json(
      { error: 'Error al crear orden de venta', details: error.message },
      { status: 500 }
    )
  }
}
