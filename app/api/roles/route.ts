export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

// GET /api/roles - Listar roles del tenant
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { role: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Verificar permiso
    if (!hasPermission(currentUser, 'equipo', 'ver')) {
      return NextResponse.json({ error: 'Sin permiso para ver roles' }, { status: 403 });
    }

    // Obtener roles del mismo tenant
    const roles = await prisma.role.findMany({
      where: {
        tenantId: currentUser.tenantId || undefined,
      },
      orderBy: {
        orden: 'asc',
      },
    });

    return NextResponse.json(roles);
  } catch (error: any) {
    console.error('Error al obtener roles:', error);
    return NextResponse.json({ error: 'Error al obtener roles' }, { status: 500 });
  }
}
