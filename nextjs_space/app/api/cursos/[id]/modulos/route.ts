export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSessionTenantId, tenantWhere } from '@/lib/academy/tenant-guard';

// POST /api/cursos/[id]/modulos - Crear un nuevo módulo para un curso
export async function POST(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Verificar que el curso pertenezca al tenant de la sesión
    const curso = await prisma.curso.findFirst({
      where: { id: params.id, ...tenantWhere(await getSessionTenantId(session.user?.email)) },
      select: { id: true },
    });
    if (!curso) {
      return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { titulo, descripcion, orden } = body;

    // Obtener el último orden si no se proporciona
    let ordenModulo = orden;
    if (!ordenModulo) {
      const ultimoModulo = await prisma.modulo.findFirst({
        where: { cursoId: params.id },
        orderBy: { orden: 'desc' },
      });
      ordenModulo = ultimoModulo ? ultimoModulo.orden + 1 : 1;
    }

    const modulo = await prisma.modulo.create({
      data: {
        cursoId: params.id,
        titulo,
        descripcion,
        orden: ordenModulo,
      },
    });

    return NextResponse.json(modulo, { status: 201 });
  } catch (error) {
    console.error('Error al crear módulo:', error);
    return NextResponse.json({ error: 'Error al crear módulo' }, { status: 500 });
  }
}
