export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { validateBody } from '@/lib/validation'
import { CommonSchemas } from '@/lib/validation/common'
import { z } from 'zod'

/** Schema de item de cotización que el cliente envía (sin campos calculados) */
const CotizacionItemInputSchema = z.object({
  concepto: z.string().min(1).max(500),
  descripcion: z.string().max(2000).optional().nullable(),
  cantidad: z.coerce.number().min(0.01),
  precioUnitario: CommonSchemas.montoPositivo,
  descuento: z.coerce.number().min(0).default(0),
  tasaImpuestoId: CommonSchemas.id.optional().nullable(),
  porcentajeImpuesto: z.coerce.number().min(0).optional(),
  aplicaRetencion: z.boolean().optional(),
  porcentajeRetencion: z.coerce.number().min(0).optional(),
  catalogoItemId: CommonSchemas.id.optional().nullable(),
  categoria: z.string().max(100).optional(),
  sku: z.string().max(50).optional(),
});

/** Schema de cotización que el cliente envía (sin campos calculados) */
const CotizacionInputSchema = z.object({
  dealId: CommonSchemas.id.optional().nullable(),
  leadId: CommonSchemas.id.optional().nullable(),
  contactId: CommonSchemas.id.optional().nullable(),
  titulo: z.string().min(1, 'Título requerido').max(500),
  descripcion: z.string().max(5000).optional().nullable(),
  items: z.array(CotizacionItemInputSchema).min(1, 'Se requiere al menos un item').max(200),
  descuentoPorcentaje: z.coerce.number().min(0).max(100).default(0),
  moneda: CommonSchemas.moneda,
  validezDias: z.coerce.number().int().min(1).max(365).default(30),
  terminosPago: z.string().max(500).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
  notasInternas: z.string().max(5000).optional().nullable(),
  clienteNombre: z.string().max(500).optional().nullable(),
  clienteEmail: z.string().email().optional().nullable(),
  clienteEmpresa: z.string().max(255).optional().nullable(),
  clienteTelefono: z.string().max(30).optional().nullable(),
  emisorId: CommonSchemas.id.optional().nullable(),
});

// GET - Listar cotizaciones
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url)
    const dealId = searchParams.get('dealId')
    const leadId = searchParams.get('leadId')
    const estado = searchParams.get('estado')

    const where: any = {
      tenantId: tenantId,
    }

    if (dealId) where.dealId = dealId
    if (leadId) where.leadId = leadId
    if (estado) where.estado = estado

    // El proxy de prisma redirige automáticamente a la base de datos física del tenant
    const cotizaciones = await prisma.cotizacion.findMany({
      where,
      include: {
        deal: {
          select: {
            id: true,
            titulo: true,
          },
        },
        lead: {
          select: {
            id: true,
            nombre: true,
            email: true,
            empresa: true,
          },
        },
        items: {
          orderBy: {
            orden: 'asc',
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    })

    return NextResponse.json({ cotizaciones })
  } catch (error: any) {
    console.error('Error al obtener cotizaciones:', error)
    return NextResponse.json(
      { error: 'Error al obtener cotizaciones', details: error.message },
      { status: 500 }
    )
  }
}, ['quotes:read', 'cotizaciones:read'])

