export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Desconecta la cuenta de Canva del usuario
 * POST /api/canva/disconnect
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Limpiar la autenticación de Canva del metadata
    const currentMetadata = (user.metadata as any) || {};
    const updatedMetadata = {
      ...currentMetadata,
      canvaAuth: null, // Eliminar completamente la autenticación
    };

    await prisma.user.update({
      where: { email: session.user.email },
      data: {
        metadata: updatedMetadata,
      },
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        accion: 'desconectar',
        entidad: 'integracion',
        entidadId: 'canva',
        descripcion: `Usuario ${user.email} desconectó Canva para refrescar permisos OAuth`,
        cambiosAntes: {
          connected: true,
          accessToken: 'redacted',
        },
        cambiosDespues: {
          connected: false,
          reason: 'Manual disconnection to refresh OAuth scopes',
        },
      },
    });

    console.log('✅ Canva desconectado exitosamente para usuario:', user.email);

    return NextResponse.json({
      success: true,
      message: 'Cuenta de Canva desconectada exitosamente',
    });

  } catch (error: any) {
    console.error('❌ Error al desconectar Canva:', error);
    return NextResponse.json(
      { error: 'Error al desconectar Canva', details: error.message },
      { status: 500 }
    );
  }
}
