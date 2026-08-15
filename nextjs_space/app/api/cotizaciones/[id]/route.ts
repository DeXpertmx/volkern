export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { ComplianceGate } from '@/lib/compliance-gate'
import { validateBody } from '@/lib/validation'
import { CotizacionInputSchema, calculateCotizacionItems } from '@/app/api/cotizaciones/route'

function getCotizacionId(context: any): string | undefined {
  // Next entrega { params: { id } }; algunos tests y consumidores antiguos
  // pasan directamente { id }. Soportamos ambas formas.
  return context?.params?.id ?? context?.id
}

// GET - Obtener cotización por ID
export const GET = withTenantAuth(async (req, auth, params) => {
  try {
    const cotizacionId = getCotizacionId(params)
    if (!cotizacionId) {
      return NextResponse.json({ error: 'ID de cotización requerido' }, { status: 400 })
    }
    const tenantId = auth.tenant!.id;

    // El proxy de prisma redirige automáticamente a la base de datos física del tenant
    const cotizacion = await prisma.cotizacion.findFirst({
      where: {
        id: cotizacionId,
        tenantId: tenantId,
      },
      include: {
        items: {
          orderBy: {
            orden: 'asc',
          },
        },
        deal: {
          include: {
            lead: true,
          },
        },
        lead: true,
        // El proxy de prisma redirigirá automáticamente este include al Control Plane (Global DB)
        // porque 'tenant' está en GLOBAL_MODELS
        tenant: {
          select: {
            nombre: true,
            dominio: true,
            configuracion: true,
          },
        },
      },
    })

    if (!cotizacion) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ cotizacion })
  } catch (error: any) {
    console.error('Error al obtener cotización:', error)
    return NextResponse.json(
      { error: 'Error al obtener cotización', details: error.message },
      { status: 500 }
    )
  }
}, ['quotes:read', 'cotizaciones:read'])

