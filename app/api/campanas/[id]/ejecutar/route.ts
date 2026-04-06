export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { executeCampaign } from '@/lib/campaign-engine';

// POST /api/campanas/[id]/ejecutar - Ejecutar campaña
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Ejecutar la campaña (asíncrono)
    executeCampaign(params.id).catch(error => {
      console.error('Error en ejecución de campaña:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'Campaña en ejecución'
    });
  } catch (error: any) {
    console.error('Error al ejecutar campaña:', error);
    return NextResponse.json(
      { error: 'Error al ejecutar campaña', details: error.message },
      { status: 500 }
    );
  }
}
