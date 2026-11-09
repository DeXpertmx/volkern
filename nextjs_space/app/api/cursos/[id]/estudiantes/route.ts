export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/cursos/[id]/estudiantes - Obtener estudiantes inscritos en un curso
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

    const inscripciones = await prisma.inscripcion.findMany({
      where: { cursoId: params.id },
      include: {
        estudiante: true,
      },
      orderBy: {
        fechaInscripcion: 'desc',
      },
    });

    // Calculate progress for each student
    const estudiantesConProgreso = await Promise.all(
      inscripciones.map(async (inscripcion) => {
        const certificado = await prisma.certificado.findUnique({
          where: {
            estudianteId_cursoId: {
              estudianteId: inscripcion.estudianteId,
              cursoId: params.id,
            },
          },
        });

        return {
          id: inscripcion.id,
          estudiante: inscripcion.estudiante,
          fechaInscripcion: inscripcion.fechaInscripcion,
          fechaCompletado: inscripcion.fechaCompletado,
          progresoPorcentaje: inscripcion.progresoPorcentaje,
          leccionesCompletadas: inscripcion.leccionesCompletadas,
          totalLecciones: inscripcion.totalLecciones,
          estado: inscripcion.estado,
          certificadoGenerado: inscripcion.certificadoGenerado,
          certificado: certificado || null,
          fechaUltimoAcceso: inscripcion.fechaUltimoAcceso,
          puntuacionFinal: inscripcion.puntuacionFinal,
        };
      })
    );

    return NextResponse.json(estudiantesConProgreso);
  } catch (error) {
    console.error('Error al obtener estudiantes:', error);
    return NextResponse.json({ error: 'Error al obtener estudiantes' }, { status: 500 });
  }
}

// POST /api/cursos/[id]/estudiantes/export - Exportar estudiantes a CSV
export async function POST(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const inscripciones = await prisma.inscripcion.findMany({
      where: { cursoId: params.id },
      include: {
        estudiante: true,
      },
      orderBy: {
        fechaInscripcion: 'desc',
      },
    });

    // Generate CSV
    const headers = [
      'Nombre',
      'Email',
      'Teléfono',
      'Fecha Inscripción',
      'Progreso %',
      'Lecciones Completadas',
      'Total Lecciones',
      'Estado',
      'Fecha Completado',
      'Certificado',
      'Último Acceso',
    ];

    const rows = inscripciones.map((i) => [
      i.estudiante.nombre,
      i.estudiante.email,
      i.estudiante.telefono || '',
      new Date(i.fechaInscripcion).toLocaleDateString('es-MX'),
      i.progresoPorcentaje.toFixed(1),
      i.leccionesCompletadas,
      i.totalLecciones,
      i.estado,
      i.fechaCompletado
        ? new Date(i.fechaCompletado).toLocaleDateString('es-MX')
        : '',
      i.certificadoGenerado ? 'Sí' : 'No',
      i.fechaUltimoAcceso
        ? new Date(i.fechaUltimoAcceso).toLocaleDateString('es-MX')
        : '',
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="estudiantes-curso-${params.id}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error al exportar estudiantes:', error);
    return NextResponse.json({ error: 'Error al exportar estudiantes' }, { status: 500 });
  }
}