// PATCH - Actualizar cotización
export const PATCH = withTenantAuth(async (req, auth, params) => {
  try {
    const cotizacionId = getCotizacionId(params)
    if (!cotizacionId) {
      return NextResponse.json({ error: 'ID de cotización requerido' }, { status: 400 })
    }
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const userName = auth.user!.name || auth.user!.email;

    const cotizacionActual = await prisma.cotizacion.findFirst({
      where: {
        id: cotizacionId,
        tenantId: tenantId,
      },
    })

    if (!cotizacionActual) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    const body = await req.json()
    const { estado, firmadoPorCliente, ipFirma } = body
    const editableFields = [
      'dealId', 'leadId', 'titulo', 'descripcion', 'items', 'descuentoPorcentaje',
      'impuestos', 'moneda', 'validezDias', 'terminosPago', 'notasCliente',
      'notasInternas', 'clienteNombre', 'clienteEmail', 'clienteEmpresa',
      'clienteTelefono', 'emisorId',
    ]
    const editRequested = editableFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))
    const dataToUpdate: any = {}

    if (editRequested) {
      if (cotizacionActual.estado !== 'borrador') {
        return NextResponse.json(
          { error: 'Solo se pueden modificar cotizaciones en estado borrador' },
          { status: 409 },
        )
      }

      const parsedEdit = validateBody(CotizacionInputSchema.partial(), body)
      if (parsedEdit instanceof NextResponse) return parsedEdit
      if (parsedEdit.descuentoPorcentaje !== undefined && !parsedEdit.items) {
        return NextResponse.json(
          { error: 'Para recalcular el descuento se deben enviar las líneas de la cotización' },
          { status: 400 },
        )
      }

      const { items, descuentoPorcentaje, impuestos } = parsedEdit
      if (items) {
        const catalogoItemIds = items.filter((item: any) => item.catalogoItemId).map((item: any) => item.catalogoItemId)
        const catalogoItems = catalogoItemIds.length > 0
          ? await prisma.catalogoItem.findMany({
              where: { id: { in: catalogoItemIds }, tenantId },
              include: { tasaImpuesto: true },
            })
          : []
        const catalogoMap = new Map(catalogoItems.map((item: any) => [item.id, item]))
        const calculated = calculateCotizacionItems(
          items,
          catalogoMap,
          impuestos ?? cotizacionActual.impuestos,
        )
        if ('error' in calculated) {
          return NextResponse.json({ error: calculated.error }, { status: 400 })
        }

        const descuentoGlobal = descuentoPorcentaje ?? cotizacionActual.descuentoPorcentaje
        const descuentoMonto = Math.round(calculated.subtotal * (descuentoGlobal / 100) * 100) / 100
        const baseImponible = Math.round((calculated.subtotal - descuentoMonto) * 100) / 100
        const impuestosProporcionales = Math.round(
          calculated.totalImpuestos * (baseImponible / calculated.subtotal || 1) * 100,
        ) / 100

        dataToUpdate.subtotal = calculated.subtotal
        dataToUpdate.descuentoPorcentaje = descuentoGlobal
        dataToUpdate.descuentoMonto = descuentoMonto
        dataToUpdate.impuestos = impuestosProporcionales
        dataToUpdate.total = Math.round((baseImponible + impuestosProporcionales) * 100) / 100
        dataToUpdate.items = {
          deleteMany: {},
          create: calculated.processedItems,
        }
      }

      for (const field of editableFields) {
        if (field === 'items' || field === 'descuentoPorcentaje' || field === 'impuestos') continue
        if (Object.prototype.hasOwnProperty.call(parsedEdit, field)) {
          dataToUpdate[field] = (parsedEdit as any)[field]
        }
      }
      if (parsedEdit.impuestos !== undefined && !items) dataToUpdate.impuestos = parsedEdit.impuestos
      if (parsedEdit.validezDias !== undefined) {
        dataToUpdate.fechaVencimiento = new Date(Date.now() + parsedEdit.validezDias * 24 * 60 * 60 * 1000)
      }
    }

    if (estado !== undefined) {
      // COMPLIANCE GATE: Verificar antes de enviar cotización
      if (estado === 'enviada') {
        const gateResult = await ComplianceGate.check({
          tenantId: tenantId,
          userId: userId,
          action: 'cotizacion_send',
          entityId: cotizacionId,
          entityType: 'cotizacion',
        });

        if (!gateResult.allowed) {
          return NextResponse.json({
            error: gateResult.reason,
            gate: {
              requiredAction: gateResult.requiredAction,
              missingRequirements: gateResult.missingRequirements,
              blockingRule: gateResult.blockingRule?.name,
              mode: gateResult.mode,
            },
          }, { status: 403 });
        }
      }

      dataToUpdate.estado = estado
      
      if (estado === 'enviada' && !cotizacionActual.fechaEnvio) {
        dataToUpdate.fechaEnvio = new Date()
      }
      
      if (estado === 'aceptada' && !cotizacionActual.fechaAceptacion) {
        dataToUpdate.fechaAceptacion = new Date()
      }
    }

    if (firmadoPorCliente !== undefined) {
      dataToUpdate.firmadoPorCliente = firmadoPorCliente
      if (firmadoPorCliente && !cotizacionActual.fechaFirma) {
        dataToUpdate.fechaFirma = new Date()
        dataToUpdate.ipFirma = ipFirma
      }
    }

    const cotizacion = await prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: dataToUpdate,
      include: {
        items: true,
        deal: true,
        lead: true,
      },
    })

    // Si es aceptada y tiene deal, actualizar el deal
    if (estado === 'aceptada' && cotizacion.dealId) {
      await prisma.deal.update({
        where: { id: cotizacion.dealId },
        data: {
          etapa: 'negociacion',
          probabilidad: 75,
        },
      })

      await prisma.dealActivity.create({
        data: {
          dealId: cotizacion.dealId,
          tenantId: tenantId,
          userId: userId,
          tipo: 'cotizacion_aceptada',
          titulo: 'Cotización aceptada',
          descripcion: `Cotización ${cotizacion.numero} fue aceptada`,
          resultado: 'exitoso',
        },
      })
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: tenantId,
        userId: userId,
        accion: 'actualizar',
        entidad: 'cotizacion',
        entidadId: cotizacion.id,
        descripcion: `Usuario ${userName} actualizó la cotización ${cotizacion.numero}`,
        cambiosAntes: JSON.stringify(cotizacionActual),
        cambiosDespues: JSON.stringify(cotizacion),
      },
    })

    return NextResponse.json({ cotizacion })
  } catch (error: any) {
    console.error('Error al actualizar cotización:', error)
    return NextResponse.json(
      { error: 'Error al actualizar cotización', details: error.message },
      { status: 500 }
    )
  }
}, ['quotes:write', 'cotizaciones:write'])

// DELETE - Eliminar cotización
export const DELETE = withTenantAuth(async (req, auth, params) => {
  try {
    const cotizacionId = getCotizacionId(params)
    if (!cotizacionId) {
      return NextResponse.json({ error: 'ID de cotización requerido' }, { status: 400 })
    }
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const userName = auth.user!.name || auth.user!.email;

    const cotizacion = await prisma.cotizacion.findFirst({
      where: {
        id: cotizacionId,
        tenantId: tenantId,
      },
    })

    if (!cotizacion) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    await prisma.cotizacion.delete({
      where: { id: cotizacionId },
    })

    await prisma.auditLog.create({
      data: {
        tenantId: tenantId,
        userId: userId,
        accion: 'eliminar',
        entidad: 'cotizacion',
        entidadId: cotizacion.id,
        descripcion: `Usuario ${userName} eliminó la cotización ${cotizacion.numero}`,
        cambiosAntes: JSON.stringify(cotizacion),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error al eliminar cotización:', error)
    return NextResponse.json(
      { error: 'Error al eliminar cotización', details: error.message },
      { status: 500 }
    )
  }
}, ['quotes:write', 'cotizaciones:write'])
