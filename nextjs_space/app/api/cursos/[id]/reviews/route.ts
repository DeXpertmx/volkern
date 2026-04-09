export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/cursos/[id]/reviews - Obtener reviews de un curso
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const aprobado = searchParams.get('aprobado');

    const where: any = { cursoId: params.id };
    if (aprobado !== null) {
      where.aprobado = aprobado === 'true';
    }

    const reviews = await prisma.review.findMany({
      where,
      include: {
        estudiante: {
          select: {
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });

    return NextResponse.json(reviews);
  } catch (error) {
    console.error('Error al obtener reviews:', error);
    return NextResponse.json({ error: 'Error al obtener reviews' }, { status: 500 });
  }
}

// POST /api/cursos/[id]/reviews - Crear un review
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
    const { estudianteId, calificacion, titulo, comentario } = body;

    // Verify student is enrolled in course
    const inscripcion = await prisma.inscripcion.findUnique({
      where: {
        estudianteId_cursoId: {
          estudianteId,
          cursoId: params.id,
        },
      },
    });

    if (!inscripcion) {
      return NextResponse.json(
        { error: 'El estudiante no está inscrito en este curso' },
        { status: 403 }
      );
    }

    const review = await prisma.review.create({
      data: {
        cursoId: params.id,
        estudianteId,
        calificacion,
        titulo,
        comentario,
        aprobado: false, // Requires moderation
      },
      include: {
        estudiante: {
          select: {
            nombre: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    console.error('Error al crear review:', error);
    return NextResponse.json({ error: 'Error al crear review' }, { status: 500 });
  }
}
