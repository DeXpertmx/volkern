export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/tarjetas-digitales/historial
 * Obtiene el historial de tarjetas escaneadas por el usuario
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { digitalCard: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asociado' },
        { status: 400 }
      );
    }

    if (!user.digitalCard) {
      return NextResponse.json({
        historial: [],
        total: 0,
      });
    }

    // Obtener el historial de escaneos
    const historial = await prisma.scannedCard.findMany({
      where: {
        digitalCardId: user.digitalCard.id,
      },
      include: {
        lead: {
          select: {
            id: true,
            nombre: true,
            email: true,
            telefono: true,
            empresa: true,
            estado: true,
          },
        },
      },
      orderBy: {
        fechaEscaneo: 'desc',
      },
    });

    return NextResponse.json({
      historial,
      total: historial.length,
    });
  } catch (error) {
    console.error('Error al obtener historial:', error);
    return NextResponse.json(
      { error: 'Error al obtener el historial' },
      { status: 500 }
    );
  }
}
