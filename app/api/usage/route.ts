export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantUsage } from '@/lib/limits';
import { prisma } from '@/lib/db';

/**
 * GET /api/usage
 * Obtiene el uso actual de recursos del tenant
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

    // Obtener tenantId del usuario
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant' },
        { status: 403 }
      );
    }

    const usage = await getTenantUsage(user.tenantId);

    return NextResponse.json({ usage });
  } catch (error) {
    console.error('Error al obtener uso:', error);
    return NextResponse.json(
      { error: 'Error al obtener uso de recursos' },
      { status: 500 }
    );
  }
}
