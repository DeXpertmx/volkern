import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { AcademyAuthService } from '@/lib/auth/academy-auth';
import { QuizService } from '@/lib/academy/quiz-service';
import { CertificationService } from '@/lib/academy/certification-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('academy_token')?.value;
    if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const session = await AcademyAuthService.validateToken(token);
    if (!session) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });

    const body = await request.json();
    const { quizId, answers } = body;

    if (!quizId || !answers) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const result = await QuizService.submitQuiz({
      userId: session.userId,
      estudianteId: session.estudianteId,
      quizId,
      answers
    });

    // If passed, check if we should issue a certificate
    let certificate = null;
    if (result.passed) {
      // Find course related to this quiz
      const leccion = await prisma.leccion.findFirst({
        where: { quizId },
        include: { modulo: true }
      });

      if (leccion) {
        certificate = await CertificationService.issueCertificate(
          session.estudianteId,
          leccion.modulo.cursoId
        );
      }
    }

    return NextResponse.json({
      success: true,
      result,
      certificateIssued: !!certificate,
      certificateId: certificate?.id
    });
  } catch (error: any) {
    console.error('Quiz submission error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
