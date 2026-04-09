export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ScoringEngine } from '@/lib/scoring-engine';

// POST - Calcular score basado en un evento
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { leadId, evento, categoria, detalles } = body;

    if (!leadId || !evento || !categoria) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: leadId, evento, categoria' },
        { status: 400 }
      );
    }

    const result = await ScoringEngine.calculateScore({
      leadId,
      evento,
      categoria,
      detalles,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'No se pudo calcular el score' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error calculando score:', error);
    return NextResponse.json(
      { error: 'Error calculando score' },
      { status: 500 }
    );
  }
}
