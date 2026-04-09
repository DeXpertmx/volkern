export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Obtiene información de un diseño de Canva, incluyendo URL de exportación
 * GET /api/canva/get-design?designId=xxx
 */
export async function GET(req: NextRequest) {
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

    const metadata = user.metadata as any;
    const canvaAuth = metadata?.canvaAuth;

    if (!canvaAuth || !canvaAuth.accessToken) {
      return NextResponse.json(
        { error: 'No hay token de Canva' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const designId = searchParams.get('designId');

    if (!designId) {
      return NextResponse.json(
        { error: 'designId es requerido' },
        { status: 400 }
      );
    }

    // Obtener información del diseño
    const designResponse = await fetch(
      `https://api.canva.com/rest/v1/designs/${designId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${canvaAuth.accessToken}`,
        },
      }
    );

    if (!designResponse.ok) {
      const errorText = await designResponse.text();
      console.error('Error al obtener diseño:', errorText);
      return NextResponse.json(
        { error: 'Error al obtener diseño de Canva' },
        { status: designResponse.status }
      );
    }

    const designData = await designResponse.json();

    return NextResponse.json({
      success: true,
      design: designData,
    });

  } catch (error: any) {
    console.error('Error al obtener diseño:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}
