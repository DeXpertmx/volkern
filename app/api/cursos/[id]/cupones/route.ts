export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/cursos/[id]/cupones - Obtener cupones de un curso
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const cupones = await prisma.cupon.findMany({
      where: { cursoId: params.id },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });

    return NextResponse.json(cupones);
  } catch (error) {
    console.error('Error al obtener cupones:', error);
    return NextResponse.json({ error: 'Error al obtener cupones' }, { status: 500 });
  }
}

// POST /api/cursos/[id]/cupones - Crear un cupón
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      codigo,
      descripcion,
      tipoDescuento,
      valorDescuento,
      usosMaximos,
      fechaInicio,
      fechaExpiracion,
      activo,
    } = body;

    const cupon = await prisma.cupon.create({
      data: {
        cursoId: params.id,
        codigo,
        descripcion,
        tipoDescuento: tipoDescuento || 'porcentaje',
        valorDescuento,
        usosMaximos: usosMaximos || -1,
        fechaInicio,
        fechaExpiracion,
        activo: activo !== undefined ? activo : true,
      },
    });

    return NextResponse.json(cupon, { status: 201 });
  } catch (error) {
    console.error('Error al crear cupón:', error);
    return NextResponse.json({ error: 'Error al crear cupón' }, { status: 500 });
  }
}
