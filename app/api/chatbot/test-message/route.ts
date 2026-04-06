export const dynamic = 'force-dynamic';
/**
 * API para probar el chatbot desde la interfaz de administración
 * No envía mensajes por WhatsApp, solo simula la conversación
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.ABACUSAI_API_KEY,
  baseURL: 'https://api.abacus.ai/v1',
});

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
    const { message, conversationHistory = [] } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 });
    }

    // Cargar configuración del chatbot
    let config = await prisma.chatbotConfig.findUnique({
      where: { tenantId }
    });

    if (!config) {
      config = await prisma.chatbotConfig.create({
        data: {
          tenantId,
          activo: true,
          nombreAsistente: 'Asistente Virtual',
        }
      });
    }

    // Cargar tenant y servicios
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    const servicios = await prisma.servicio.findMany({
      where: { tenantId, activo: true }
    });

    // Construir prompt del sistema
    const systemPrompt = buildSystemPrompt(config, tenant, servicios);

    // Construir mensajes para el LLM
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-8).map((m: any) => ({
        role: m.role,
        content: m.content
      })),
      { role: 'user', content: message }
    ];

    // Llamar al LLM
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content || 'Lo siento, no pude procesar tu mensaje.';

    // Actualizar estadísticas (solo conversaciones)
    await prisma.chatbotConfig.update({
      where: { id: config.id },
      data: {
        totalConversaciones: { increment: 1 }
      }
    });

    return NextResponse.json({
      success: true,
      response,
    });

  } catch (error) {
    console.error('Error en test-message:', error);
    return NextResponse.json(
      { error: 'Error al procesar mensaje' },
      { status: 500 }
    );
  }
}

function buildSystemPrompt(config: any, tenant: any, servicios: any[]): string {
  const serviciosList = servicios.map(s => 
    `- ${s.nombre}: ${s.duracionMinutos} minutos, $${s.precio}`
  ).join('\n');

  return `Eres ${config.nombreAsistente}, un asistente virtual profesional de ${tenant?.nombre || 'nuestra empresa'}.

${config.contextoNegocio ? `CONTEXTO DEL NEGOCIO:\n${config.contextoNegocio}\n` : ''}
${config.personalidad ? `PERSONALIDAD Y TONO:\n${config.personalidad}\n` : ''}

SERVICIOS DISPONIBLES:
${serviciosList || 'No hay servicios configurados actualmente.'}

CAPACIDADES:
- ${config.puedeAgendarCitas ? 'Puedes' : 'NO puedes'} agendar citas
- ${config.puedeMostrarServicios ? 'Puedes' : 'NO puedes'} mostrar información de servicios
- ${config.puedeTransferirHumano ? 'Puedes' : 'NO puedes'} transferir a un agente humano

INSTRUCCIONES:
1. Sé amable, profesional y conciso
2. Responde en español
3. Si te preguntan sobre servicios, proporciona información útil
4. Si quieren agendar, guíalos en el proceso
5. Si necesitan hablar con un humano, ofrece esa opción
6. IMPORTANTE: Esto es una prueba desde el panel de administración, no una conversación real de WhatsApp

Responde de manera natural y útil.`;
}
