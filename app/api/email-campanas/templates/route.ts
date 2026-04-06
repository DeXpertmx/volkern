export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// GET /api/email-campanas/templates - Listar plantillas
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const categoria = searchParams.get('categoria');

    const where: any = {
      OR: [
        { tenantId: user.tenantId },
        { esOficial: true }
      ]
    };

    if (categoria) {
      where.categoria = categoria;
    }

    const plantillas = await prisma.emailTemplate.findMany({
      where,
      orderBy: [
        { esOficial: 'desc' },
        { vecesUtilizada: 'desc' },
        { fechaCreacion: 'desc' }
      ]
    });

    return NextResponse.json(plantillas);
  } catch (error: any) {
    console.error('Error al obtener plantillas:', error);
    return NextResponse.json(
      { error: 'Error al obtener plantillas', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/email-campanas/templates - Crear plantilla
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const data = await request.json();

    if (!data.nombre || !data.contenidoHTML) {
      return NextResponse.json(
        { error: 'Campos requeridos: nombre, contenidoHTML' },
        { status: 400 }
      );
    }

    const plantilla = await prisma.emailTemplate.create({
      data: {
        tenantId: user.tenantId,
        nombre: data.nombre,
        descripcion: data.descripcion,
        categoria: data.categoria || 'general',
        asuntoPorDefecto: data.asuntoPorDefecto || '',
        contenidoHTML: data.contenidoHTML,
        contenidoTexto: data.contenidoTexto,
        variablesDisponibles: data.variablesDisponibles 
          ? JSON.stringify(data.variablesDisponibles) 
          : JSON.stringify(['nombre', 'email', 'empresa', 'cargo']),
        creadoPor: user.id
      }
    });

    return NextResponse.json(plantilla, { status: 201 });
  } catch (error: any) {
    console.error('Error al crear plantilla:', error);
    return NextResponse.json(
      { error: 'Error al crear plantilla', details: error.message },
      { status: 500 }
    );
  }
}
