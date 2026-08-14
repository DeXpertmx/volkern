export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';

const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GOOGLE_AI_KEY}`;

const SYSTEM_PROMPT = `Eres un arquitecto experto en GrapesJS y Volkern CRM. Tu tarea es generar el JSON de "projectData" para una landing page completa basándote en la descripción del usuario.

REGLAS CRÍTICAS:
1. Usa EXCLUSIVAMENTE los componentes nativos de Volkern listados abajo.
2. No intentes integrar APIs externas. Si se solicita algo externo, usa un componente de texto que diga "ESPACIO PARA INTEGRACIÓN: [Nombre]".
3. El formato de respuesta debe ser un JSON puro que contenga un array de componentes en la propiedad "pages[0].frames[0].component.components".
4. Usa clases de Tailwind CSS para el estilo de los contenedores básicos.

CATÁLOGO DE BLOQUES VOLKERN:
- 'v-hero-premium': Hero principal.
- 'v-services-section': Lista de servicios.
- 'v-lead-form': Captura de leads.
- 'v-testi-premium': Testimonios.
- 'v-pricing-premium': Precios.
- 'v-faq-premium': FAQ.
- 'v-stats-premium': Estadísticas.
- 'v-footer-premium': Footer.
- 'v-catalog-card': Catálogo/Inmuebles.

Responde SOLO con un objeto JSON válido. NO incluyas explicaciones ni bloques de código markdown.`;

export const POST = withTenantAuth(async (req, auth) => {
  console.log('[Gemini AI] Recibida petición de generación');
  try {
    const body = await req.json();
    const { prompt, style } = body;

    console.log('[Gemini AI] Prompt:', prompt, 'Style:', style);

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt requerido' }, { status: 400 });
    }

    if (!GOOGLE_AI_KEY) {
      console.error('[Gemini AI] ERROR: GOOGLE_AI_KEY no definida');
      return NextResponse.json({ error: 'Google AI Key no configurada en el servidor' }, { status: 500 });
    }

    const userPrompt = `INSTRUCCIONES DE SISTEMA: ${SYSTEM_PROMPT}\n\nSOLICITUD: Genera una landing page para: ${prompt}. Estilo deseado: ${style || 'Profesional'}. Incluye Hero, servicios, testimonios y formulario.`;

    console.log('[Gemini AI] Llamando a Gemini API...');

    let response;
    try {
      response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: userPrompt }]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
            maxOutputTokens: 8192,
          }
        }),
      });
    } catch (fetchError: any) {
      console.error('[Gemini AI] FETCH ERROR:', fetchError);
      return NextResponse.json({ error: 'Error de red al contactar a la IA', details: fetchError.message }, { status: 500 });
    }

    console.log('[Gemini AI] Respuesta recibida, status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Gemini AI] API Error Response:', errorText);
      return NextResponse.json({ error: 'La API de Google devolvió un error', details: errorText }, { status: response.status });
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let projectData;
    try {
      projectData = JSON.parse(content);
    } catch (e) {
      console.error('[Gemini AI] JSON Parse Error:', e, content);
      return NextResponse.json({ error: 'La IA devolvió un JSON inválido' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      projectData
    });

  } catch (error) {
    console.error('[Gemini AI] Error:', error);
    return NextResponse.json({ error: 'Error interno en el generador de IA' }, { status: 500 });
  }
});
