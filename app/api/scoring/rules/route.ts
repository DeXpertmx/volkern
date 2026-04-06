export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const prisma = new PrismaClient();

// GET - Obtener todas las reglas de scoring
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const categoria = searchParams.get('categoria');
    const activo = searchParams.get('activo');

    const where: any = {};
    if (categoria) where.categoria = categoria;
    if (activo !== null) where.activo = activo === 'true';

    const rules = await prisma.scoringRule.findMany({
      where,
      orderBy: [{ orden: 'asc' }, { fechaCreacion: 'desc' }],
    });

    return NextResponse.json(rules);
  } catch (error) {
    console.error('Error obteniendo reglas:', error);
    return NextResponse.json(
      { error: 'Error obteniendo reglas de scoring' },
      { status: 500 }
    );
  }
}

// POST - Crear una nueva regla de scoring
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { nombre, descripcion, categoria, evento, puntos, condiciones, activo, orden } = body;

    if (!nombre || !categoria || !evento || puntos === undefined) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      );
    }

    const rule = await prisma.scoringRule.create({
      data: {
        nombre,
        descripcion,
        categoria,
        evento,
        puntos,
        condiciones: condiciones || {},
        activo: activo !== undefined ? activo : true,
        orden: orden || 0,
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error('Error creando regla:', error);
    return NextResponse.json(
      { error: 'Error creando regla de scoring' },
      { status: 500 }
    );
  }
}

// PUT - Actualizar una regla de scoring
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    const rule = await prisma.scoringRule.update({
      where: { id },
      data,
    });

    return NextResponse.json(rule);
  } catch (error) {
    console.error('Error actualizando regla:', error);
    return NextResponse.json(
      { error: 'Error actualizando regla de scoring' },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar una regla de scoring
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    await prisma.scoringRule.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Regla eliminada' });
  } catch (error) {
    console.error('Error eliminando regla:', error);
    return NextResponse.json(
      { error: 'Error eliminando regla de scoring' },
      { status: 500 }
    );
  }
}
