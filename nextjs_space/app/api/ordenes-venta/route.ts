export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'
import { aplicaInversionSujetoPasivo } from '@/lib/fiscal-validation'
import { validateBody } from '@/lib/validation'
import { monedaEscritura } from '@/lib/moneda'
import { CommonSchemas } from '@/lib/validation/common'
import { z } from 'zod'

/** Schema de item de orden de venta que el cliente envía */
const OrdenVentaItemInputSchema = z.object({
  concepto: z.string().min(1).max(500),
  descripcion: z.string().max(2000).optional().nullable(),
  cantidad: z.coerce.number().min(0.01),
  precioUnitario: CommonSchemas.montoPositivo,
  descuento: z.coerce.number().min(0).default(0),
  unidad: z.string().max(20).optional(),
  tasaImpuestoId: CommonSchemas.id.optional().nullable(),
  porcentajeImpuesto: z.coerce.number().min(0).optional(),
  aplicaRetencion: z.boolean().optional(),
  porcentajeRetencion: z.coerce.number().min(0).optional(),
  catalogoItemId: CommonSchemas.id.optional().nullable(),
});

/** Schema de orden de venta que el cliente envía (campos calculados omitidos) */
const OrdenVentaInputSchema = z.object({
  leadId: CommonSchemas.id.optional().nullable(),
  contactId: CommonSchemas.id.optional().nullable(),
  contratoId: CommonSchemas.id.optional().nullable(),
  cotizacionId: CommonSchemas.id.optional().nullable(),
  dealId: CommonSchemas.id.optional().nullable(),
  emisorId: CommonSchemas.id.optional().nullable(),
  moneda: CommonSchemas.moneda,
  notas: z.string().max(5000).optional().nullable(),
  fechaOrden: z.string().datetime().optional(),
  fechaEntrega: z.string().datetime().optional().nullable(),
  descuentoGlobal: z.coerce.number().min(0).default(0),
  tipoDescuento: z.enum(['porcentaje', 'monto']).default('porcentaje'),
  redondeoLinea: z.boolean().default(true),
  notasInternas: z.string().max(5000).optional().nullable(),
  condicionesVenta: z.string().max(500).optional().nullable(),
  referenciaCliente: z.string().max(255).optional().nullable(),
  items: z.array(OrdenVentaItemInputSchema).optional().default([]),
});

