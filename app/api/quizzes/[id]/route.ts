import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const quiz = await prisma.quiz.findUnique({
      where: {
        id: params.id,
        tenantId: (session.user as any).tenantId
      },
      include: {
        preguntas: {
          orderBy: {
            orden: 'asc'
          }
        }
      }
    })

    if (!quiz) {
      return NextResponse.json({ error: 'Cuestionario no encontrado' }, { status: 404 })
    }

    return NextResponse.json(quiz)
  } catch (error) {
    console.error('Error fetching quiz:', error)
    return NextResponse.json({ error: 'Error al cargar el cuestionario' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { titulo, descripcion, tipoQuiz, puntuajeMinimo, intentosPermitidos, tiempoLimiteMinutos, preguntas } = body

    // 1. Actualizar datos básicos del Quiz
    const updatedQuiz = await prisma.quiz.update({
      where: {
        id: params.id,
        tenantId: (session.user as any).tenantId
      },
      data: {
        titulo,
        descripcion,
        tipoQuiz,
        puntuajeMinimo,
        intentosPermitidos,
        tiempoLimiteMinutos
      }
    })

    // 2. Si se enviaron preguntas, sincronizarlas
    if (preguntas && Array.isArray(preguntas)) {
      // Usar una transacción para asegurar integridad
      await prisma.$transaction(async (tx) => {
        // Obtener IDs de preguntas actuales
        const currentQuestions = await tx.pregunta.findMany({
          where: { quizId: params.id },
          select: { id: true }
        })
        const currentIds = currentQuestions.map(q => q.id)
        const incomingIds = preguntas.filter(p => p.id).map(p => p.id)

        // Eliminar preguntas que ya no están
        const toDelete = currentIds.filter(id => !incomingIds.includes(id))
        if (toDelete.length > 0) {
          await tx.pregunta.deleteMany({
            where: { id: { in: toDelete } }
          })
        }

        // Crear o Actualizar preguntas
        for (const p of preguntas) {
          if (p.id && currentIds.includes(p.id)) {
            // Actualizar existente
            await tx.pregunta.update({
              where: { id: p.id },
              data: {
                pregunta: p.pregunta,
                tipoPregunta: p.tipoPregunta,
                orden: p.orden,
                puntaje: p.puntaje,
                opciones: p.opciones,
                explicacion: p.explicacion
              }
            })
          } else {
            // Crear nueva (omitir ID si viene con uno nuevo que no existe)
            const { id: _, ...rest } = p
            await tx.pregunta.create({
              data: {
                ...rest,
                quizId: params.id
              }
            })
          }
        }
      })
    }

    return NextResponse.json(updatedQuiz)
  } catch (error) {
    console.error('Error updating quiz:', error)
    return NextResponse.json({ error: 'Error al actualizar el cuestionario' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    await prisma.quiz.delete({
      where: {
        id: params.id,
        tenantId: (session.user as any).tenantId
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting quiz:', error)
    return NextResponse.json({ error: 'Error al eliminar el cuestionario' }, { status: 500 })
  }
}
