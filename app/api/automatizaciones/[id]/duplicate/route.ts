export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Obtener la automatización original
    const original = await prisma.automation.findUnique({
      where: { id: params.id }
    })

    if (!original) {
      return NextResponse.json(
        { error: 'Automatización no encontrada' },
        { status: 404 }
      )
    }

    // Crear copia
    const duplicate = await prisma.automation.create({
      data: {
        nombre: `${original.nombre} (Copia)`,
        descripcion: original.descripcion,
        trigger: original.trigger,
        flowData: original.flowData as any,
        activo: false, // Las copias empiezan inactivas
      }
    })

    return NextResponse.json(duplicate)
  } catch (error) {
    console.error('Error al duplicar automatización:', error)
    return NextResponse.json(
      { error: 'Error al duplicar automatización' },
      { status: 500 }
    )
  }
}
