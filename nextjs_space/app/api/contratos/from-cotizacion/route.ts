export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'
import { addContratoTimelineEvent } from '@/lib/contratos/timeline'

/**
 * POST /api/contratos/from-cotizacion
 * Convertir una cotización aceptada en contrato
 * Hereda: items, cliente, datos fiscales, referencias al catálogo
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['deals:write', 'contracts:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await req.json()
    const {
      cotizacionId,
      tipo = 'servicio', // servicio, producto, mixto, suscripcion
      fechaInicio,
      fechaFin,
      metodoPago,
      condicionesPago,
      frecuenciaPago, // mensual, trimestral, anual, unico
      diaPago,
      clausulas,
      notasInternas,
      notasCliente,
      ajustarPrecios = false,
    } = body

    if (!cotizacionId) {
      return NextResponse.json({ error: 'cotizacionId es requerido' }, { status: 400 })
    }

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

    // Verificar estado
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

    // Procesar items
    const itemsProcessed: any[] = []
    let subtotalContrato = 0
    let totalImpuestosContrato = 0

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

      // Si cliente exento, IVA = 0
      if (perfilFiscalCliente?.exentoImpuestos) {
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
        precioUnitario,
        descuento: item.descuento,
        subtotal: subtotalItem,
        tasaImpuestoId,
        porcentajeImpuesto,
        montoImpuesto,
        impuestos: montoImpuesto,
        aplicaRetencion,
        porcentajeRetencion,
        montoRetencion,
        total: totalItem,
        orden: item.orden,
        categoria: item.categoria,
        sku: item.sku,
        catalogoItemId: item.catalogoItemId,
      })

      subtotalContrato += subtotalItem
      totalImpuestosContrato += montoImpuesto
    }

    // Aplicar descuento global
    const descuentoPorcentaje = cotizacion.descuentoPorcentaje || 0
    const descuentoMonto = subtotalContrato * (descuentoPorcentaje / 100)
    const totalContrato = subtotalContrato - descuentoMonto + totalImpuestosContrato

    // Generar número de contrato
    const year = new Date().getFullYear()
    const ultimoContrato = await prisma.contrato.findFirst({
      where: {
        tenantId: auth.tenant!.id,
        numero: { startsWith: `CONT-${year}` },
      },
      orderBy: { numero: 'desc' },
    })

    let siguienteNumero = 1
    if (ultimoContrato) {
      const match = ultimoContrato.numero.match(/CONT-\d{4}-(\d+)/)
      if (match) siguienteNumero = parseInt(match[1]) + 1
    }
    const numero = `CONT-${year}-${String(siguienteNumero).padStart(4, '0')}`
    const tokenPublico = `${numero.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`

    // Crear contrato
    const contrato = await prisma.contrato.create({
      data: {
        tenantId: auth.tenant!.id,
        dealId: cotizacion.dealId,
        leadId: cotizacion.leadId,
        cotizacionId: cotizacion.id,
        numero,
        titulo: cotizacion.titulo,
        descripcion: cotizacion.descripcion,
        tipo,
        estado: 'borrador',
        subtotal: subtotalContrato,
        descuentoPorcentaje,
        descuentoMonto,
        impuestos: totalImpuestosContrato,
        total: Math.round(totalContrato * 100) / 100,
        moneda: cotizacion.moneda,
        metodoPago,
        condicionesPago: condicionesPago || cotizacion.terminosPago,
        frecuenciaPago,
        diaPago,
        clausulas,
        notasInternas: notasInternas || cotizacion.notasInternas,
        notasCliente: notasCliente || cotizacion.notasCliente,
        fechaInicio: fechaInicio ? new Date(fechaInicio) : null,
        fechaFin: fechaFin ? new Date(fechaFin) : null,
        clienteNombre: cotizacion.clienteNombre,
        clienteEmail: cotizacion.clienteEmail,
        clienteTelefono: cotizacion.clienteTelefono,
        clienteEmpresa: cotizacion.clienteEmpresa,
        clienteRfc: perfilFiscalCliente?.nif ?? null,
        clienteDireccion: perfilFiscalCliente?.address ?? null,
        creadoPorId: auth.user?.id || null,
        emisorId: cotizacion.emisorId,
        tokenPublico,
        items: {
          create: itemsProcessed,
        },
      },
      include: {
        items: {
          include: {
            catalogoItem: { select: { id: true, nombre: true, sku: true } },
          },
        },
        lead: { select: { id: true, nombre: true, email: true } },
        cotizacion: { select: { id: true, numero: true, titulo: true } },
        emisor: { select: { id: true, razonSocial: true } },
      },
    })

    // Crear pagos programados si es contrato de suscripción
    if (frecuenciaPago && frecuenciaPago !== 'unico' && fechaInicio && fechaFin) {
      const pagos = []
      const inicio = new Date(fechaInicio)
      const fin = new Date(fechaFin)
      const fechaPago = new Date(inicio)
      let numeroPago = 1

      // Calcular monto por pago
      let totalPagos = 1
      if (frecuenciaPago === 'mensual') {
        totalPagos = Math.ceil((fin.getTime() - inicio.getTime()) / (30 * 24 * 60 * 60 * 1000))
      } else if (frecuenciaPago === 'trimestral') {
        totalPagos = Math.ceil((fin.getTime() - inicio.getTime()) / (90 * 24 * 60 * 60 * 1000))
      } else if (frecuenciaPago === 'anual') {
        totalPagos = Math.ceil((fin.getTime() - inicio.getTime()) / (365 * 24 * 60 * 60 * 1000))
      }
      const montoPorPago = Math.round((contrato.total / totalPagos) * 100) / 100

      while (fechaPago <= fin) {
        pagos.push({
          contratoId: contrato.id,
          tenantId: auth.tenant!.id,
          numero: `${contrato.numero}-P${String(numeroPago).padStart(2, '0')}`,
          monto: montoPorPago,
          moneda: contrato.moneda,
          estado: 'pendiente',
          fechaProgramada: new Date(fechaPago),
        })

        // Avanzar fecha
        if (frecuenciaPago === 'mensual') {
          fechaPago.setMonth(fechaPago.getMonth() + 1)
        } else if (frecuenciaPago === 'trimestral') {
          fechaPago.setMonth(fechaPago.getMonth() + 3)
        } else if (frecuenciaPago === 'anual') {
          fechaPago.setFullYear(fechaPago.getFullYear() + 1)
        }
        numeroPago++

        if (numeroPago > 120) break // Límite de seguridad
      }

      if (pagos.length > 0) {
        await prisma.contratoPago.createMany({ data: pagos })
        await addContratoTimelineEvent({
          contratoId: contrato.id,
          actorId: auth.user?.id || null,
          actorType: 'USER',
          action: 'plan_pagos',
          note: `Plan de pagos generado: ${pagos.length} pagos de ${montoPorPago.toLocaleString()} ${contrato.moneda} (${frecuenciaPago})`,
          metadata: { cantidadPagos: pagos.length, montoPorPago, frecuenciaPago, moneda: contrato.moneda },
        })
      }
    }

    // Timeline: evento de creación (después de crear los pagos para que queden primero)
    await addContratoTimelineEvent({
      contratoId: contrato.id,
      actorId: auth.user?.id || null,
      actorType: 'USER',
      action: 'created',
      note: `Contrato ${numero} creado desde la cotización ${cotizacion.numero} por ${contrato.total} ${contrato.moneda}`,
      metadata: { numero, cotizacionId: cotizacion.id, total: contrato.total, moneda: contrato.moneda },
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
          tipo: 'contrato',
          titulo: 'Contrato creado desde cotización',
          descripcion: `Contrato ${numero} creado desde cotización ${cotizacion.numero} por ${contrato.total} ${contrato.moneda}`,
        },
      })
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenant!.id,
        userId: auth.user?.id || 'api',
        accion: 'convertir',
        entidad: 'contrato',
        entidadId: contrato.id,
        descripcion: `Contrato ${numero} creado desde cotización ${cotizacion.numero}`,
        cambiosDespues: { contratoId: contrato.id, cotizacionId: cotizacion.id },
      },
    })

    return NextResponse.json({
      contrato,
      mensaje: `Contrato ${numero} creado exitosamente desde cotización ${cotizacion.numero}`,
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error al crear contrato desde cotización:', error)
    return NextResponse.json(
      { error: 'Error al crear contrato', details: error.message },
      { status: 500 }
    )
  }
}
