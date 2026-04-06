export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/inscripciones - Crear una inscripción
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      estudianteId,
      cursoId,
      tipoAcceso,
      montoPagado,
      cuponUsado,
      stripePaymentId,
      stripeSubscriptionId,
    } = body;

    // Get course to calculate total lessons
    const curso = await prisma.curso.findUnique({
      where: { id: cursoId },
      include: {
        modulos: {
          include: {
            lecciones: true,
          },
        },
      },
    });

    if (!curso) {
      return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
    }

    const totalLecciones = curso.modulos.reduce(
      (sum, modulo) => sum + modulo.lecciones.length,
      0
    );

    const inscripcion = await prisma.inscripcion.create({
      data: {
        estudianteId,
        cursoId,
        tipoAcceso: tipoAcceso || 'compra',
        montoPagado,
        cuponUsado,
        stripePaymentId,
        stripeSubscriptionId,
        totalLecciones,
      },
      include: {
        estudiante: true,
        curso: true,
      },
    });

    return NextResponse.json(inscripcion, { status: 201 });
  } catch (error) {
    console.error('Error al crear inscripción:', error);
    return NextResponse.json({ error: 'Error al crear inscripción' }, { status: 500 });
  }
}