// GET - Listar órdenes de venta
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['deals:read', 'orders:read'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const estado = searchParams.get('estado')
    const leadId = searchParams.get('leadId')
    const contactId = searchParams.get('contactId')
    const contratoId = searchParams.get('contratoId')
    const dealId = searchParams.get('dealId')
    const fechaDesde = searchParams.get('fechaDesde')
    const fechaHasta = searchParams.get('fechaHasta')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    const where: any = { tenantId: auth.tenant!.id }
    
    if (estado) where.estado = estado
    if (leadId) where.leadId = leadId
    if (contactId) where.contactId = contactId
    if (contratoId) where.contratoId = contratoId
    if (dealId) where.dealId = dealId
    
    if (fechaDesde || fechaHasta) {
      where.fechaOrden = {}
      if (fechaDesde) where.fechaOrden.gte = new Date(fechaDesde)
      if (fechaHasta) where.fechaOrden.lte = new Date(fechaHasta)
    }

    if (search) {
      where.OR = [
        { numero: { contains: search, mode: 'insensitive' } },
        { referenciaCliente: { contains: search, mode: 'insensitive' } },
        { lead: { nombre: { contains: search, mode: 'insensitive' } } },
        { contact: { nombre: { contains: search, mode: 'insensitive' } } }
      ]
    }

    const [ordenes, total] = await Promise.all([
      prisma.ordenVenta.findMany({
        where,
        include: {
          lead: { select: { id: true, nombre: true, email: true, empresa: true } },
          contact: { select: { id: true, nombre: true, email: true, tipo: true } },
          contrato: { select: { id: true, numero: true, titulo: true } },
          cotizacion: { select: { id: true, numero: true, titulo: true } },
          deal: { select: { id: true, titulo: true, valor: true } },
          emisor: { select: { id: true, razonSocial: true, idFiscal: true } },
          invoice: { select: { id: true, isSealed: true, fingerprint: true, verifactuVersion: true } },
          _count: { select: { items: true } }
        },
        orderBy: { fechaOrden: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.ordenVenta.count({ where })
    ])

    return NextResponse.json({
      ordenes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error al obtener órdenes de venta:', error)
    return NextResponse.json(
      { error: 'Error al obtener órdenes de venta' },
      { status: 500 }
    )
  }
}

// POST - Crear orden de venta
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['deals:write', 'orders:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const raw = await req.json()
    const parsed = validateBody(OrdenVentaInputSchema, raw)
    if (parsed instanceof NextResponse) return parsed

    const {
      leadId,
      contactId,
      contratoId,
      cotizacionId,
      dealId,
      emisorId,
      moneda,
      notas,
      fechaOrden,
      fechaEntrega,
      descuentoGlobal = 0,
      tipoDescuento = 'porcentaje',
      redondeoLinea = true,
      notasInternas,
      condicionesVenta,
      referenciaCliente,
      items = [],
    } = parsed

    // Validaciones de negocio
    if (!leadId && !contactId) {
      return NextResponse.json(
        { error: 'Se requiere leadId o contactId' },
        { status: 400 }
      )
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere al menos un item' },
        { status: 400 }
      )
    }

    // Generar número de orden
    const year = new Date().getFullYear()
    const ultimaOrden = await prisma.ordenVenta.findFirst({
      where: {
        tenantId: auth.tenant!.id,
        numero: { startsWith: `OV-${year}` }
      },
      orderBy: { numero: 'desc' }
    })

    let siguienteNumero = 1
    if (ultimaOrden) {
      const match = ultimaOrden.numero.match(/OV-\d{4}-(\d+)/)
      if (match) siguienteNumero = parseInt(match[1]) + 1
    }
    const numero = `OV-${year}-${String(siguienteNumero).padStart(4, '0')}`

    // Obtener perfil fiscal del cliente para determinar impuestos
    let perfilFiscalCliente = null
    if (leadId) {
      perfilFiscalCliente = await prisma.perfilFiscalCliente.findFirst({
        where: { leadId }
      })
    } else if (contactId) {
      perfilFiscalCliente = await prisma.perfilFiscalCliente.findFirst({
        where: { contactId }
      })
    }

    // Obtener emisor para verificar inversión de sujeto pasivo
    let emisor = null
    if (emisorId) {
      emisor = await prisma.configuracionFiscalEmisor.findFirst({
        where: { id: emisorId, tenantId: auth.tenant!.id }
      })
    } else {
      // Usar emisor principal
      emisor = await prisma.configuracionFiscalEmisor.findFirst({
        where: { tenantId: auth.tenant!.id, esPrincipal: true, activo: true }
      })
    }

    // Calcular si aplica inversión de sujeto pasivo
    const aplicaReverseCharge = emisor && perfilFiscalCliente 
      ? aplicaInversionSujetoPasivo(
          emisor.pais,
          perfilFiscalCliente.country || 'ES',
          !!perfilFiscalCliente.idIntracomunitario
        )
      : false

    // Procesar items y calcular totales
    const itemsProcessed = []
    let subtotalOrden = 0
    let totalImpuestosOrden = 0
    let totalRetencionesOrden = 0

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const cantidad = parseFloat(item.cantidad as any) || 1
      const precioUnitario = parseFloat(item.precioUnitario as any) || 0
      // Descuento por partida en porcentaje: fuera de 0–100 daría bases negativas
      const descuentoItem = Math.min(100, Math.max(0, parseFloat(item.descuento as any) || 0))

      // Calcular subtotal del item
      let subtotalItem = cantidad * precioUnitario
      if (descuentoItem > 0) {
        subtotalItem = subtotalItem * (1 - descuentoItem / 100)
      }

      // Redondear si es por línea
      if (redondeoLinea) {
        subtotalItem = Math.round(subtotalItem * 100) / 100
      }

      // Obtener tasa de impuesto
      let porcentajeImpuesto = 0
      let montoImpuesto = 0
      const tasaImpuestoId = item.tasaImpuestoId || null

      // Si el cliente es exento o aplica reverse charge, IVA = 0
      if (perfilFiscalCliente?.exentoImpuestos || aplicaReverseCharge) {
        porcentajeImpuesto = 0
      } else if (tasaImpuestoId) {
        const tasa = await prisma.tasaImpuesto.findFirst({
          where: { id: tasaImpuestoId, activo: true }
        })
        if (tasa) {
          porcentajeImpuesto = tasa.porcentaje
        }
      } else if (item.porcentajeImpuesto !== undefined) {
        porcentajeImpuesto = parseFloat(item.porcentajeImpuesto as any)
      } else if (perfilFiscalCliente?.defaultIva) {
        porcentajeImpuesto = Number(perfilFiscalCliente.defaultIva)
      }

      montoImpuesto = subtotalItem * (porcentajeImpuesto / 100)
      if (redondeoLinea) {
        montoImpuesto = Math.round(montoImpuesto * 100) / 100
      }

      // Calcular retención si aplica
      const aplicaRetencion = item.aplicaRetencion || perfilFiscalCliente?.aplicaRetencion || (Number(perfilFiscalCliente?.defaultIrpf) > 0)
      let porcentajeRetencion = 0
      let montoRetencion = 0

      if (aplicaRetencion) {
        if (item.porcentajeRetencion !== undefined) {
          porcentajeRetencion = parseFloat(item.porcentajeRetencion as any)
        } else if (perfilFiscalCliente?.defaultIrpf) {
          porcentajeRetencion = Number(perfilFiscalCliente.defaultIrpf)
        }
        
        montoRetencion = subtotalItem * (porcentajeRetencion / 100)
        if (redondeoLinea) {
          montoRetencion = Math.round(montoRetencion * 100) / 100
        }
      }

      const totalItem = subtotalItem + montoImpuesto - montoRetencion

      itemsProcessed.push({
        concepto: item.concepto,
        descripcion: item.descripcion || null,
        cantidad,
        unidad: item.unidad || 'unidad',
        precioUnitario,
        descuento: descuentoItem,
        tasaImpuestoId,
        porcentajeImpuesto,
        montoImpuesto,
        aplicaRetencion,
        porcentajeRetencion,
        montoRetencion,
        subtotal: subtotalItem,
        total: totalItem,
        orden: i
      } as any)

      subtotalOrden += subtotalItem
      totalImpuestosOrden += montoImpuesto
      totalRetencionesOrden += montoRetencion
    }

    // Aplicar descuento global
    let descuentoGlobalMonto = 0
    if (descuentoGlobal > 0) {
      if (tipoDescuento === 'porcentaje') {
        descuentoGlobalMonto = subtotalOrden * (descuentoGlobal / 100)
      } else {
        descuentoGlobalMonto = descuentoGlobal
      }
    }

    // Redondeo final si no es por línea
    if (!redondeoLinea) {
      subtotalOrden = Math.round(subtotalOrden * 100) / 100
      totalImpuestosOrden = Math.round(totalImpuestosOrden * 100) / 100
      totalRetencionesOrden = Math.round(totalRetencionesOrden * 100) / 100
    }

    const totalOrden = subtotalOrden - descuentoGlobalMonto + totalImpuestosOrden - totalRetencionesOrden

    // Crear orden con items
    const orden = await prisma.ordenVenta.create({
      data: {
        tenantId: auth.tenant!.id,
        numero,
        leadId: leadId || null,
        contactId: contactId || null,
        contratoId: contratoId || null,
        cotizacionId: cotizacionId || null,
        dealId: dealId || null,
        emisorId: emisor?.id || null,
        estado: 'borrador',
        fechaOrden: fechaOrden ? new Date(fechaOrden) : new Date(),
        fechaEntrega: fechaEntrega ? new Date(fechaEntrega) : null,
        subtotal: subtotalOrden,
        descuentoGlobal,
        tipoDescuento,
        totalImpuestos: totalImpuestosOrden,
        totalRetenciones: totalRetencionesOrden,
        total: Math.round(totalOrden * 100) / 100,
        // La divisa la dicta quien crea la orden; si no la indica, la del tenant.
        moneda: monedaEscritura(moneda, auth.tenant?.moneda),
        redondeoLinea,
        notas,
        notasInternas,
        condicionesVenta,
        referenciaCliente,
        creadoPorId: auth.user?.id || null,
        items: {
          create: itemsProcessed
        }
      } as any,
      include: {
        lead: { select: { id: true, nombre: true, email: true } },
        contact: { select: { id: true, nombre: true, email: true } },
        contrato: { select: { id: true, numero: true } },
        emisor: { select: { id: true, razonSocial: true } },
        items: true
      }
    })

    return NextResponse.json(orden, { status: 201 })
  } catch (error) {
    console.error('Error al crear orden de venta:', error)
    return NextResponse.json(
      { error: 'Error al crear orden de venta' },
      { status: 500 }
    )
  }
}
