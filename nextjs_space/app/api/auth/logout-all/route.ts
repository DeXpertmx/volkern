export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * POST /api/auth/logout-all
 * Incrementa el tokenVersion del usuario para invalidar todas las sesiones activas (JWT)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Incrementamos el tokenVersion
    await prisma.user.update({
      where: { id: (session.user as any).id },
      data: {
        tokenVersion: {
          increment: 1
        }
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Todas las sesiones han sido invalidadas' 
    });
  } catch (error: any) {
    console.error('Error in logout-all:', error);
    return NextResponse.json({ error: 'Error al invalidar sesiones' }, { status: 500 });
  }
}
