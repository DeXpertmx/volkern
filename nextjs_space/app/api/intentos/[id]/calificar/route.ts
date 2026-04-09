export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/intentos/[id]/calificar - Calificar un intento de quiz
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
    const { respuestas } = body; // Array of { preguntaId, respuesta }

    const intento = await prisma.intentoQuiz.findUnique({
      where: { id: params.id },
      include: {
        quiz: {
          include: {
            preguntas: true,
          },
        },
      },
    });

    if (!intento) {
      return NextResponse.json({ error: 'Intento no encontrado' }, { status: 404 });
    }

    let puntuacionObtenida = 0;
    let puntuacionMaxima = 0;

    const respuestasCalificadas = await Promise.all(
      respuestas.map(async (r: any) => {
        const pregunta = intento.quiz.preguntas.find((p) => p.id === r.preguntaId);
        if (!pregunta) return null;

        puntuacionMaxima += pregunta.puntaje;

        let esCorrecta = false;
        let puntajeObtenido = 0;

        if (pregunta.tipoPregunta === 'multiple_choice') {
          const opciones = pregunta.opciones as any;
          const opcionCorrecta = opciones.find((o: any) => o.correcta);
          esCorrecta = r.respuesta === opcionCorrecta?.id;
          puntajeObtenido = esCorrecta ? pregunta.puntaje : 0;
        } else if (pregunta.tipoPregunta === 'true_false') {
          const opciones = pregunta.opciones as any;
          const opcionCorrecta = opciones.find((o: any) => o.correcta);
          esCorrecta = r.respuesta === opcionCorrecta?.id;
          puntajeObtenido = esCorrecta ? pregunta.puntaje : 0;
        }

        puntuacionObtenida += puntajeObtenido;

        return prisma.respuestaEstudiante.create({
          data: {
            intentoId: params.id,
            preguntaId: r.preguntaId,
            respuesta: r.respuesta,
            esCorrecta,
            puntajeObtenido,
          },
        });
      })
    );

    const porcentaje = puntuacionMaxima > 0 ? (puntuacionObtenida / puntuacionMaxima) * 100 : 0;
    const aprobado = porcentaje >= intento.quiz.puntuajeMinimo;

    const intentoActualizado = await prisma.intentoQuiz.update({
      where: { id: params.id },
      data: {
        puntuacionObtenida,
        puntuacionMaxima,
        porcentaje,
        aprobado,
        fechaCompletado: new Date(),
      },
      include: {
        respuestas: {
          include: {
            pregunta: true,
          },
        },
      },
    });

    return NextResponse.json(intentoActualizado);
  } catch (error) {
    console.error('Error al calificar intento:', error);
    return NextResponse.json({ error: 'Error al calificar intento' }, { status: 500 });
  }
}
