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

        // 3. Llamar al LLM
        const systemPrompt = `Eres un asesor de ventas experto. Tu tarea es sugerir la respuesta más adecuada y profesional para el cliente.
CONTEXTO DEL NEGOCIO (Servicios):
${servicesInfo}

REGLAS:
- Sé amable, profesional y persuasivo.
- Si el cliente tiene una duda, respóndela basándote en los servicios.
- Si parece listo para agendar, incentiva el cierre.
- Mantén la respuesta concisa (máximo 3 párrafos cortos).
- Responde SIEMPRE en español.`;

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
                    { role: 'user', content: `Basado en este historial, ¿cuál debería ser mi siguiente respuesta como asesor?:\n\n${historyText}` },
                ],
                max_tokens: 500,
                temperature: 0.7,
            }),
        });

        if (!response.ok) {
            throw new Error(`Error de API: ${response.status}`);
        }

        const data = await response.json();
        const suggestion = data.choices?.[0]?.message?.content || '';

        return NextResponse.json({ suggestion });

    } catch (error) {
        console.error('Error al generar sugerencia:', error);
        return NextResponse.json(
            { error: 'Error al procesar la sugerencia con IA' },
            { status: 500 }
        );
    }
}
