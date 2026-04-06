export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma, getTenantDb } from '@/lib/db'
import { headers } from 'next/headers'
import { withPublicTenant } from '@/lib/api-key-auth'

/**
 * Endpoint público para aceptar cotizaciones.
 * Requiere tenantId en el cuerpo o query params para establecer el contexto de BD física.
 */
export const POST = withPublicTenant(async (req, tenantId, params) => {
  try {
    // El contexto de la base de datos ya está establecido.
    // El proxy de prisma consultará automáticamente la base de datos física del tenant.
    const cotizacion = await prisma.cotizacion.findUnique({
      where: { id: params.id },
      include: {
        deal: true,
      },
    })

    if (!cotizacion) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    if (['aceptada', 'rechazada'].includes(cotizacion.estado)) {
      return NextResponse.json({
        error: `Esta cotización ya fue ${cotizacion.estado}`
      }, { status: 400 })
    }

    if (cotizacion.fechaVencimiento && new Date(cotizacion.fechaVencimiento) < new Date()) {
      return NextResponse.json({ error: 'Esta cotización ha expirado' }, { status: 400 })
    }

    const headersList = headers()
    const forwardedFor = headersList.get('x-forwarded-for')
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown'

    // Actualizar en la DB del Tenant
    const updated = await prisma.cotizacion.update({
      where: { id: cotizacion.id },
      data: {
        estado: 'aceptada',
        fechaAceptacion: new Date(),
        firmadoPorCliente: true,
        fechaFirma: new Date(),
        ipFirma: ip,
      },
    })

    if (cotizacion.dealId) {
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
          userId: 'system',
          tipo: 'cotizacion_aceptada',
          titulo: 'Cotización aceptada por cliente',
          descripcion: `El cliente aceptó la cotización ${cotizacion.numero} desde el enlace público`,
          resultado: 'exitoso',
        },
      })
    }

    await prisma.auditLog.create({
      data: {
        tenantId: tenantId,
        userId: 'cliente',
        accion: 'aceptar',
        entidad: 'cotizacion',
        entidadId: cotizacion.id,
        descripcion: `Cliente aceptó la cotización ${cotizacion.numero} desde IP: ${ip}`,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Cotización aceptada exitosamente'
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (error: any) {
    console.error('Error al aceptar cotización:', error)
    return NextResponse.json(
      { error: 'Error al aceptar cotización' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    )
  }
})

// Manejar OPTIONS para CORS (Public API)
export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
