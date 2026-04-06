export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resumeCampaign } from '@/lib/campaign-engine';

// POST /api/campanas/[id]/reanudar - Reanudar campaña
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Reanudar la campaña (asíncrono)
    resumeCampaign(params.id).catch(error => {
      console.error('Error al reanudar campaña:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'Campaña reanudada'
    });
  } catch (error: any) {
    console.error('Error al reanudar campaña:', error);
    return NextResponse.json(
      { error: 'Error al reanudar campaña', details: error.message },
      { status: 500 }
    );
  }
}
