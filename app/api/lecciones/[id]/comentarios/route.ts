export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/lecciones/[id]/comentarios - Obtener comentarios de una lección
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const comentarios = await prisma.comentario.findMany({
      where: {
        leccionId: params.id,
        aprobado: true,
        comentarioPadreId: null, // Only root comments
      },
      include: {
        estudiante: {
          select: {
            nombre: true,
            email: true,
          },
        },
        respuestas: {
          include: {
            estudiante: {
              select: {
                nombre: true,
                email: true,
              },
            },
          },
          orderBy: {
            fechaCreacion: 'asc',
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });

    return NextResponse.json(comentarios);
  } catch (error) {
    console.error('Error al obtener comentarios:', error);
    return NextResponse.json({ error: 'Error al obtener comentarios' }, { status: 500 });
  }
}

// POST /api/lecciones/[id]/comentarios - Crear un comentario
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
    const { estudianteId, comentario, comentarioPadreId } = body;

    const nuevoComentario = await prisma.comentario.create({
      data: {
        leccionId: params.id,
        estudianteId,
        comentario,
        comentarioPadreId,
        aprobado: true, // Auto-approve for now
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

    return NextResponse.json(nuevoComentario, { status: 201 });
  } catch (error) {
    console.error('Error al crear comentario:', error);
    return NextResponse.json({ error: 'Error al crear comentario' }, { status: 500 });
  }
}
