export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET - Obtener búsquedas guardadas
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asignado' },
        { status: 403 }
      );
    }

    const searches = await prisma.savedSearch.findMany({
      where: {
        tenantId: user.tenantId,
      },
      orderBy: {
        ultimaActualizacion: 'desc',
      },
    });

    return NextResponse.json({ searches });
  } catch (error) {
    console.error('Error al obtener búsquedas guardadas:', error);
    return NextResponse.json(
      { error: 'Error al obtener búsquedas guardadas' },
      { status: 500 }
    );
  }
}

// POST - Crear búsqueda guardada
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asignado' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, source, criteria, resultsCount } = body;

    const savedSearch = await prisma.savedSearch.create({
      data: {
        tenantId: user.tenantId,
        userId: session.user.id,
        nombre: name,
        fuente: source,
        criterios: criteria,
        totalResultados: resultsCount || 0,
      },
    });

    return NextResponse.json({ savedSearch }, { status: 201 });
  } catch (error) {
    console.error('Error al crear búsqueda guardada:', error);
    return NextResponse.json(
      { error: 'Error al crear búsqueda guardada' },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar búsqueda guardada
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID de búsqueda requerido' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asignado' },
        { status: 403 }
      );
    }

    // Verificar que la búsqueda pertenece al tenant
    const search = await prisma.savedSearch.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
    });

    if (!search) {
      return NextResponse.json(
        { error: 'Búsqueda no encontrada' },
        { status: 404 }
      );
    }

    await prisma.savedSearch.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar búsqueda guardada:', error);
    return NextResponse.json(
      { error: 'Error al eliminar búsqueda guardada' },
      { status: 500 }
    );
  }
}
