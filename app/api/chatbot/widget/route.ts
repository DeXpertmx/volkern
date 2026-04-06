export const dynamic = 'force-dynamic';

/**
 * API para el widget de chatbot embebible
 * Maneja mensajes desde sitios web externos
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

const client = new OpenAI({
  apiKey: process.env.ABACUSAI_API_KEY,
  baseURL: 'https://api.abacus.ai/v1',
});

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

// POST: Procesar mensaje del widget
export async function POST(request: NextRequest) {
  try {
    const widgetKey = request.headers.get('X-Widget-Key');
    const body = await request.json();
    const { message, sessionId, conversationHistory = [] } = body;

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

    // Buscar configuración
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

    // Verificar horario si aplica
    const dentroHorario = isWithinBusinessHours(config);

    if (!dentroHorario && config.mensajeFueraHorario) {
      return NextResponse.json({
        success: true,
        response: config.mensajeFueraHorario,
        sessionId: sessionId || uuidv4(),
        fueraHorario: true,
      }, { headers: corsHeaders });
    }

    // Cargar tenant y servicios
    const tenant = await prisma.tenant.findUnique({
      where: { id: widgetKey }
    });

    const servicios = await prisma.servicio.findMany({
      where: { tenantId: widgetKey, activo: true }
    });

    // Construir prompt del sistema
    const systemPrompt = buildWidgetSystemPrompt(config, tenant, servicios);

    // Construir mensajes
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

    const response = completion.choices[0]?.message?.content || 
                     'Lo siento, no pude procesar tu mensaje.';

    // Actualizar estadísticas
    await prisma.chatbotConfig.update({
      where: { id: config.id },
      data: {
        totalConversaciones: { increment: 1 }
      }
    });

    // Crear lead si es primera interacción con email/datos
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      const existingLead = await prisma.lead.findFirst({
        where: { email: emailMatch[0], tenantId: widgetKey }
      });

      if (!existingLead) {
        await prisma.lead.create({
          data: {
            tenantId: widgetKey,
            email: emailMatch[0],
            nombre: 'Visitante Web',
            fuente: 'chatbot_web',
            estado: 'nuevo',
            notas: `Lead creado desde widget de chatbot web. Sesión: ${sessionId || 'N/A'}`,
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      response,
      sessionId: sessionId || uuidv4(),
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Error en widget POST:', error);
    return NextResponse.json(
      { error: 'Error al procesar mensaje' },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Verifica si está dentro del horario de atención
 */
function isWithinBusinessHours(config: any): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay().toString();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  
  // Usar horarios personalizados si existen
  if (config.horariosPersonalizados && typeof config.horariosPersonalizados === 'object') {
    const daySchedule = config.horariosPersonalizados[dayOfWeek];
    
    if (!daySchedule || !Array.isArray(daySchedule) || daySchedule.length === 0) {
      return false;
    }
    
    for (const range of daySchedule) {
      if (!range.inicio || !range.fin) continue;
      
      const [startHour, startMin] = range.inicio.split(':').map(Number);
      const [endHour, endMin] = range.fin.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      if (currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes) {
        return true;
      }
    }
    
    return false;
  }
  
  // Fallback a horarios legacy
  const diasActivos = config.diasActivos.split(',');
  
  if (!diasActivos.includes(dayOfWeek)) {
    return false;
  }
  
  if (currentHour < config.horarioInicio || currentHour >= config.horarioFin) {
    return false;
  }
  
  return true;
}

function buildWidgetSystemPrompt(config: any, tenant: any, servicios: any[]): string {
  const serviciosList = servicios.map(s => 
    `- ${s.nombre}: ${s.duracionMinutos} minutos, $${s.precio}`
  ).join('\n');

  return `Eres ${config.nombreAsistente}, un asistente virtual de ${tenant?.nombre || 'nuestra empresa'} integrado en el sitio web.

${config.contextoNegocio ? `SOBRE EL NEGOCIO:\n${config.contextoNegocio}\n` : ''}
${config.personalidad ? `TU PERSONALIDAD:\n${config.personalidad}\n` : ''}

SERVICIOS DISPONIBLES:
${serviciosList || 'Consulta con nosotros para más información sobre nuestros servicios.'}

INSTRUCCIONES:
1. Sé amable, profesional y conciso
2. Responde en español
3. Proporciona información útil sobre los servicios
4. Si el visitante quiere agendar una cita o tiene consultas específicas, invítalo a:
   - Llamar al número de contacto
   - Escribir por WhatsApp
   - Dejar sus datos de contacto (nombre y email)
5. Captura información de contacto cuando sea posible
6. Si no puedes ayudar, ofrece conectar con un humano

NOTA: Este es el widget de chat del sitio web, no WhatsApp.`;
}
