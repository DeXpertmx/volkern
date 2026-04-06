export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth'

// POST - Reordenar etapas del pipeline
export async function POST(req: NextRequest) {
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

    const body = await req.json()
    const { stages } = body // Array de { id, orden }

    if (!stages || !Array.isArray(stages)) {
      return NextResponse.json(
        { error: 'Se requiere un array de etapas con su nuevo orden' },
        { status: 400 }
      )
    }

    // Verificar que todas las etapas pertenecen al tenant
    const stageIds = stages.map((s: { id: string }) => s.id)
    const existingStages = await prisma.pipelineStage.findMany({
      where: {
        id: { in: stageIds },
        tenantId: user.tenantId,
      },
    })

    if (existingStages.length !== stageIds.length) {
      return NextResponse.json(
        { error: 'Algunas etapas no existen o no pertenecen a tu cuenta' },
        { status: 400 }
      )
    }

    // Actualizar el orden de cada etapa
    await Promise.all(
      stages.map((stage: { id: string; orden: number }) =>
        prisma.pipelineStage.update({
          where: { id: stage.id },
          data: { orden: stage.orden },
        })
      )
    )

    // Obtener las etapas actualizadas
    const updatedStages = await prisma.pipelineStage.findMany({
      where: {
        tenantId: user.tenantId,
        activo: true,
      },
      orderBy: { orden: 'asc' },
    })

    return NextResponse.json({ stages: updatedStages })
  } catch (error: any) {
    console.error('Error al reordenar etapas:', error)
    return NextResponse.json(
      { error: 'Error al reordenar etapas', details: error.message },
      { status: 500 }
    )
  }
}
