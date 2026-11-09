export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { generateCertificatePdf } from '@/lib/academy/certificate-pdf';

/**
 * GET /api/academy/certificate/render/[codigo]
 * Devuelve el PDF del certificado buscado por su código único de verificación.
 * Ruta pública (sin auth): se usa para la página de verificación y para descargas
 * directas del cliente a partir del `pdfUrl` guardado en el certificado.
 */
export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ codigo: string }> }
) {
  const params = await paramsPromise;
  try {
    const codigoUnico = params.codigo;

    const certificado = await prisma.certificado.findUnique({
      where: { codigoUnico },
      include: {
        estudiante: {
          include: { tenant: { select: { nombre: true, razonSocial: true } } },
        },
        curso: true,
      },
    });

    if (!certificado) {
      return NextResponse.json(
        { error: 'Certificado no encontrado' },
        { status: 404 }
      );
    }

    const pdfBuffer = await generateCertificatePdf({
      codigoUnico: certificado.codigoUnico,
      integrityHash: certificado.integrityHash,
      fechaEmision: certificado.fechaEmision,
      estudianteNombre: certificado.estudiante.nombre,
      cursoTitulo: certificado.curso.titulo,
      cursoDescripcion: certificado.curso.descripcionLarga || certificado.curso.descripcion,
      instructor: certificado.curso.instructorNombre,
      tenantNombre:
        certificado.estudiante.tenant?.nombre ||
        certificado.estudiante.tenant?.razonSocial,
    });

    const safeName = certificado.curso.titulo.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="certificado-${safeName}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error al renderizar certificado:', error);
    return NextResponse.json(
      { error: 'Error al renderizar certificado' },
      { status: 500 }
    );
  }
}