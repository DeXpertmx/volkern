export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ScoringEngine } from '@/lib/scoring-engine';

// GET - Obtener estadísticas de scoring
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const stats = await ScoringEngine.getScoringStats();

    if (!stats) {
      return NextResponse.json(
        { error: 'No se pudieron obtener estadísticas' },
        { status: 500 }
      );
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return NextResponse.json(
      { error: 'Error obteniendo estadísticas de scoring' },
      { status: 500 }
    );
  }
}
