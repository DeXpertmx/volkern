export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/cupones/validar - Validar un código de cupón
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { codigo, cursoId } = body;

    const cupon = await prisma.cupon.findFirst({
      where: {
        codigo,
        cursoId,
        activo: true,
      },
    });

    if (!cupon) {
      return NextResponse.json({ error: 'Cupón no válido' }, { status: 404 });
    }

    // Check if expired
    if (cupon.fechaExpiracion && new Date() > cupon.fechaExpiracion) {
      return NextResponse.json({ error: 'Cupón expirado' }, { status: 400 });
    }

    // Check if not yet valid
    if (cupon.fechaInicio && new Date() < cupon.fechaInicio) {
      return NextResponse.json({ error: 'Cupón aún no válido' }, { status: 400 });
    }

    // Check usage limits
    if (cupon.usosMaximos !== -1 && cupon.usosActuales >= cupon.usosMaximos) {
      return NextResponse.json({ error: 'Cupón agotado' }, { status: 400 });
    }

    return NextResponse.json(cupon);
  } catch (error) {
    console.error('Error al validar cupón:', error);
    return NextResponse.json({ error: 'Error al validar cupón' }, { status: 500 });
  }
}
