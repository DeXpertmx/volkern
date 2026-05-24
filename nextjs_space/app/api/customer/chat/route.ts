export const dynamic = 'force-dynamic';

/**
 * POST /api/customer/chat
 * Mobile chat endpoint — authenticated via Bearer JWT.
 * Delegates to AIEngine for LLM responses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { CustomerAuthService } from '@/lib/auth/customer-auth';
import { AIEngine } from '@/lib/event-engine/ai-engine';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    // ── Bearer token validation ──
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Token de autenticación requerido' },
        { status: 401 },
      );
    }

    const token = authHeader.slice(7);
    const session = await CustomerAuthService.validateToken(token);
    if (!session) {
      return NextResponse.json(
        { error: 'Token inválido o expirado' },
        { status: 401 },
      );
    }

    // ── Parse body ──
    const body = await request.json();
    const { message, chatId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Mensaje requerido' },
        { status: 400 },
      );
    }

    // ── Call AIEngine ──
    const result = await AIEngine.chat(
      { prompt: message, model: 'gemma', temperature: 0.7, max_tokens: 1024 },
      session.tenantId,
    );

    if (result.error) {
      console.error('[CustomerChat] AIEngine error:', result.error);
      return NextResponse.json(
        { error: 'Error al procesar el mensaje' },
        { status: 500 },
      );
    }

    // ── Build response matching mobile ChatResponse ──
    const responseChatId = chatId || uuidv4();

    return NextResponse.json({
      reply: result.content,
      chatId: responseChatId,
      suggestions: [
        'Crear un nuevo lead',
        'Agendar una cita',
        'Consultar inventario',
        '¿Qué módulos tengo?',
      ],
    });
  } catch (error) {
    console.error('[CustomerChat] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
