export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/cursos/[id]/quizzes - Crear un quiz para un curso
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      titulo,
      descripcion,
      tipoQuiz,
      puntuajeMinimo,
      intentosPermitidos,
      tiempoLimiteMinutos,
      mostrarRespuestas,
      barajarPreguntas,
      preguntas,
    } = body;

    const quiz = await prisma.quiz.create({
      data: {
        titulo,
        descripcion,
        tipoQuiz: tipoQuiz || 'quiz',
        puntuajeMinimo: puntuajeMinimo || 70,
        intentosPermitidos: intentosPermitidos || -1,
        tiempoLimiteMinutos,
        mostrarRespuestas: mostrarRespuestas !== undefined ? mostrarRespuestas : true,
        barajarPreguntas: barajarPreguntas || false,
        preguntas: {
          create: preguntas?.map((p: any, index: number) => ({
            pregunta: p.pregunta,
            tipoPregunta: p.tipoPregunta || 'multiple_choice',
            orden: p.orden || index + 1,
            puntaje: p.puntaje || 1,
            opciones: p.opciones,
            explicacion: p.explicacion,
          })) || [],
        },
      },
      include: {
        preguntas: {
          orderBy: { orden: 'asc' },
        },
      },
    });

    return NextResponse.json(quiz, { status: 201 });
  } catch (error) {
    console.error('Error al crear quiz:', error);
    return NextResponse.json({ error: 'Error al crear quiz' }, { status: 500 });
  }
}
