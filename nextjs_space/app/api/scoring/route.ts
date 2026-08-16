export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { callLlm } from '@/lib/openrouter-helper';
import { cleanSuggestion } from '@/lib/ai/clean-suggestion';


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

        // 1. Obtener contexto: Conversación, Lead y Servicios (para conocimiento del negocio)
        const conversacion = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                mensajes: {
                    orderBy: { fechaCreacion: 'desc' },
                    take: 10, // Contexto de los últimos 10 mensajes
                },
                lead: true,
            },
        });

        if (!conversacion) {
            return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
        }

        const services = await prisma.servicio.findMany({
            where: { tenantId: conversacion.tenantId, activo: true },
        });

        // 2. Formatear historial
        const historyText = conversacion.mensajes
            .reverse()
            .map((m) => `${m.direccion === 'saliente' ? 'Asesor' : (conversacion.lead?.nombre || 'Cliente')}: ${m.contenido}`)
            .join('\n');

        const servicesInfo = services.map(s => `- ${s.nombre}: ${s.descripcion} ($${s.precio})`).join('\n');

        // 3. Llamar a OpenRouter (DeepSeek V4 Flash con fallback Gemini)
        const systemPrompt = `Eres un asesor de ventas experto. Basado en el historial de la conversación, sugiere la mejor respuesta para el asesor.

FORMATO DE SALIDA (obligatorio):
- Devuelve ÚNICAMENTE el texto de la respuesta lista para enviar al cliente.
- NO incluyas introducciones, explicaciones, análisis, ni frases como "Aquí tienes tu respuesta", "Como asesor" o "Te sugiero".
- NO uses comillas ni etiquetas alrededor de la respuesta.
- Empieza directamente con la respuesta, por ejemplo: "¡Hola! ¿En qué puedo ayudarte hoy?".`;
        const suggestion = await callLlm(systemPrompt, `Basado en este historial, ¿cuál debería ser mi siguiente respuesta como asesor?:\n\n${historyText}`, {
          temperature: 0.7,
          maxTokens: 500,
        });

        return NextResponse.json({ suggestion: cleanSuggestion(suggestion) });

    } catch (error) {
        console.error('Error al generar sugerencia:', error);
        return NextResponse.json(
            { error: 'Error al procesar la sugerencia con IA' },
            { status: 500 }
        );
    }
}
