export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/certificados/generar - Generar un certificado
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { estudianteId, cursoId } = body;

    // Verify enrollment and completion
    const inscripcion = await prisma.inscripcion.findUnique({
      where: {
        estudianteId_cursoId: {
          estudianteId,
          cursoId,
        },
      },
      include: {
        curso: true,
        estudiante: true,
      },
    });

    if (!inscripcion) {
      return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 });
    }

    // Check if student meets requirements
    if (inscripcion.progresoPorcentaje < 100) {
      return NextResponse.json(
        { error: 'El estudiante no ha completado el curso' },
        { status: 400 }
      );
    }

    if (
      inscripcion.curso.certificadoHabilitado &&
      inscripcion.puntuacionFinal &&
      inscripcion.puntuacionFinal < inscripcion.curso.puntuajeMinimoCertificado
    ) {
      return NextResponse.json(
        { error: 'El estudiante no ha alcanzado la puntuación mínima' },
        { status: 400 }
      );
    }

    // Check if certificate already exists
    const certificadoExistente = await prisma.certificado.findUnique({
      where: {
        estudianteId_cursoId: {
          estudianteId,
          cursoId,
        },
      },
    });

    if (certificadoExistente) {
      return NextResponse.json(certificadoExistente);
    }

    // Generate unique code
    const codigoUnico = `CERT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create certificate (PDF generation will be handled by frontend or separate service)
    const certificado = await prisma.certificado.create({
      data: {
        estudianteId,
        cursoId,
        codigoUnico,
      },
      include: {
        estudiante: true,
        curso: true,
      },
    });

    // Update enrollment
    await prisma.inscripcion.update({
      where: { id: inscripcion.id },
      data: {
        certificadoGenerado: true,
      },
    });

    return NextResponse.json(certificado, { status: 201 });
  } catch (error) {
    console.error('Error al generar certificado:', error);
    return NextResponse.json({ error: 'Error al generar certificado' }, { status: 500 });
  }
}
