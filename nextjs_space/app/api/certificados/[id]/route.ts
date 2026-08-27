export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createHash } from 'crypto';
import prisma from '@/lib/db';
import { generateCertificatePdf } from '@/lib/academy/certificate-pdf';

/**
 * GET /api/certificados/[id]
 * Obtiene (y crea si procede) el certificado del curso para el estudiante autenticado
 * y devuelve el PDF real como application/pdf.
 * id = id del curso.
 */
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

    const estudiante = await prisma.estudiante.findFirst({
      where: { email: session.user.email },
    });

    if (!estudiante) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    const curso = await prisma.curso.findUnique({
      where: { id: cursoId },
    });

    if (!curso) {
      return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
    }

    // Verificar que el curso esté completado
    const totalLecciones = await prisma.leccion.count({
      where: { modulo: { cursoId } },
    });

    const leccionesCompletadas = await prisma.progresoLeccion.count({
      where: {
        estudianteId: estudiante.id,
        completado: true,
        leccion: { modulo: { cursoId } },
      },
    });

    if (totalLecciones > 0 && leccionesCompletadas < totalLecciones) {
      return NextResponse.json(
        { error: 'Debes completar todas las lecciones para obtener el certificado' },
        { status: 403 }
      );
    }

    // Buscar o crear el certificado
    let certificado = await prisma.certificado.findFirst({
      where: { estudianteId: estudiante.id, cursoId },
    });

    if (!certificado) {
      const codigoUnico = `VOLK-${curso.id.substring(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const integrityHash = createHash('sha256')
        .update(`${estudiante.id}|${curso.id}|${new Date().toISOString()}|VOLKERN-MASTER-KEY`)
        .digest('hex');

      certificado = await prisma.certificado.create({
        data: {
          estudianteId: estudiante.id,
          cursoId,
          codigoUnico,
          integrityHash,
          fechaEmision: new Date(),
          pdfUrl: `/api/academy/certificate/render/${codigoUnico}`,
        },
      });
    }

    const tenant = estudiante.tenantId
      ? await prisma.tenant.findUnique({ where: { id: estudiante.tenantId } })
      : null;

    const pdfBuffer = await generateCertificatePdf({
      codigoUnico: certificado.codigoUnico,
      integrityHash: certificado.integrityHash,
      fechaEmision: certificado.fechaEmision,
      estudianteNombre: estudiante.nombre,
      cursoTitulo: curso.titulo,
      cursoDescripcion: curso.descripcionLarga || curso.descripcion,
      instructor: curso.instructorNombre,
      tenantNombre: tenant?.nombre || tenant?.razonSocial,
    });

    const safeName = curso.titulo.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="certificado-${safeName}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error al obtener certificado:', error);
    return NextResponse.json(
      { error: 'Error al obtener certificado' },
      { status: 500 }
    );
  }
}