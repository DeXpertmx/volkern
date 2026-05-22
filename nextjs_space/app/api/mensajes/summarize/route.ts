export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { callLlm } from '@/lib/openrouter-helper';


export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { conversationId } = await request.json();

        if (!conversationId) {
            return NextResponse.json({ error: 'ID de conversación requerido' }, { status: 400 });
        }

        // 1. Obtener la conversación y sus mensajes
        const conversacion = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                mensajes: {
                    orderBy: { fechaCreacion: 'asc' },
                    take: 50, // Tomar los últimos 50 para el resumen
                },
                lead: true,
            },
        });

        if (!conversacion) {
            return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
        }

        if (conversacion.mensajes.length === 0) {
            return NextResponse.json({ summary: 'No hay mensajes para resumir.' });
        }

        // 2. Formatear el historial para el prompt
        const historyText = conversacion.mensajes
            .map((m) => `${m.direccion === 'saliente' ? 'Asesor' : (conversacion.lead?.nombre || 'Cliente')}: ${m.contenido}`)
            .join('\n');

        // 3. Llamar a OpenRouter (DeepSeek V4 Flash con fallback Gemini)
        const summary = await callLlm(systemPrompt, `Por favor resume esta conversación:\n\n${historyText}`, {
          temperature: 0.5,
          maxTokens: 500,
        });

        return NextResponse.json({ summary });

    } catch (error) {
        console.error('Error al generar resumen:', error);
        return NextResponse.json(
            { error: 'Error al procesar el resumen con IA' },
            { status: 500 }
        );
    }
}
