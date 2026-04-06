export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

async function updateServicio(
  request: NextRequest,
  params: { id: string }
) {
  try {
    const body = await request.json()
    const { nombre, descripcion, duracionMinutos, duracion_minutos, precio, moneda, modalidad, activo } = body

    // Aceptar tanto duracionMinutos como duracion_minutos para compatibilidad
    const duracion = duracionMinutos || duracion_minutos

    const servicio = await prisma.servicio.update({
      where: { id: params.id },
      data: {
        ...(nombre && { nombre }),
        ...(descripcion !== undefined && { descripcion }),
        ...(duracion && { duracionMinutos: parseInt(duracion) }),
        ...(precio !== undefined && { precio: parseFloat(precio) }),
        ...(moneda && { moneda }),
        ...(modalidad && { modalidad }),
        ...(activo !== undefined && { activo }),
      }
    })

    return NextResponse.json({
      success: true,
      servicio
    })

  } catch (error) {
    console.error('Error updating servicio:', error)
    return NextResponse.json(
      { error: 'Error al actualizar servicio' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return updateServicio(request, params)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return updateServicio(request, params)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.servicio.delete({
      where: { id: params.id }
    })

    return NextResponse.json({
      success: true,
      message: 'Servicio eliminado correctamente'
    })

  } catch (error) {
    console.error('Error deleting servicio:', error)
    return NextResponse.json(
      { error: 'Error al eliminar servicio' },
      { status: 500 }
    )
  }
}
