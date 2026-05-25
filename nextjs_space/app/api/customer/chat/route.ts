export const dynamic = 'force-dynamic';

/**
 * POST /api/customer/chat
 * Mobile chat endpoint — authenticated via Bearer JWT.
 * Uses system prompt with brand rules + user context, delegates to AI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { CustomerAuthService } from '@/lib/auth/customer-auth';
import { callAssistantWithFallback } from '@/lib/assistant/openrouter-client';
import { getGemmaSystemPrompt } from '@/lib/assistant/gemma-personality';
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

    // ── Build context with user info ──
    const context = [
      `INFORMACIÓN DEL USUARIO:`,
      `- ID de usuario: ${session.userId}`,
      `- ID del tenant/espacio: ${session.tenantId}`,
      `- Fecha actual: ${new Date().toLocaleDateString('es-MX', { timeZone: 'UTC' })}`,
      ``,
      `INSTRUCCIÓN: Responde al mensaje del usuario usando el contexto de Volkern.`,
      `Si el usuario pide datos que no puedes consultar (como listas de leads, reportes, etc.),`,
      `dirígelo amablemente al módulo correspondiente dentro de Volkern.`,
    ].join('\n');

    // ── Build messages with system prompt + context ──
    const systemPrompt = getGemmaSystemPrompt(context);
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: message },
    ];

    // ── Call AI with fallback support ──
    let result;
    try {
      result = await callAssistantWithFallback(messages);
    } catch (aiError) {
      console.error('[CustomerChat] All AI models failed:', aiError);
      return NextResponse.json(
        { error: 'Error al procesar el mensaje. Intenta de nuevo.' },
        { status: 500 },
      );
    }

    // ── Build response matching mobile ChatResponse ──
    const responseChatId = chatId || uuidv4();
    const reply = result.choices[0].message.content;

    return NextResponse.json({
      reply,
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
