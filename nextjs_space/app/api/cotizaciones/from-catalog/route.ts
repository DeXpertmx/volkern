export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'

interface CatalogItemRequest {
  catalogoItemId: string
  cantidad: number
  descuento?: number
  precioOverride?: number // Para sobrescribir precio del catálogo
  descripcionOverride?: string
}

/**
 * POST /api/cotizaciones/from-catalog
 * Crear cotización pre-poblada desde items del catálogo
 * Los items heredan: nombre, descripción, SKU, precio, impuestos, categoría fiscal
 * También aplica descuentos por volumen si están configurados en el catálogo
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['deals:write', 'quotes:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await req.json()
    const {
      dealId,
      leadId,
      titulo,
      descripcion,
      catalogItems, // Array de { catalogoItemId, cantidad, descuento?, precioOverride? }
      descuentoPorcentaje = 0,
      moneda,
      validezDias = 30,
      terminosPago,
      notasCliente,
      notasInternas,
      clienteNombre,
      clienteEmail,
      clienteEmpresa,
      clienteTelefono,
      emisorId,
    } = body as {
      dealId?: string
      leadId?: string
      titulo: string
      descripcion?: string
      catalogItems: CatalogItemRequest[]
      descuentoPorcentaje?: number
      moneda?: string
      validezDias?: number
      terminosPago?: string
      notasCliente?: string
      notasInternas?: string
      clienteNombre?: string
      clienteEmail?: string
      clienteEmpresa?: string
      clienteTelefono?: string
      emisorId?: string
    }

    if (!titulo) {
      return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })
    }

    if (!catalogItems || catalogItems.length === 0) {
      return NextResponse.json({ error: 'Se requiere al menos un item del catálogo' }, { status: 400 })
    }

    // Obtener todos los items del catálogo de una sola consulta
    const catalogoItemIds = catalogItems.map(ci => ci.catalogoItemId)
    const catalogoItems = await prisma.catalogoItem.findMany({
      where: {
        id: { in: catalogoItemIds },
        tenantId: auth.tenant!.id,
      },
      include: {
        tasaImpuesto: true,
      },
    })

    // Crear mapa para acceso rápido
    const catalogoMap = new Map(catalogoItems.map(item => [item.id, item]))

    // Verificar que todos los items existan
    for (const ci of catalogItems) {
      if (!catalogoMap.has(ci.catalogoItemId)) {
        return NextResponse.json(
          { error: `Item del catálogo no encontrado: ${ci.catalogoItemId}` },
          { status: 404 }
        )
      }
    }

    // Determinar moneda (de los items del catálogo o parámetro)
    const monedaFinal = moneda || catalogoItems[0]?.moneda || 'EUR'

    // Procesar items y calcular totales
    const processedItems: any[] = []
    let subtotalCotizacion = 0
    let totalImpuestosCotizacion = 0

    for (let i = 0; i < catalogItems.length; i++) {
      const ci = catalogItems[i]
      const catalogoItem = catalogoMap.get(ci.catalogoItemId)!
      const pricing = catalogoItem.pricing as any || {}

      // Determinar precio (puede ser override o del catálogo)
      let precioUnitario = ci.precioOverride ?? catalogoItem.precioBase

      // Aplicar descuento por volumen si existe
      if (pricing.descuentos && Array.isArray(pricing.descuentos)) {
        const descuentoVolumen = pricing.descuentos.find((d: any) => {
          return ci.cantidad >= (d.cantidad_minima || 0) &&
            (d.cantidad_maxima === undefined || ci.cantidad <= d.cantidad_maxima)
        })
        if (descuentoVolumen && descuentoVolumen.porcentaje) {
          precioUnitario = precioUnitario * (1 - descuentoVolumen.porcentaje / 100)
        }
      }

      const cantidad = ci.cantidad || 1
      const descuentoItem = ci.descuento || 0

      // Calcular subtotal del item
      let subtotalItem = cantidad * precioUnitario
      if (descuentoItem > 0) {
        subtotalItem = subtotalItem * (1 - descuentoItem / 100)
      }
      subtotalItem = Math.round(subtotalItem * 100) / 100

      // Calcular impuestos
      const porcentajeImpuesto = catalogoItem.tasaImpuesto?.porcentaje || 0
      const montoImpuesto = Math.round(subtotalItem * (porcentajeImpuesto / 100) * 100) / 100

      const totalItem = subtotalItem + montoImpuesto

      processedItems.push({
        catalogoItemId: catalogoItem.id,
        concepto: catalogoItem.nombre,
        descripcion: ci.descripcionOverride || catalogoItem.descripcion,
        cantidad,
        precioUnitario,
        descuento: descuentoItem,
        subtotal: subtotalItem,
        tasaImpuestoId: catalogoItem.tasaImpuestoId,
        porcentajeImpuesto,
        montoImpuesto,
        impuestos: montoImpuesto,
        total: totalItem,
        orden: i,
        categoria: catalogoItem.categoriaFiscal,
        sku: catalogoItem.sku,
        aplicaRetencion: false,
        montoRetencion: 0,
        porcentajeRetencion: 0,
      })

      subtotalCotizacion += subtotalItem
      totalImpuestosCotizacion += montoImpuesto
    }

    // Aplicar descuento global
    const descuentoMonto = subtotalCotizacion * (descuentoPorcentaje / 100)
    const baseImponible = subtotalCotizacion - descuentoMonto

    // Recalcular impuestos después del descuento global
    const impuestosProporcionales = totalImpuestosCotizacion * (baseImponible / subtotalCotizacion)
    const totalFinal = baseImponible + impuestosProporcionales

    // Generar número de cotización
    const año = new Date().getFullYear()
    const ultimaCotizacion = await prisma.cotizacion.findFirst({
      where: {
        tenantId: auth.tenant!.id,
        numero: { startsWith: `COT-${año}-` },
      },
      orderBy: { numero: 'desc' },
    })

    let numeroSecuencial = 1
    if (ultimaCotizacion) {
      const partes = ultimaCotizacion.numero.split('-')
      numeroSecuencial = parseInt(partes[2]) + 1
    }

    const numero = `COT-${año}-${numeroSecuencial.toString().padStart(4, '0')}`
    const tokenPublico = `${numero.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`

    // Crear cotización
    const cotizacion = await prisma.cotizacion.create({
      data: {
        tenantId: auth.tenant!.id,
        dealId: dealId || null,
        leadId: leadId || null,
        creadoPorId: auth.user?.id || null,
        emisorId: emisorId || null,
        numero,
        titulo,
        descripcion,
        subtotal: subtotalCotizacion,
        descuentoPorcentaje,
        descuentoMonto,
        impuestos: impuestosProporcionales,
        total: Math.round(totalFinal * 100) / 100,
        moneda: monedaFinal,
        validezDias,
        terminosPago,
        notasCliente,
        notasInternas,
        clienteNombre,
        clienteEmail,
        clienteEmpresa,
        clienteTelefono,
        tokenPublico,
        fechaVencimiento: new Date(Date.now() + validezDias * 24 * 60 * 60 * 1000),
        items: {
          create: processedItems,
        },
      },
      include: {
        items: {
          include: {
            catalogoItem: {
              select: { id: true, nombre: true, sku: true },
            },
          },
          orderBy: { orden: 'asc' },
        },
        deal: { select: { id: true, titulo: true } },
        lead: { select: { id: true, nombre: true, email: true } },
        emisor: { select: { id: true, razonSocial: true } },
      },
    })

    // Crear actividad si está asociada a un deal
    if (dealId) {
      await prisma.dealActivity.create({
        data: {
          dealId,
          tenantId: auth.tenant!.id,
          userId: auth.user?.id || '',
          tipo: 'cotizacion',
          titulo: 'Cotización creada desde catálogo',
          descripcion: `Cotización ${numero} creada con ${catalogItems.length} items del catálogo por ${cotizacion.total} ${monedaFinal}`,
        },
      })
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenant!.id,
        userId: auth.user?.id || 'api',
        accion: 'crear',
        entidad: 'cotizacion',
        entidadId: cotizacion.id,
        descripcion: `Cotización ${numero} creada desde catálogo con ${catalogItems.length} items`,
        cambiosDespues: { cotizacionId: cotizacion.id, catalogItemIds: catalogoItemIds },
      },
    })

    return NextResponse.json({ cotizacion }, { status: 201 })
  } catch (error: any) {
    console.error('Error al crear cotización desde catálogo:', error)
    return NextResponse.json(
      { error: 'Error al crear cotización', details: error.message },
      { status: 500 }
    )
  }
}
