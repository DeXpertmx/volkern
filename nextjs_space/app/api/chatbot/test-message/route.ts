export const dynamic = 'force-dynamic';
/**
 * API para probar el chatbot desde la interfaz de administración
 * Usa el motor local con RAG, embeddings e intención
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { processMessage } from '@/lib/chat/chatbot-service';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Obtener tenantId del usuario
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const tenantId = user.tenantId;
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 });
    }

    // Procesar con el motor local (RAG + embeddings + intención + LLM con fallback)
    const result = await processMessage({
      tenantId,
      message,
      channel: 'api',
      metadata: { isTest: true },
    });

    if (!result.success) {
      return NextResponse.json({
        success: false,
        response: result.response || 'Lo siento, no pude procesar tu mensaje.',
        error: result.error,
      });
    }

    return NextResponse.json({
      success: true,
      response: result.response,
      fueraHorario: result.fueraHorario || false,
      action: result.action || 'ninguna',
    });

  } catch (error) {
    console.error('Error en test-message:', error);
    return NextResponse.json(
      { error: 'Error al procesar mensaje' },
      { status: 500 }
    );
  }
}
