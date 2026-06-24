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
import { prisma } from '@/lib/db';
import { parseInmueble } from '@/lib/real-estate/property-helpers';

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
    const tenantId = session.tenantId;

    // Detectar si la consulta es inmobiliaria y recuperar propiedades recientes
    let realEstateContext = '';
    const lowerMsg = message.toLowerCase();
    const isRealEstateQuery = /propiedad|casa|piso|inmueble|alquiler|venta|habitación|departamento|terreno|local|oficina|chalet/i.test(lowerMsg);

    if (isRealEstateQuery) {
      try {
        // Recuperar últimas propiedades disponibles para contexto
        const properties = await prisma.$queryRawUnsafe(
          `SELECT * FROM "CatalogoItem"
           WHERE "tenantId" = $1 AND tipo = 'inmueble' AND activo = true
           AND ("customFieldValues"->>'estado' IS NULL OR "customFieldValues"->>'estado' = 'disponible')
           ORDER BY "fechaCreacion" DESC
           LIMIT 5`,
          tenantId
        );

        const rows = properties as any[];
        if (rows.length > 0) {
          const listings = rows.map((p) => {
            const parsed = parseInmueble(p);
            return `- ${parsed.propertyType || 'Inmueble'} en ${parsed.operationType || 'venta'}
  Precio: ${parsed.precioBase?.toLocaleString('es-ES') || '?'} €
  Ubicación: ${[parsed.city, (parsed as any).area].filter(Boolean).join(', ') || 'N/A'}
  ${parsed.bedrooms ? parsed.bedrooms + ' habs' : ''} ${parsed.bathrooms ? '/ ' + parsed.bathrooms + ' baños' : ''} ${parsed.areaM2 ? '/ ' + parsed.areaM2 + ' m²' : ''}`;
          }).join('\n\n');

          realEstateContext = `\n\nPROPIEDADES DISPONIBLES (últimas ${rows.length}):\n${listings}\n\n`;
          realEstateContext += `Instrucciones extra para consultas inmobiliarias:\n- Si el usuario pregunta por propiedades, usa la información de arriba.\n- Para búsquedas más específicas, sugiere usar el buscador de propiedades en Volkern.\n- Si quieres recomendar, destaca precio, ubicación y características clave.\n- Puedes mencionar que hay más propiedades disponibles en el portal.`;
        }
      } catch {
        // Silently fail - not critical if real estate context isn't available
      }
    }

    const context = [
      `INFORMACIÓN DEL USUARIO:`,
      `- ID de usuario: ${session.userId}`,
      `- ID del tenant/espacio: ${tenantId}`,
      `- Fecha actual: ${new Date().toLocaleDateString('es-MX', { timeZone: 'UTC' })}`,
      ``,
      `INSTRUCCIÓN: Responde al mensaje del usuario usando el contexto de Volkern.`,
      `Si el usuario pide datos que no puedes consultar (como listas de leads, reportes, etc.),`,
      `dirígelo amablemente al módulo correspondiente dentro de Volkern.`,
      realEstateContext,
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

    // Suggestions contextuales
    const suggestions = isRealEstateQuery
      ? [
        'Mostrar propiedades disponibles',
        'Buscar casas en alquiler',
        'Propiedades con 3 habitaciones',
        'Ver detalle de propiedades',
      ]
      : [
        'Crear un nuevo lead',
        'Agendar una cita',
        'Consultar inventario',
        '¿Qué módulos tengo?',
      ];

    return NextResponse.json({
      reply,
      chatId: responseChatId,
      suggestions,
    });
  } catch (error) {
    console.error('[CustomerChat] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
