export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url)
    const activo = searchParams.get('activo')

    const whereClause: any = {
      tenantId: auth.tenant!.id
    }

    if (activo === 'true') {
      whereClause.activo = true
    }

    const servicios = await prisma.servicio.findMany({
      where: whereClause,
      orderBy: {
        fechaCreacion: 'desc'
      }
    })

    return NextResponse.json(servicios)
  } catch (error) {
    console.error('Error fetching servicios:', error)
    return NextResponse.json(
      { error: 'Error al obtener servicios' },
      { status: 500 }
    )
  }
}, ['servicios:read', 'services:read'])

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id

    const body = await request.json()
    const { nombre, descripcion, duracionMinutos, duracion_minutos, precio, moneda, modalidad } = body

    const duracion = duracionMinutos || duracion_minutos

    if (!nombre || !duracion || precio === undefined || !moneda) {
      return NextResponse.json(
        { error: 'Nombre, duración, precio y moneda son requeridos' },
        { status: 400 }
      )
    }

    const servicio = await prisma.servicio.create({
      data: {
        tenantId,
        nombre,
        descripcion: descripcion || null,
        duracionMinutos: parseInt(duracion),
        precio: parseFloat(precio),
        moneda,
        modalidad: modalidad || 'presencial',
        activo: true,
      }
    })

    return NextResponse.json({
      success: true,
      servicio
    })

  } catch (error) {
    console.error('Error creating servicio:', error)
    return NextResponse.json(
      { error: 'Error al crear servicio' },
      { status: 500 }
    )
  }
}, ['servicios:write', 'services:write'])
