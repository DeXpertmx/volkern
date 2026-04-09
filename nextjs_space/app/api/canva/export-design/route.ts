export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Exporta un diseño de Canva como imagen
 * POST /api/canva/export-design
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

    const metadata = user.metadata as any;
    const canvaAuth = metadata?.canvaAuth;

    if (!canvaAuth || !canvaAuth.accessToken) {
      return NextResponse.json(
        { error: 'No hay token de Canva' },
        { status: 401 }
      );
    }

    const { designId, format = 'png' } = await req.json();

    if (!designId) {
      return NextResponse.json(
        { error: 'designId es requerido' },
        { status: 400 }
      );
    }

    // Solicitar exportación del diseño
    const exportResponse = await fetch(
      `https://api.canva.com/rest/v1/exports`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${canvaAuth.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          design_id: designId,
          format: format,
        }),
      }
    );

    if (!exportResponse.ok) {
      const errorText = await exportResponse.text();
      console.error('Error al exportar diseño:', errorText);
      return NextResponse.json(
        { error: 'Error al exportar diseño de Canva', details: errorText },
        { status: exportResponse.status }
      );
    }

    const exportData = await exportResponse.json();

    // El resultado puede ser un job_id que debemos consultar
    if (exportData.job?.id) {
      return NextResponse.json({
        success: true,
        jobId: exportData.job.id,
        status: 'processing',
        message: 'Exportación en proceso. Consulta el estado con el jobId.',
      });
    }

    // O puede retornar directamente la URL
    return NextResponse.json({
      success: true,
      exportUrl: exportData.urls?.get_url || exportData.url,
      ...exportData,
    });

  } catch (error: any) {
    console.error('Error al exportar diseño:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}
