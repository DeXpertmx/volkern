export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';


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

        // 3. Llamar al LLM (Abacus AI)
        const systemPrompt = `Eres un asistente experto en CRM. Tu tarea es generar un resumen ejecutivo y conciso de una conversación con un cliente.
USA PUNTOS CLAVE (bullet points).
Enfócate en:
- El problema o necesidad principal del cliente.
- Acuerdos alcanzados.
- Próximos pasos (Next Steps).
Responde SIEMPRE en español.`;

        const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4.1-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Por favor resume esta conversación:\n\n${historyText}` },
                ],
                max_tokens: 500,
                temperature: 0.5,
            }),
        });

        if (!response.ok) {
            throw new Error(`Error de API: ${response.status}`);
        }

        const data = await response.json();
        const summary = data.choices?.[0]?.message?.content || 'No se pudo generar el resumen.';

        return NextResponse.json({ summary });

    } catch (error) {
        console.error('Error al generar resumen:', error);
        return NextResponse.json(
            { error: 'Error al procesar el resumen con IA' },
            { status: 500 }
        );
    }
}
