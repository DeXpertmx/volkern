export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'
import { skills } from '@/lib/skills'

// GET - Obtener orden de venta específica
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['deals:read', 'orders:read'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const orden = await prisma.ordenVenta.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      },
      include: {
        lead: {
          select: { id: true, nombre: true, email: true, empresa: true, telefono: true }
        },
        contact: {
          select: { id: true, nombre: true, email: true, tipo: true, telefono: true }
        },
        contrato: {
          select: { id: true, numero: true, titulo: true, estado: true }
        },
        cotizacion: {
          select: { id: true, numero: true, titulo: true, estado: true }
        },
        deal: {
          select: { id: true, titulo: true, valor: true, etapa: true }
        },
        emisor: {
          select: {
            id: true, razonSocial: true, nombreComercial: true,
            idFiscal: true, tipoIdFiscal: true, pais: true,
            direccion: true, ciudad: true, codigoPostal: true,
            email: true, telefono: true, logoUrl: true
          }
        },
        creadoPor: {
          select: { id: true, name: true, email: true }
        },
        items: {
          include: {
            tasaImpuesto: {
              select: { id: true, nombre: true, codigo: true, porcentaje: true }
            }
          },
          orderBy: { orden: 'asc' }
        }
      }
    })

    if (!orden) {
      return NextResponse.json(
        { error: 'Orden de venta no encontrada' },
        { status: 404 }
      )
    }

    // Obtener perfil fiscal del cliente
    let perfilFiscal = null
    if (orden.leadId) {
      perfilFiscal = await prisma.perfilFiscalCliente.findFirst({
        where: { leadId: orden.leadId }
      })
    } else if (orden.contactId) {
      perfilFiscal = await prisma.perfilFiscalCliente.findFirst({
        where: { contactId: orden.contactId }
      })
    }

    return NextResponse.json({
      ...orden,
      perfilFiscalCliente: perfilFiscal
    })
  } catch (error) {
    console.error('Error al obtener orden de venta:', error)
    return NextResponse.json(
      { error: 'Error al obtener orden de venta' },
      { status: 500 }
    )
  }
}

