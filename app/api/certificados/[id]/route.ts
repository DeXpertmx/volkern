export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const cursoId = params.id;

    // Obtener el estudiante
    const estudiante = await prisma.estudiante.findFirst({
      where: { email: session.user.email },
    });

    if (!estudiante) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    // Obtener el curso
    const curso = await prisma.curso.findUnique({
      where: { id: cursoId },
    });

    if (!curso) {
      return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
    }

    // Verificar que el curso esté completado
    const totalLecciones = await prisma.leccion.count({
      where: {
        modulo: {
          cursoId,
        },
      },
    });

    const leccionesCompletadas = await prisma.progresoLeccion.count({
      where: {
        estudianteId: estudiante.id,
        completado: true,
        leccion: {
          modulo: {
            cursoId,
          },
        },
      },
    });

    if (leccionesCompletadas < totalLecciones) {
      return NextResponse.json(
        { error: 'Debes completar todas las lecciones para obtener el certificado' },
        { status: 403 }
      );
    }

    // Buscar o crear certificado
    let certificado = await prisma.certificado.findFirst({
      where: {
        estudianteId: estudiante.id,
        cursoId: cursoId,
      },
    });

    if (!certificado) {
      certificado = await prisma.certificado.create({
        data: {
          estudianteId: estudiante.id,
          cursoId: cursoId,
          codigoUnico: `CERT-${Date.now()}-${estudiante.id.substring(0, 8)}`,
          fechaEmision: new Date(),
          pdfUrl: null,
        },
      });
    }

    // Generar datos del certificado
    const certificadoData = {
      id: certificado.id,
      codigoUnico: certificado.codigoUnico,
      estudianteNombre: estudiante.nombre,
      cursoTitulo: curso.titulo,
      fechaEmision: certificado.fechaEmision,
      fechaCompletado: new Date(),
      instructor: curso.instructorNombre || 'Volkern Academy',
    };

    // Por ahora, retornar los datos del certificado
    return NextResponse.json(certificadoData);
  } catch (error) {
    console.error('Error al obtener certificado:', error);
    return NextResponse.json(
      { error: 'Error al obtener certificado' },
      { status: 500 }
    );
  }
}
