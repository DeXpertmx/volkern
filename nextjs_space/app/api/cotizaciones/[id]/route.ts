export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

// GET - Obtener cotización por ID
export const GET = withTenantAuth(async (req, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;

    // El proxy de prisma redirige automáticamente a la base de datos física del tenant
    const cotizacion = await prisma.cotizacion.findFirst({
      where: {
        id: params.id,
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
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const userName = auth.user!.name || auth.user!.email;

    const cotizacionActual = await prisma.cotizacion.findFirst({
      where: {
        id: params.id,
        tenantId: tenantId,
      },
    })

    if (!cotizacionActual) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    const body = await req.json()
    const { estado, firmadoPorCliente, ipFirma } = body

    const dataToUpdate: any = {}

    if (estado !== undefined) {
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
      where: { id: params.id },
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
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const userName = auth.user!.name || auth.user!.email;

    const cotizacion = await prisma.cotizacion.findFirst({
      where: {
        id: params.id,
        tenantId: tenantId,
      },
    })

    if (!cotizacion) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    await prisma.cotizacion.delete({
      where: { id: params.id },
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
