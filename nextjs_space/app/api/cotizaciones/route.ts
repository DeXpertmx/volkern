export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { validateBody } from '@/lib/validation'
import { CotizacionInputSchema, calculateCotizacionItems } from '@/lib/cotizaciones/cotizacion-calculator'

export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url)
    const dealId = searchParams.get('dealId')
    const leadId = searchParams.get('leadId')
    const contactId = searchParams.get('contactId')
    const companyId = searchParams.get('companyId')
    const estado = searchParams.get('estado')

    const where: any = {
      tenantId: tenantId,
    }

    if (dealId) where.dealId = dealId
    if (leadId) where.leadId = leadId
    if (contactId) where.contactId = contactId
    if (companyId) {
      where.OR = [
        { contactId: companyId },
        { deal: { companyId } },
      ]
    }
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
      contactId,
      titulo,
      descripcion,
      items,
      descuentoPorcentaje = 0,
      impuestos = 0,
      moneda = 'EUR',
      validezDias = 30,
      terminosPago,
      clausulas,
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

    // 2. Procesar items. El descuento de línea es un importe fijo.
    const calculated = calculateCotizacionItems(items, catalogoMap, impuestos)
    if ('error' in calculated) {
      return NextResponse.json({ error: calculated.error }, { status: 400 })
    }

    const { processedItems, subtotal, totalImpuestos } = calculated
    const descuentoMonto = Math.round(subtotal * (descuentoPorcentaje / 100) * 100) / 100
    const baseImponible = Math.round((subtotal - descuentoMonto) * 100) / 100
    const impuestosProporcionales = Math.round(totalImpuestos * (baseImponible / subtotal || 1) * 100) / 100
    const total = Math.round((baseImponible + impuestosProporcionales) * 100) / 100

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
        contactId: contactId || null,
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
        clausulas,
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