// POST - Crear cotización
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;

    const raw = await req.json()
    const parsed = validateBody(CotizacionInputSchema, raw)
    if (parsed instanceof NextResponse) return parsed

    const {
      dealId,
      leadId,
      titulo,
      descripcion,
      items,
      descuentoPorcentaje = 0,
      moneda = 'EUR',
      validezDias = 30,
      terminosPago,
      notasCliente,
      notasInternas,
      clienteNombre,
      clienteEmail,
      clienteEmpresa,
      clienteTelefono,
      emisorId,
    } = parsed

    // 1. Pre-cargar datos del catálogo si es necesario
    const catalogoItemIds = items
      .filter((i: any) => i.catalogoItemId)
      .map((i: any) => i.catalogoItemId)
    
    let catalogoMap = new Map()
    if (catalogoItemIds.length > 0) {
      const catalogoItems = await prisma.catalogoItem.findMany({
        where: {
          id: { in: catalogoItemIds },
          tenantId: tenantId,
        },
        include: { tasaImpuesto: true },
      })
      catalogoMap = new Map(catalogoItems.map(c => [c.id, c]))
    }

    // 2. Procesar items
    const processedItems: any[] = []
    let subtotalCalc = 0
    let totalImpuestosCalc = 0

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const catalogoItem = item.catalogoItemId ? catalogoMap.get(item.catalogoItemId) : null

      const concepto = item.concepto || catalogoItem?.nombre
      const descripcionItem = item.descripcion ?? catalogoItem?.descripcion
      const cantidad = parseFloat(item.cantidad as any) || 1
      const precioUnitario = parseFloat(item.precioUnitario as any) ?? catalogoItem?.precioBase ?? 0
      const descuentoItem = parseFloat((item.descuento as any) || 0)
      const categoria = item.categoria || catalogoItem?.categoriaFiscal
      const sku = item.sku || catalogoItem?.sku
      const tasaImpuestoId = item.tasaImpuestoId || catalogoItem?.tasaImpuestoId

      let subtotalItem = cantidad * precioUnitario
      if (descuentoItem > 0) {
        subtotalItem = subtotalItem * (1 - descuentoItem / 100)
      }
      subtotalItem = Math.round(subtotalItem * 100) / 100

      let porcentajeImpuesto = parseFloat((item.porcentajeImpuesto as any) || 0)
      if (catalogoItem?.tasaImpuesto && !item.porcentajeImpuesto) {
        porcentajeImpuesto = catalogoItem.tasaImpuesto.porcentaje
      }
      const montoImpuesto = Math.round(subtotalItem * (porcentajeImpuesto / 100) * 100) / 100

      const totalItem = subtotalItem + montoImpuesto

      processedItems.push({
        catalogoItemId: item.catalogoItemId || null,
        concepto,
        descripcion: descripcionItem,
        cantidad,
        precioUnitario,
        descuento: descuentoItem,
        subtotal: subtotalItem,
        tasaImpuestoId,
        porcentajeImpuesto,
        montoImpuesto,
        impuestos: montoImpuesto,
        total: totalItem,
        orden: i + 1,
        categoria,
        sku,
        aplicaRetencion: item.aplicaRetencion || false,
        porcentajeRetencion: parseFloat((item.porcentajeRetencion as any) || 0),
        montoRetencion: 0,
      })

      subtotalCalc += subtotalItem
      totalImpuestosCalc += montoImpuesto
    }

    const subtotal = subtotalCalc
    const descuentoMonto = subtotal * (descuentoPorcentaje / 100)
    const baseImponible = subtotal - descuentoMonto
    const impuestosProporcionales = totalImpuestosCalc * (baseImponible / subtotal || 1)
    const total = baseImponible + impuestosProporcionales

    // 3. Generar número de cotización (Secuencial por Tenant)
    const año = new Date().getFullYear()
    const ultimaCotizacion = await prisma.cotizacion.findFirst({
      where: {
        tenantId: tenantId,
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

    // 4. Crear cotización en la DB física del tenant
    const cotizacion = await prisma.cotizacion.create({
      data: {
        tenantId: tenantId,
        dealId: dealId || null,
        leadId: leadId || null,
        creadoPorId: userId,
        emisorId: emisorId || null,
        numero,
        titulo,
        descripcion,
        subtotal,
        descuentoPorcentaje,
        descuentoMonto,
        impuestos: impuestosProporcionales,
        total: Math.round(total * 100) / 100,
        moneda,
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
      } as any,
      include: {
        items: {
          include: {
            catalogoItem: { select: { id: true, nombre: true, sku: true } },
          },
          orderBy: { orden: 'asc' },
        },
        deal: true,
        lead: true,
        emisor: true,
      },
    })

    // 5. Audit log y Actividades
    if (dealId) {
      await prisma.dealActivity.create({
        data: {
          dealId,
          tenantId: tenantId,
          userId: userId,
          tipo: 'cotizacion',
          titulo: 'Cotización creada',
          descripcion: `Cotización ${numero} creada por ${total} ${moneda}`,
        },
      })
    }

    const { AuditService } = await import('@/lib/audit-service');
    const requestIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;
    await AuditService.log({
      tenantId: tenantId,
      userId: userId,
      action: 'crear',
      entity: 'cotizacion',
      entityId: cotizacion.id,
      description: `Cotización ${numero} creada`,
      changesAfter: cotizacion,
      ipAddress: requestIp,
      userAgent
    });

    return NextResponse.json({ cotizacion }, { status: 201 })
  } catch (error: any) {
    console.error('Error al crear cotización:', error)
    return NextResponse.json(
      { error: 'Error al crear cotización', details: error.message },
      { status: 500 }
    )
  }
}, ['quotes:write', 'cotizaciones:write'])