// PATCH - Actualizar orden de venta
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['deals:write', 'orders:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await req.json()

    // Verificar que existe y pertenece al tenant
    const ordenExistente = await prisma.ordenVenta.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      }
    })

    if (!ordenExistente) {
      return NextResponse.json(
        { error: 'Orden de venta no encontrada' },
        { status: 404 }
      )
    }

    // Solo se puede editar si está en borrador
    if (ordenExistente.estado !== 'borrador' && body.items) {
      return NextResponse.json(
        { error: 'Solo se pueden modificar los items de órdenes en estado borrador' },
        { status: 400 }
      )
    }

    // Preparar datos para actualizar
    const updateData: any = {}
    
    // Campos que siempre se pueden actualizar
    if (body.estado !== undefined) {
      // Validar transiciones de estado
      const transicionesValidas: Record<string, string[]> = {
        'borrador': ['confirmada', 'cancelada'],
        'confirmada': ['pendiente_finanzas', 'cancelada'],
        'pendiente_finanzas': ['facturada', 'confirmada', 'cancelada'],
        'facturada': ['entregada'],
        'entregada': [],
        'cancelada': []
      }
      
      if (!transicionesValidas[ordenExistente.estado]?.includes(body.estado)) {
        return NextResponse.json(
          { error: `No se puede cambiar de ${ordenExistente.estado} a ${body.estado}` },
          { status: 400 }
        )
      }
      updateData.estado = body.estado
      
      if (body.estado === 'facturada') {
        updateData.fechaFacturacion = new Date()
      }

      // 📦 INTEGRACIÓN MRP: Si la orden se confirma, procesar consumo de inventario
      if (body.estado === 'confirmada' && ordenExistente.estado !== 'confirmada') {
        // En un paso posterior ejecutaremos el consumo fuera de la transacción principal
        // para evitar bloqueos largos, pero aquí marcamos la intención.
      }
    }

    if (body.fechaEntrega !== undefined) {
      updateData.fechaEntrega = body.fechaEntrega ? new Date(body.fechaEntrega) : null
    }
    if (body.notas !== undefined) updateData.notas = body.notas
    if (body.notasInternas !== undefined) updateData.notasInternas = body.notasInternas
    if (body.condicionesVenta !== undefined) updateData.condicionesVenta = body.condicionesVenta
    if (body.referenciaCliente !== undefined) updateData.referenciaCliente = body.referenciaCliente
    if (body.emisorId !== undefined) updateData.emisorId = body.emisorId

    // Si hay items y está en borrador, recalcular totales
    if (body.items && ordenExistente.estado === 'borrador') {
      // Eliminar items existentes
      await prisma.ordenVentaItem.deleteMany({
        where: { ordenVentaId: params.id }
      })

      // Crear nuevos items y calcular totales (similar a POST)
      let subtotalOrden = 0
      let totalImpuestosOrden = 0
      let totalRetencionesOrden = 0
      const redondeoLinea = body.redondeoLinea ?? ordenExistente.redondeoLinea

      const itemsToCreate = body.items.map((item: any, i: number) => {
        const cantidad = parseFloat(item.cantidad) || 1
        const precioUnitario = parseFloat(item.precioUnitario) || 0
        const descuentoItem = parseFloat(item.descuento) || 0

        let subtotalItem = cantidad * precioUnitario * (1 - descuentoItem / 100)
        if (redondeoLinea) subtotalItem = Math.round(subtotalItem * 100) / 100

        const porcentajeImpuesto = parseFloat(item.porcentajeImpuesto) || 0
        let montoImpuesto = subtotalItem * (porcentajeImpuesto / 100)
        if (redondeoLinea) montoImpuesto = Math.round(montoImpuesto * 100) / 100

        const porcentajeRetencion = parseFloat(item.porcentajeRetencion) || 0
        let montoRetencion = subtotalItem * (porcentajeRetencion / 100)
        if (redondeoLinea) montoRetencion = Math.round(montoRetencion * 100) / 100

        const totalItem = subtotalItem + montoImpuesto - montoRetencion

        subtotalOrden += subtotalItem
        totalImpuestosOrden += montoImpuesto
        totalRetencionesOrden += montoRetencion

        return {
          ordenVentaId: params.id,
          concepto: item.concepto,
          descripcion: item.descripcion || null,
          cantidad,
          unidad: item.unidad || 'unidad',
          precioUnitario,
          descuento: descuentoItem,
          tasaImpuestoId: item.tasaImpuestoId || null,
          porcentajeImpuesto,
          montoImpuesto,
          aplicaRetencion: item.aplicaRetencion || false,
          porcentajeRetencion,
          montoRetencion,
          subtotal: subtotalItem,
          total: totalItem,
          orden: i
        }
      })

      await prisma.ordenVentaItem.createMany({ data: itemsToCreate })

      // Actualizar totales
      const descuentoGlobal = body.descuentoGlobal ?? ordenExistente.descuentoGlobal
      const tipoDescuento = body.tipoDescuento ?? ordenExistente.tipoDescuento
      const descuentoGlobalMonto = tipoDescuento === 'porcentaje' 
        ? subtotalOrden * (descuentoGlobal / 100) 
        : descuentoGlobal

      updateData.subtotal = subtotalOrden
      updateData.totalImpuestos = totalImpuestosOrden
      updateData.totalRetenciones = totalRetencionesOrden
      updateData.total = Math.round((subtotalOrden - descuentoGlobalMonto + totalImpuestosOrden - totalRetencionesOrden) * 100) / 100
      if (body.descuentoGlobal !== undefined) updateData.descuentoGlobal = descuentoGlobal
      if (body.tipoDescuento !== undefined) updateData.tipoDescuento = tipoDescuento
      if (body.redondeoLinea !== undefined) updateData.redondeoLinea = redondeoLinea
    }

    const orden = await prisma.ordenVenta.update({
      where: { id: params.id },
      data: updateData,
      include: {
        lead: { select: { id: true, nombre: true, email: true } },
        contact: { select: { id: true, nombre: true, email: true } },
        emisor: { select: { id: true, razonSocial: true } },
        items: { orderBy: { orden: 'asc' } }
      }
    })

    // 📦 EJECUCIÓN DEL CONSUMO (Post-Update)
    if (body.estado === 'confirmada' && ordenExistente.estado !== 'confirmada') {
      try {
        // Obtener los items de la orden que están vinculados al catálogo
        const orderItems = await prisma.ordenVentaItem.findMany({
          where: { 
            ordenVentaId: params.id,
            catalogoItemId: { not: null }
          }
        });

        console.log(`[MRP-Integration] Processing consumption for ${orderItems.length} items from Order ${params.id}`);

        for (const item of orderItems) {
          if (item.catalogoItemId) {
            await skills.process_inventory_consumption({
              tenantId: auth.tenant!.id,
              productId: item.catalogoItemId,
              quantity: item.cantidad,
              userId: auth.user!.id
            });
          }
        }

        // Activar Watchdog de salud de inventario
        skills.inventory_watchdog({ tenantId: auth.tenant!.id }).catch(err => {
          console.error('[InventoryWatchdog] Error in Post-Sale check:', err);
        });

      } catch (consumeError) {
        console.error('[MRP-Integration] Error during automated inventory consumption:', consumeError);
        // No bloqueamos la respuesta de la orden, pero logeamos el error crítico
      }
    }

    return NextResponse.json(orden)
  } catch (error) {
    console.error('Error al actualizar orden de venta:', error)
    return NextResponse.json(
      { error: 'Error al actualizar orden de venta' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar orden de venta
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['deals:write', 'orders:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    // Verificar que existe y pertenece al tenant
    const orden = await prisma.ordenVenta.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      }
    })

    if (!orden) {
      return NextResponse.json(
        { error: 'Orden de venta no encontrada' },
        { status: 404 }
      )
    }

    // Solo se puede eliminar si está en borrador o cancelada
    if (!['borrador', 'cancelada'].includes(orden.estado)) {
      return NextResponse.json(
        { error: 'Solo se pueden eliminar órdenes en estado borrador o cancelada' },
        { status: 400 }
      )
    }

    // Eliminar items primero (aunque deberia ser cascade)
    await prisma.ordenVentaItem.deleteMany({
      where: { ordenVentaId: params.id }
    })

    await prisma.ordenVenta.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ message: 'Orden de venta eliminada correctamente' })
  } catch (error) {
    console.error('Error al eliminar orden de venta:', error)
    return NextResponse.json(
      { error: 'Error al eliminar orden de venta' },
      { status: 500 }
    )
  }
}
