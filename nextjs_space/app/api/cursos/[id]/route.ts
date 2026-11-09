export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSessionTenantId, tenantWhere } from '@/lib/academy/tenant-guard';

// GET /api/cursos/[id] - Obtener un curso específico
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const curso = await prisma.curso.findFirst({
      where: { id: params.id, ...tenantWhere(await getSessionTenantId(session.user.email)) },
      include: {
        modulos: {
          include: {
            lecciones: {
              include: {
                quiz: {
                  include: {
                    preguntas: {
                      orderBy: { orden: 'asc' },
                    },
                  },
                },
                tarea: true,
              },
              orderBy: {
                orden: 'asc',
              },
            },
          },
          orderBy: {
            orden: 'asc',
          },
        },
        inscripciones: {
          include: {
            estudiante: true,
          },
        },
        cupones: true,
        reviews: {
          where: { aprobado: true },
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
        },
        _count: {
          select: {
            inscripciones: true,
            reviews: true,
          },
        },
      },
    });

    if (!curso) {
      return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
    }

    // Calculate average rating
    const totalReviews = curso.reviews.length;
    const avgRating = totalReviews > 0
      ? curso.reviews.reduce((sum, r) => sum + r.calificacion, 0) / totalReviews
      : 0;

    return NextResponse.json({
      ...curso,
      promedioCalificacion: Number(avgRating.toFixed(1)),
      totalReviews,
    });
  } catch (error) {
    console.error('Error al obtener curso:', error);
    return NextResponse.json({ error: 'Error al obtener curso' }, { status: 500 });
  }
}

/**
 * Limpia los datos del cuerpo de la petición para que Prisma no falle
 * al encontrar campos relacionales o virtuales que no son escalares.
 */
function sanitizeCursoData(data: any) {
  const {
    id,
    fechaCreacion,
    fechaActualizacion,
    tenantId,
    modulos,
    inscripciones,
    reviews,
    cupones,
    comentarios,
    bundlesIncluidos,
    _count,
    promedioCalificacion,
    totalReviews,
    catalogoItem,
    ...cleanData
  } = data;
  
  return cleanData;
}

// PATCH /api/cursos/[id] - Actualizar un curso (parcial)
export async function PATCH(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const existente = await prisma.curso.findFirst({
      where: { id: params.id, ...tenantWhere(await getSessionTenantId(session.user.email)) },
      select: { id: true },
    });
    if (!existente) {
      return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const cleanData = sanitizeCursoData(body);
    
    // Remove undefined values to allow partial updates
    const updateData = Object.fromEntries(
      Object.entries(cleanData).filter(([_, value]) => value !== undefined)
    );

    const curso = await prisma.curso.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(curso);
  } catch (error: any) {
    console.error('Error al actualizar curso (PATCH):', error);
    return NextResponse.json({ 
      error: 'Error al actualizar curso', 
      details: error.message 
    }, { status: 500 });
  }
}

// PUT /api/cursos/[id] - Actualizar un curso (completo)
export async function PUT(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const existente = await prisma.curso.findFirst({
      where: { id: params.id, ...tenantWhere(await getSessionTenantId(session.user.email)) },
      select: { id: true },
    });
    if (!existente) {
      return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const cleanData = sanitizeCursoData(body);

    const curso = await prisma.curso.update({
      where: { id: params.id },
      data: cleanData,
    });

    return NextResponse.json(curso);
  } catch (error: any) {
    console.error('Error al actualizar curso (PUT):', error);
    return NextResponse.json({ 
      error: 'Error al actualizar curso', 
      details: error.message 
    }, { status: 500 });
  }
}

// DELETE /api/cursos/[id] - Eliminar un curso
export async function DELETE(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const existente = await prisma.curso.findFirst({
      where: { id: params.id, ...tenantWhere(await getSessionTenantId(session.user.email)) },
      select: { id: true },
    });
    if (!existente) {
      return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
    }

    await prisma.curso.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: 'Curso eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar curso:', error);
    return NextResponse.json({ error: 'Error al eliminar curso' }, { status: 500 });
  }
}
