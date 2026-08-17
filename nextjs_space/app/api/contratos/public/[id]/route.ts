export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET público para ver contrato
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const contrato = await prisma.contrato.findUnique({
      where: { tokenPublico: params.id },
      include: {
        items: { orderBy: { orden: 'asc' } },
        signatureRequests: {
          orderBy: { createdAt: 'desc' },
          take: 3
        },
        timeline: { orderBy: { createdAt: 'desc' }, take: 20 },
        tenant: {
          select: {
            nombre: true,
            dominio: true,
            configuracion: true
          }
        }
      }
    });

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
    }

    // Actualizar tracking
    await prisma.contrato.update({
      where: { id: contrato.id },
      data: {
        vecesVista: { increment: 1 },
        ultimaVista: new Date(),
        fechaPrimeraVista: contrato.fechaPrimeraVista || new Date()
      }
    });

    return NextResponse.json(contrato);
  } catch (error) {
    console.error('Error fetching public contrato:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
