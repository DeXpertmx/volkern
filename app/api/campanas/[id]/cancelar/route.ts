export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { cancelCampaign } from '@/lib/campaign-engine';

// POST /api/campanas/[id]/cancelar - Cancelar campaña
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await cancelCampaign(params.id);

    return NextResponse.json({
      success: true,
      message: 'Campaña cancelada'
    });
  } catch (error: any) {
    console.error('Error al cancelar campaña:', error);
    return NextResponse.json(
      { error: 'Error al cancelar campaña', details: error.message },
      { status: 500 }
    );
  }
}
