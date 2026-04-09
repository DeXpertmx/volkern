export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Verifica el estado de un job de exportación
 * GET /api/canva/check-export?jobId=xxx
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
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId es requerido' },
        { status: 400 }
      );
    }

    // Consultar estado del job
    const jobResponse = await fetch(
      `https://api.canva.com/rest/v1/exports/${jobId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${canvaAuth.accessToken}`,
        },
      }
    );

    if (!jobResponse.ok) {
      const errorText = await jobResponse.text();
      console.error('Error al consultar job:', errorText);
      return NextResponse.json(
        { error: 'Error al consultar estado de exportación' },
        { status: jobResponse.status }
      );
    }

    const jobData = await jobResponse.json();

    return NextResponse.json({
      success: true,
      status: jobData.status || jobData.job?.status,
      exportUrl: jobData.urls?.get_url || jobData.url,
      ...jobData,
    });

  } catch (error: any) {
    console.error('Error al consultar job:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}
