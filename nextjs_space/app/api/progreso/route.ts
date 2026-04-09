export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/progreso - Actualizar progreso de una lección
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { estudianteId, leccionId, completado, tiempoVisto } = body;

    // Verificar si ya existe progreso para esta lección
    const progresoExistente = await prisma.progresoLeccion.findUnique({
      where: {
        estudianteId_leccionId: {
          estudianteId,
          leccionId,
        },
      },
    });

    let progreso;

    if (progresoExistente) {
      // Actualizar progreso existente
      progreso = await prisma.progresoLeccion.update({
        where: {
          estudianteId_leccionId: {
            estudianteId,
            leccionId,
          },
        },
        data: {
          completado,
          tiempoVisto,
          fechaCompletado: completado ? new Date() : null,
        },
      });
    } else {
      // Crear nuevo progreso
      progreso = await prisma.progresoLeccion.create({
        data: {
          estudianteId,
          leccionId,
          completado,
          tiempoVisto: tiempoVisto || 0,
          fechaCompletado: completado ? new Date() : null,
        },
      });
    }

    // Calcular progreso del curso
    const leccion = await prisma.leccion.findUnique({
      where: { id: leccionId },
      include: {
        modulo: {
          include: {
            curso: {
              include: {
                modulos: {
                  include: {
                    lecciones: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (leccion) {
      const curso = leccion.modulo.curso;
      const totalLecciones = curso.modulos.reduce(
        (acc: number, mod: any) => acc + mod.lecciones.length,
        0
      );

      const leccionesCompletadas = await prisma.progresoLeccion.count({
        where: {
          estudianteId,
          completado: true,
          leccion: {
            modulo: {
              cursoId: curso.id,
            },
          },
        },
      });

      const progresoPorcentaje = totalLecciones > 0
        ? (leccionesCompletadas / totalLecciones) * 100
        : 0;

      // Actualizar progreso en inscripción
      await prisma.inscripcion.updateMany({
        where: {
          estudianteId,
          cursoId: curso.id,
        },
        data: {
          progresoPorcentaje,
          fechaUltimoAcceso: new Date(),
        },
      });

      // Si el progreso es 100%, generar certificado
      if (progresoPorcentaje >= 100) {
        const certificadoExistente = await prisma.certificado.findUnique({
          where: {
            estudianteId_cursoId: {
              estudianteId,
              cursoId: curso.id,
            },
          },
        });

        if (!certificadoExistente) {
          const codigoUnico = `CERT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          
          await prisma.certificado.create({
            data: {
              estudianteId,
              cursoId: curso.id,
              codigoUnico,
            },
          });
        }
      }
    }

    return NextResponse.json(progreso);
  } catch (error) {
    console.error('Error al actualizar progreso:', error);
    return NextResponse.json({ error: 'Error al actualizar progreso' }, { status: 500 });
  }
}

// GET /api/progreso - Obtener progreso de un estudiante
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const estudianteId = searchParams.get('estudianteId');
    const cursoId = searchParams.get('cursoId');

    if (!estudianteId) {
      return NextResponse.json({ error: 'Se requiere estudianteId' }, { status: 400 });
    }

    const progreso = await prisma.progresoLeccion.findMany({
      where: {
        estudianteId,
        ...(cursoId && {
          leccion: {
            modulo: {
              cursoId,
            },
          },
        }),
      },
      include: {
        leccion: {
          include: {
            modulo: {
              include: {
                curso: true,
              },
            },
          },
        },
      },
      orderBy: {
        fechaInicio: 'desc',
      },
    });

    return NextResponse.json(progreso);
  } catch (error) {
    console.error('Error al obtener progreso:', error);
    return NextResponse.json({ error: 'Error al obtener progreso' }, { status: 500 });
  }
}
