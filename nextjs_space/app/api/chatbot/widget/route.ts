export const dynamic = 'force-dynamic';

/**
 * API para el widget de chatbot embebible
 * Maneja mensajes desde sitios web externos usando el motor local con RAG
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { processMessage } from '@/lib/chat/chatbot-service';

// CORS headers para permitir acceso desde cualquier origen
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Widget-Key',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET: Obtener configuración del widget
export async function GET(request: NextRequest) {
  try {
    const widgetKey = request.headers.get('X-Widget-Key') || 
                       request.nextUrl.searchParams.get('key');

    if (!widgetKey) {
      return NextResponse.json(
        { error: 'Widget key requerida' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Buscar tenant por widget key (usamos el tenantId como key por simplicidad)
    const config = await prisma.chatbotConfig.findFirst({
      where: { 
        tenantId: widgetKey,
        activo: true 
      }
    });

    if (!config) {
      return NextResponse.json(
        { error: 'Widget no encontrado o inactivo' },
        { status: 404, headers: corsHeaders }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: widgetKey }
    });

    return NextResponse.json({
      success: true,
      config: {
        nombreAsistente: config.nombreAsistente,
        mensajeBienvenida: config.mensajeBienvenida,
        nombreEmpresa: tenant?.nombre || 'Empresa',
        primaryColor: '#2563eb',
      }
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Error en widget GET:', error);
    return NextResponse.json(
      { error: 'Error interno' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST: Procesar mensaje del widget usando el motor local con RAG
export async function POST(request: NextRequest) {
  try {
    const widgetKey = request.headers.get('X-Widget-Key');
    const body = await request.json();
    const { message, sessionId } = body;

    if (!widgetKey) {
      return NextResponse.json(
        { error: 'Widget key requerida' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!message) {
      return NextResponse.json(
        { error: 'Mensaje requerido' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verificar que el chatbot esté activo
    const config = await prisma.chatbotConfig.findFirst({
      where: { 
        tenantId: widgetKey,
        activo: true 
      }
    });

    if (!config) {
      return NextResponse.json(
        { error: 'Widget no encontrado o inactivo' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Procesar con el motor local (RAG + embeddings + intención + LLM con fallback)
    const result = await processMessage({
      tenantId: widgetKey,
      conversationId: sessionId || undefined,
      message,
      channel: 'web',
      contactName: 'Visitante Web',
    });

    if (!result.success) {
      return NextResponse.json({
        success: false,
        response: result.response || 'Lo siento, no pude procesar tu mensaje.',
        sessionId: sessionId || uuidv4(),
      }, { headers: corsHeaders });
    }

    return NextResponse.json({
      success: true,
      response: result.response,
      sessionId: sessionId || uuidv4(),
      fueraHorario: result.fueraHorario || false,
      action: result.action || 'ninguna',
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Error en widget POST:', error);
    return NextResponse.json(
      { error: 'Error al procesar mensaje' },
      { status: 500, headers: corsHeaders }
    );
  }
}


