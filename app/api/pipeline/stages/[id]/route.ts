export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth'

// GET - Obtener una etapa específica
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
    }

    const stage = await prisma.pipelineStage.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    })

    if (!stage) {
      return NextResponse.json({ error: 'Etapa no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ stage })
  } catch (error: any) {
    console.error('Error al obtener etapa:', error)
    return NextResponse.json(
      { error: 'Error al obtener etapa', details: error.message },
      { status: 500 }
    )
  }
}

// PATCH - Actualizar una etapa
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
    }

    const existingStage = await prisma.pipelineStage.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    })

    if (!existingStage) {
      return NextResponse.json({ error: 'Etapa no encontrada' }, { status: 404 })
    }

    const body = await req.json()
    const { nombre, descripcion, probabilidad, color, requiereAprobacion, activo } = body

    // Verificar que no existe otra etapa con el mismo nombre
    if (nombre && nombre !== existingStage.nombre) {
      const duplicateName = await prisma.pipelineStage.findFirst({
        where: {
          tenantId: user.tenantId,
          nombre,
          id: { not: params.id },
        },
      })

      if (duplicateName) {
        return NextResponse.json(
          { error: 'Ya existe una etapa con ese nombre' },
          { status: 400 }
        )
      }
    }

    const stage = await prisma.pipelineStage.update({
      where: { id: params.id },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(descripcion !== undefined && { descripcion }),
        ...(probabilidad !== undefined && { probabilidad: parseInt(probabilidad) }),
        ...(color !== undefined && { color }),
        ...(requiereAprobacion !== undefined && { requiereAprobacion }),
        ...(activo !== undefined && { activo }),
      },
    })

    // Si cambia el nombre, actualizar los deals que están en esa etapa
    if (nombre && nombre !== existingStage.nombre) {
      await prisma.deal.updateMany({
        where: {
          tenantId: user.tenantId,
          etapa: existingStage.nombre,
        },
        data: {
          etapa: nombre,
        },
      })
    }

    return NextResponse.json({ stage })
  } catch (error: any) {
    console.error('Error al actualizar etapa:', error)
    return NextResponse.json(
      { error: 'Error al actualizar etapa', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar una etapa
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
    }

    const stage = await prisma.pipelineStage.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    })

    if (!stage) {
      return NextResponse.json({ error: 'Etapa no encontrada' }, { status: 404 })
    }

    // Verificar si es una etapa final (no se puede eliminar)
    if (stage.esEtapaFinal) {
      return NextResponse.json(
        { error: 'No se puede eliminar una etapa final (Ganado/Perdido)' },
        { status: 400 }
      )
    }

    // Verificar si hay deals en esta etapa
    const dealsCount = await prisma.deal.count({
      where: {
        tenantId: user.tenantId,
        etapa: stage.nombre,
      },
    })

    if (dealsCount > 0) {
      return NextResponse.json(
        { 
          error: `No se puede eliminar la etapa porque tiene ${dealsCount} deal(s) activos. Mueve los deals a otra etapa primero.`,
          dealsCount 
        },
        { status: 400 }
      )
    }

    // Eliminar la etapa (soft delete - marcar como inactivo)
    await prisma.pipelineStage.update({
      where: { id: params.id },
      data: { activo: false },
    })

    // Reordenar las etapas restantes
    const remainingStages = await prisma.pipelineStage.findMany({
      where: {
        tenantId: user.tenantId,
        activo: true,
      },
      orderBy: { orden: 'asc' },
    })

    await Promise.all(
      remainingStages.map((s, index) =>
        prisma.pipelineStage.update({
          where: { id: s.id },
          data: { orden: index + 1 },
        })
      )
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error al eliminar etapa:', error)
    return NextResponse.json(
      { error: 'Error al eliminar etapa', details: error.message },
      { status: 500 }
    )
  }
}
