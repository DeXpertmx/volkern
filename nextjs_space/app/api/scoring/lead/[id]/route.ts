export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ScoringEngine } from '@/lib/scoring-engine';

const prisma = new PrismaClient();

// GET - Obtener el score de un lead específico
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const leadId = id;

    // Obtener el score del lead
    const score = await ScoringEngine.getLeadScore(leadId);

    if (!score) {
      return NextResponse.json({ error: 'Score no encontrado' }, { status: 404 });
    }

    // Obtener historial de cambios
    const history = await ScoringEngine.getScoreHistory(leadId, 20);

    return NextResponse.json({
      score,
      history,
    });
  } catch (error) {
    console.error('Error obteniendo score del lead:', error);
    return NextResponse.json(
      { error: 'Error obteniendo score del lead' },
      { status: 500 }
    );
  }
}

// POST - Recalcular el score de un lead
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const leadId = id;

    const result = await ScoringEngine.recalculateLeadScore(leadId);

    if (!result) {
      return NextResponse.json(
        { error: 'No se pudo recalcular el score' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error recalculando score:', error);
    return NextResponse.json(
      { error: 'Error recalculando score del lead' },
      { status: 500 }
    );
  }
}
