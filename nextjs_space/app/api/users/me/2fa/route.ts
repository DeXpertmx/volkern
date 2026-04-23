import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { enabled } = await req.json();
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
      // Usamos executeRawUnsafe para saltarnos la validación de campos del cliente de Prisma
      // que está desincronizado. La base de datos SI tiene estos campos.
      const userId = session.user.id;
      const isEnabled = enabled ? 1 : 0; // Para PostgreSQL/SQLite compatible

      // Nota: Usamos queryRawUnsafe para asegurar que escribimos en los campos nuevos
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET "isTwoFactorEnabled" = $1, "twoFactorCode" = NULL, "twoFactorExpires" = NULL WHERE id = $2`,
        enabled,
        userId
      );

      return NextResponse.json({ 
        success: true, 
        isTwoFactorEnabled: enabled 
      });
    } catch (prismaError: any) {
      console.error('[2FA API] Raw SQL Error:', prismaError.message);
      return NextResponse.json({ error: 'Error de base de datos (SQL): ' + prismaError.message }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: 'Error crítico: ' + error.message }, { status: 500 });
  }
}
