import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const quizzes = await prisma.quiz.findMany({
      where: {
        tenantId: (session.user as any).tenantId
      },
      include: {
        _count: {
          select: { preguntas: true, intentos: true }
        }
      },
      orderBy: {
        fechaCreacion: 'desc'
      }
    })

    return NextResponse.json(quizzes)
  } catch (error) {
    console.error('Error fetching quizzes:', error)
    return NextResponse.json({ error: 'Error al cargar cuestionarios' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { titulo, descripcion, tipoQuiz, puntuajeMinimo, intentosPermitidos, tiempoLimiteMinutos } = body

    if (!titulo) {
      return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 })
    }

    const quiz = await prisma.quiz.create({
      data: {
        titulo,
        descripcion,
        tipoQuiz: tipoQuiz || 'quiz',
        puntuajeMinimo: puntuajeMinimo || 70,
        intentosPermitidos: intentosPermitidos || -1,
        tiempoLimiteMinutos,
        tenantId: (session.user as any).tenantId
      }
    })

    return NextResponse.json(quiz)
  } catch (error) {
    console.error('Error creating quiz:', error)
    return NextResponse.json({ error: 'Error al crear el cuestionario' }, { status: 500 })
  }
}
