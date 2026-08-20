import { prisma } from '@/lib/db';
import { AcademyAuthService } from '../auth/academy-auth';

/**
 * QuizService
 * Handles the logic for evaluations and grading.
 */
export class QuizService {
  /**
   * Submits a quiz and calculates the results.
   */
  static async submitQuiz(data: {
    userId: string;
    estudianteId: string;
    quizId: string;
    answers: Record<string, any>; // { preguntaId: respuesta }
  }) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: data.quizId },
      include: { preguntas: true }
    });

    if (!quiz) throw new Error('Quiz no encontrado');

    let correctCount = 0;
    const totalQuestions = quiz.preguntas.length;
    const details: any[] = [];

    // Validate each answer
    for (const pregunta of quiz.preguntas) {
      const userAnswer = data.answers[pregunta.id];
      const opciones: any = pregunta.opciones; // Prisma Json
      
      // Find the correct option
      const correctOption = opciones?.find((o: any) => o.esCorrecta);
      const isCorrect = userAnswer === correctOption?.id;

      if (isCorrect) correctCount++;

      details.push({
        preguntaId: pregunta.id,
        isCorrect,
        userAnswer,
        correctAnswer: correctOption?.id
      });
    }

    const percentage = (correctCount / totalQuestions) * 100;
    const passed = percentage >= quiz.puntuajeMinimo;

    // Record the attempt
    const attempt = await prisma.intentoQuiz.create({
      data: {
        estudianteId: data.estudianteId,
        quizId: data.quizId,
        puntuacionObtenida: correctCount,
        puntuacionMaxima: totalQuestions,
        porcentaje: percentage,
        aprobado: passed,
        fechaInicio: new Date(),
        fechaCompletado: new Date()
      }
    });

    // If passed, check if we should trigger course completion
    if (passed) {
      await this.checkCourseCompletion(data.estudianteId, data.quizId);
    }

    return {
      attemptId: attempt.id,
      score: percentage,
      passed,
      correctCount,
      totalQuestions,
      details
    };
  }

  /**
   * Checks if completing this quiz completes the course.
   */
  private static async checkCourseCompletion(estudianteId: string, quizId: string) {
    const leccion = await prisma.leccion.findFirst({
      where: { quizId: quizId },
      include: { modulo: { include: { curso: true } } }
    });

    if (!leccion) return;

    const cursoId = leccion.modulo.cursoId;

    // Logic to check if all mandatory lessons/quizzes are done
    // For now, we'll mark the enrollment as completed if it's the final quiz
    const enrollment = await prisma.inscripcion.findUnique({
      where: { estudianteId_cursoId: { estudianteId, cursoId } }
    });

    if (enrollment) {
      // In a real scenario, we'd verify all lessons.
      // For this MVP, we update the progress.
      await prisma.inscripcion.update({
        where: { id: enrollment.id },
        data: { 
          estado: 'completado',
          fechaCompletado: new Date(),
          progresoPorcentaje: 100
        }
      });

      // Issue Certificate automatically
      const { CertificationService } = await import('./certification-service');
      await CertificationService.issueCertificate(estudianteId, cursoId);

      // Disparar automatizaciones del módulo Academia (curso completado vía quiz final)
      try {
        const { emitLeccionCompletada, emitCursoCompletado } = await import('./automation-events');
        const curso = leccion.modulo.curso;
        const estudiante = await prisma.estudiante.findUnique({ where: { id: estudianteId } });

        await emitLeccionCompletada({
          tenantId: curso?.tenantId,
          estudianteId,
          cursoId,
          leccionId: leccion.id,
          inscripcionId: enrollment.id,
          estudiante: estudiante as any,
          curso: curso as any,
          leccion: leccion as any,
        });

        await emitCursoCompletado({
          tenantId: curso?.tenantId,
          estudianteId,
          cursoId,
          inscripcionId: enrollment.id,
          estudiante: estudiante as any,
          curso: curso as any,
          inscripcion: enrollment as any,
        });
      } catch (e) {
        console.error('Error emitiendo triggers de Academia:', e);
      }
    }
  }
}
