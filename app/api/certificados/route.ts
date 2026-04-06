export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/certificados - Obtener certificados
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const estudianteId = searchParams.get('estudianteId');
    const codigoUnico = searchParams.get('codigoUnico');

    const certificados = await prisma.certificado.findMany({
      where: {
        ...(estudianteId && { estudianteId }),
        ...(codigoUnico && { codigoUnico }),
      },
      include: {
        estudiante: true,
        curso: true,
      },
      orderBy: {
        fechaEmision: 'desc',
      },
    });

    return NextResponse.json(certificados);
  } catch (error) {
    console.error('Error al obtener certificados:', error);
    return NextResponse.json({ error: 'Error al obtener certificados' }, { status: 500 });
  }
}
