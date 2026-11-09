export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/certificados/verificar/[codigo] - Verificar un certificado por código
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ codigo: string }> }
) {
  const params = await paramsPromise;
  try {
    const certificado = await prisma.certificado.findUnique({
      where: { codigoUnico: params.codigo },
      include: {
        estudiante: {
          select: {
            nombre: true,
            email: true,
          },
        },
        curso: {
          select: {
            titulo: true,
            instructorNombre: true,
            duracionEstimadaHoras: true,
          },
        },
      },
    });

    if (!certificado) {
      return NextResponse.json({ error: 'Certificado no encontrado' }, { status: 404 });
    }

    return NextResponse.json(certificado);
  } catch (error) {
    console.error('Error al verificar certificado:', error);
    return NextResponse.json({ error: 'Error al verificar certificado' }, { status: 500 });
  }
}
