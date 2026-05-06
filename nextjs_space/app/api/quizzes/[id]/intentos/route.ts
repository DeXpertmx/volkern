export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)

  // En una versión más avanzada, los estudiantes podrían no tener cuenta de CRM completa
  // pero por ahora usamos la sesión estándar.
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { respuestas, tiempoTomadoMinutos } = body // respuestas: { [preguntaId]: string | string[] }

    // 1. Obtener el quiz con sus preguntas para calificar
    const quiz = await prisma.quiz.findUnique({
      where: { id: params.id },
      include: { preguntas: true }
    })

    if (!quiz) {
      return NextResponse.json({ error: 'Cuestionario no encontrado' }, { status: 404 })
    }

    let puntuacionTotal = 0
    let puntuacionMaxima = 0
    const detallesRespuestas = []

    // 2. Calificar cada pregunta
    for (const pregunta of quiz.preguntas) {
      const respuestaUsuario = respuestas[pregunta.id]
      const opciones = (pregunta.opciones as any[]) || []
      let esCorrecta = false
      let puntajeObtenido = 0

      puntuacionMaxima += pregunta.puntaje

      if (pregunta.tipoPregunta === 'multiple_choice' || pregunta.tipoPregunta === 'true_false') {
        const opcionCorrecta = opciones.find(o => o.isCorrect)
        if (opcionCorrecta && respuestaUsuario === (opcionCorrecta.id || opcionCorrecta.label)) {
          esCorrecta = true
          puntajeObtenido = pregunta.puntaje
        }
      } else if (pregunta.tipoPregunta === 'multiple_selection') {
        const opcionesCorrectas = opciones.filter(o => o.isCorrect).map(o => o.id || o.label)
        const respuestasLimpias = Array.isArray(respuestaUsuario) ? respuestaUsuario : [respuestaUsuario]
        
        // Verificar si todas las marcadas son correctas y no falta ninguna
        const esPerfecta = opcionesCorrectas.length === respuestasLimpias.length && 
                           opcionesCorrectas.every(val => respuestasLimpias.includes(val))
        
        if (esPerfecta) {
          esCorrecta = true
          puntajeObtenido = pregunta.puntaje
        }
      }
      // TODO: Implementar otros tipos como open_text (calificación manual o match exacto)

      puntuacionTotal += puntajeObtenido
      detallesRespuestas.push({
        preguntaId: pregunta.id,
        respuesta: String(respuestaUsuario || ''),
        esCorrecta,
        puntajeObtenido
      })
    }

    const porcentaje = Math.round((puntuacionTotal / puntuacionMaxima) * 100)
    const aprobado = porcentaje >= quiz.puntuajeMinimo

    // 3. Registrar el intento
    // Primero buscar el estudiante vinculado al usuario (o crear uno si es necesario)
    let estudiante = await prisma.estudiante.findUnique({
      where: { 
        tenantId_email: {
          tenantId: (session.user as any).tenantId,
          email: session.user.email!
        }
      }
    })

    if (!estudiante) {
      // Auto-crear perfil de estudiante si no existe
      estudiante = await prisma.estudiante.create({
        data: {
          nombre: session.user.name || session.user.email!.split('@')[0],
          email: session.user.email!,
          tenantId: (session.user as any).tenantId
        }
      })
    }

    const intento = await prisma.intentoQuiz.create({
      data: {
        quizId: params.id,
        estudianteId: estudiante.id,
        puntuacionObtenida: puntuacionTotal,
        puntuacionMaxima: puntuacionMaxima,
        porcentaje: porcentaje,
        aprobado: aprobado,
        tiempoTomadoMinutos: tiempoTomadoMinutos || 0,
        fechaCompletado: new Date(),
        respuestas: {
          create: detallesRespuestas
        }
      },
      include: {
        respuestas: true
      }
    })

    return NextResponse.json({
      intentoId: intento.id,
      puntuacion: puntuacionTotal,
      maxima: puntuacionMaxima,
      porcentaje,
      aprobado
    })

  } catch (error) {
    console.error('Error procesando intento de quiz:', error)
    return NextResponse.json({ error: 'Error al procesar el cuestionario' }, { status: 500 })
  }
}
