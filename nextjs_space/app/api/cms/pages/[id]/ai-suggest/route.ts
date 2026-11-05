export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import { callLlm } from '@/lib/openrouter-helper';

/**
 * POST /api/cms/pages/[id]/ai-suggest - Generar sugerencias de contenido con IA
 */
export const POST = withTenantAuth(async (req, auth, { id }) => {
  try {
    const tenant = auth.tenant;
    const body = await req.json();
    const { prompt, context, componentType } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt requerido' }, { status: 400 });
    }

    // El wrapper withTenantAuth ya garantiza que tenemos el tenant correcto
    // y configura el contexto de Prisma para el aislamiento.

    // Construir el prompt para la IA
    const systemPrompt = `Eres un experto en marketing digital y copywriting. Tu tarea es generar contenido atractivo y persuasivo para landing pages y sitios web.

Contexto del negocio: ${tenant?.nombre || 'Empresa'}
Industria: ${'General' || 'General'}

Reglas:
- Genera contenido en español
- Sé conciso y directo
- Usa un tono profesional pero accesible
- Incluye llamadas a la acción cuando sea apropiado
- Responde SOLO con el contenido solicitado, sin explicaciones adicionales`;

    let userPrompt = prompt;
    
    // Ajustar según el tipo de componente
    if (componentType) {
      switch (componentType) {
        case 'Hero':
          userPrompt = `Genera un título principal impactante y un subtítulo persuasivo para una sección hero. ${prompt}\n\nResponde en formato JSON: { "title": "...", "subtitle": "...", "ctaText": "..." }`;
          break;
        case 'Features':
          userPrompt = `Genera 3-4 características destacadas con icono (emoji), título y descripción. ${prompt}\n\nResponde en formato JSON: { "features": [{ "icon": "emoji", "title": "...", "description": "..." }] }`;
          break;
        case 'FAQ':
          userPrompt = `Genera 4-5 preguntas frecuentes con sus respuestas. ${prompt}\n\nResponde en formato JSON: { "items": [{ "question": "...", "answer": "..." }] }`;
          break;
        case 'Testimonial':
          userPrompt = `Genera un testimonio realista y persuasivo. ${prompt}\n\nResponde en formato JSON: { "quote": "...", "author": "Nombre", "role": "Cargo, Empresa", "rating": 5 }`;
          break;
        case 'Pricing':
          userPrompt = `Genera 2-3 planes de precios con nombres creativos y características. ${prompt}\n\nResponde en formato JSON: { "plans": [{ "name": "...", "price": "$XX", "period": "/mes", "features": ["..."], "highlighted": false }] }`;
          break;
        case 'Heading':
          userPrompt = `Genera un título atractivo para una sección. ${prompt}\n\nResponde SOLO el texto del título.`;
          break;
        case 'Text':
          userPrompt = `Genera un párrafo persuasivo. ${prompt}\n\nResponde SOLO el texto del párrafo.`;
          break;
        default:
          userPrompt = prompt;
      }
    }

    if (context) {
      userPrompt += `\n\nContexto adicional: ${context}`;
    }

    // Llamar a OpenRouter
    const content = await callLlm(systemPrompt, userPrompt, {
      temperature: 0.7,
      maxTokens: 1000,
    });

    // Intentar parsear como JSON si el contenido parece ser JSON
    let parsedContent = content;
    try {
      if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        // Limpiar posibles backticks de markdown
        const cleanContent = content.replace(/```json\n?|```\n?/g, '').trim();
        parsedContent = JSON.parse(cleanContent);
      }
    } catch (e) {
      // Si no es JSON válido, devolver como texto
      parsedContent = content;
    }

    return NextResponse.json({
      success: true,
      suggestion: parsedContent,
      componentType,
    });
  } catch (error) {
    console.error('[AI Suggest] Error:', error);
    return NextResponse.json({ error: 'Error al procesar solicitud' }, { status: 500 });
  }
}, ['cms:write']);
