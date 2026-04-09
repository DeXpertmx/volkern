export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const prisma = new PrismaClient();

// GET - Obtener todas las categorías de scoring
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const categories = await prisma.scoreCategory.findMany({
      orderBy: { orden: 'asc' },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error('Error obteniendo categorías:', error);
    return NextResponse.json(
      { error: 'Error obteniendo categorías de scoring' },
      { status: 500 }
    );
  }
}

// POST - Crear una nueva categoría de scoring
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      nombre,
      etiqueta,
      descripcion,
      puntuacionMin,
      puntuacionMax,
      color,
      icono,
      orden,
    } = body;

    if (!nombre || !etiqueta || puntuacionMin === undefined || puntuacionMax === undefined) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      );
    }

    const category = await prisma.scoreCategory.create({
      data: {
        nombre,
        etiqueta,
        descripcion,
        puntuacionMin,
        puntuacionMax,
        color,
        icono,
        orden: orden || 0,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error('Error creando categoría:', error);
    return NextResponse.json(
      { error: 'Error creando categoría de scoring' },
      { status: 500 }
    );
  }
}

// PUT - Actualizar una categoría de scoring
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

    const category = await prisma.scoreCategory.update({
      where: { id },
      data,
    });

    return NextResponse.json(category);
  } catch (error) {
    console.error('Error actualizando categoría:', error);
    return NextResponse.json(
      { error: 'Error actualizando categoría de scoring' },
      { status: 500 }
    );
  }
}
