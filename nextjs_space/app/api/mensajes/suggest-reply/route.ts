export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';


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

        // 3. Llamar a Gemma/Gemini via standardized client
        const systemPrompt = `Eres un asesor de ventas experto. Tu tarea es sugerir la respuesta más adecuada y profesional para el cliente.
CONTEXTO DEL NEGOCIO (Servicios):
${servicesInfo}

REGLAS:
- Sé amable, profesional y persuasivo.
- Si el cliente tiene una duda, respóndela basándote en los servicios.
- Si parece listo para agendar, incentiva el cierre.
- Mantén la respuesta concisa (máximo 3 párrafos cortos).
- Responde SIEMPRE en español.`;

        const messages: GemmaMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Basado en este historial, ¿cuál debería ser mi siguiente respuesta como asesor?:\n\n${historyText}` },
        ];

        const aiRes = await callGemma(messages, { temperature: 0.7 });

        if (aiRes.error) {
            throw new Error(`Error de IA: ${aiRes.error}`);
        }

        return NextResponse.json({ suggestion: aiRes.content });

    } catch (error: any) {
        console.error('Error al generar sugerencia:', error);
        return NextResponse.json(
            { error: error.message || 'Error al procesar la sugerencia con IA' },
            { status: 500 }
        );
    }
}
