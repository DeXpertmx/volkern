import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { enabled } = await req.json();

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        isTwoFactorEnabled: enabled,
        // Limpiar códigos si se desactiva
        twoFactorCode: null,
        twoFactorExpires: null,
      },
    });

    return NextResponse.json({ 
      success: true, 
      isTwoFactorEnabled: user.isTwoFactorEnabled 
    });
  } catch (error) {
    console.error('Error toggling 2FA:', error);
    return NextResponse.json({ error: 'Error al actualizar configuración' }, { status: 500 });
  }
}
