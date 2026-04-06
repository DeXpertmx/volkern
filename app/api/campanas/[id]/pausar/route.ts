export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { pauseCampaign } from '@/lib/campaign-engine';

// POST /api/campanas/[id]/pausar - Pausar campaña
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await pauseCampaign(params.id);

    return NextResponse.json({
      success: true,
      message: 'Campaña pausada'
    });
  } catch (error: any) {
    console.error('Error al pausar campaña:', error);
    return NextResponse.json(
      { error: 'Error al pausar campaña', details: error.message },
      { status: 500 }
    );
  }
}
