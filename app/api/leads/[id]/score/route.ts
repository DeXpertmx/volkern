export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ScoringEngine } from '@/lib/scoring-engine';


export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const leadId = params.id;

        if (!leadId) {
            return NextResponse.json({ error: 'ID de lead requerido' }, { status: 400 });
        }

        const result = await ScoringEngine.calculateAIScore(leadId);

        if (!result) {
            return NextResponse.json(
                { error: 'No se pudo generar el score con IA' },
                { status: 500 }
            );
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in AI Scoring API:', error);
        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}
