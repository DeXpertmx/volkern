export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: { leccionId: string } }
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { completada } = await request.json();
    const leccionId = params.leccionId;

    // Obtener el estudiante
    const estudiante = await prisma.estudiante.findFirst({
      where: { email: session.user.email },
    });

    if (!estudiante) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    // Actualizar o crear progreso
    const progreso = await prisma.progresoLeccion.upsert({
      where: {
        estudianteId_leccionId: {
          estudianteId: estudiante.id,
          leccionId: leccionId,
        },
      },
      update: {
        completado: completada,
        fechaCompletado: completada ? new Date() : null,
      },
      create: {
        estudianteId: estudiante.id,
        leccionId: leccionId,
        completado: completada,
        fechaCompletado: completada ? new Date() : null,
      },
    });

    // Obtener la lección y su curso
    const leccion = await prisma.leccion.findUnique({
      where: { id: leccionId },
      include: {
        modulo: {
          select: { cursoId: true },
        },
      },
    });

    if (leccion && completada) {
      // Verificar si el curso está completo
      const totalLecciones = await prisma.leccion.count({
        where: {
          modulo: {
            cursoId: leccion.modulo.cursoId,
          },
        },
      });

      const leccionesCompletadas = await prisma.progresoLeccion.count({
        where: {
          estudianteId: estudiante.id,
          completado: true,
          leccion: {
            modulo: {
              cursoId: leccion.modulo.cursoId,
            },
          },
        },
      });

      // Si completó todas las lecciones, generar certificado
      let cursoRecienCompletado = false;
      if (leccionesCompletadas === totalLecciones) {
        const certificadoExistente = await prisma.certificado.findFirst({
          where: {
            estudianteId: estudiante.id,
            cursoId: leccion.modulo.cursoId,
          },
        });

        if (!certificadoExistente) {
          await prisma.certificado.create({
            data: {
              estudianteId: estudiante.id,
              cursoId: leccion.modulo.cursoId,
              codigoUnico: `CERT-${Date.now()}-${estudiante.id.substring(0, 8)}`,
              fechaEmision: new Date(),
              pdfUrl: null,
            },
          });
          cursoRecienCompletado = true;
        }
      }

      // Disparar automatizaciones del módulo Academia
      try {
        const { emitLeccionCompletada, emitCursoCompletado } = await import('@/lib/academy/automation-events');
        const curso = await prisma.curso.findUnique({ where: { id: leccion.modulo.cursoId } });
        const inscripcion = await prisma.inscripcion.findFirst({
          where: { estudianteId: estudiante.id, cursoId: leccion.modulo.cursoId },
        });

        await emitLeccionCompletada({
          tenantId: curso?.tenantId,
          estudianteId: estudiante.id,
          cursoId: leccion.modulo.cursoId,
          leccionId,
          inscripcionId: inscripcion?.id,
          estudiante: estudiante as any,
          curso: curso as any,
          leccion: leccion as any,
        });

        if (cursoRecienCompletado) {
          await emitCursoCompletado({
            tenantId: curso?.tenantId,
            estudianteId: estudiante.id,
            cursoId: leccion.modulo.cursoId,
            inscripcionId: inscripcion?.id,
            estudiante: estudiante as any,
            curso: curso as any,
            inscripcion: inscripcion as any,
          });
        }
      } catch (e) {
        console.error('Error emitiendo triggers de Academia:', e);
      }
    }

    return NextResponse.json({ success: true, progreso });
  } catch (error) {
    console.error('Error al actualizar progreso:', error);
    return NextResponse.json(
      { error: 'Error al actualizar progreso' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: { leccionId: string } }
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const leccionId = params.leccionId;

    // Obtener el estudiante
    const estudiante = await prisma.estudiante.findFirst({
      where: { email: session.user.email },
    });

    if (!estudiante) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    // Obtener progreso
    const progreso = await prisma.progresoLeccion.findUnique({
      where: {
        estudianteId_leccionId: {
          estudianteId: estudiante.id,
          leccionId: leccionId,
        },
      },
    });

    return NextResponse.json(progreso || { completado: false });
  } catch (error) {
    console.error('Error al obtener progreso:', error);
    return NextResponse.json(
      { error: 'Error al obtener progreso' },
      { status: 500 }
    );
  }
}
