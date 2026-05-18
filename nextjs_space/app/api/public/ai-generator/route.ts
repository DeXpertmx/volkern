export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callMinimaxM25, OpenRouterMessage } from '@/lib/assistant/openrouter-client';

const SYSTEM_PROMPT = `Eres el Estratega de Marca y Arquitecto de Contenidos de Volkern AI. Tu misión es generar una landing page de ALTO IMPACTO que parezca diseñada a medida para CUALQUIER empresa que el usuario mencione.

REGLAS CRÍTICAS DE "MODO CAMALEÓN":
1. IDENTIDAD TOTAL: Si el usuario menciona una empresa (ej. "Zen Yoga", "Abogados Asociados"), la landing debe usar ese nombre en el Hero, Footer y textos. NUNCA uses "Volkern" o textos genéricos como "Redefine tu visión".
2. ELIMINACIÓN DE PLACEHOLDERS: Debes rellenar TODOS los atributos "attributes" (data-*) de los bloques que uses con contenido específico de la industria.
3. ADAPTACIÓN TÉCNICA: Si piden subir archivos, activa "data-with-invoice". Si es un servicio recurrente, ajusta los "Pricing".

CATÁLOGO UNIVERSAL DE ATRIBUTOS (Usa "attributes" en el JSON):

- 'hero-premium': data-title, data-desc, data-btn-1, data-btn-2
- 'features-premium': data-title, data-desc, data-f1-title, data-f2-title...
- 'pricing-premium': data-p1-name, data-p1-price, data-p2-name, data-p2-price, data-p3-name, data-p3-price, data-currency
- 'testimonials-premium': data-main-quote, data-main-author, data-main-job
- 'testimonials-carousel-premium': data-quotes, data-authors (Separar con '|')
- 'gallery-premium': data-title, data-images (Separar con ',')
- 'carousel-premium': data-items (Separar con ',')
- 'volkern-lead-form': data-title, data-subtitle, data-btn-text, data-with-invoice
- 'footer-premium': data-company, data-tagline
- 'tabs-premium': data-tab-names (Línea rápida), data-tab-1, data-tab-2, data-tab-3 (Contenido rico)
- 'progress-premium': data-label, data-value (0-100), data-color
- 'toc-premium': data-title, data-items (Secciones principales)
- 'payment-button-premium': data-provider ('stripe', 'square', 'gocardless'), data-amount, data-currency, data-product
- 'star-rating-premium': data-rating (0-5), data-text
- 'icon-list-premium': data-items (Separar con ','), data-color
- 'image-box-premium': data-img, data-title, data-desc

SELECCIÓN INTELIGENTE:
Elige los bloques que mejor encajen. Una landing estándar suele ser: Hero -> Features -> Pricing/Services -> Testimonials -> Lead Form -> Footer.

ESTRUCTURA JSON:
{
  "pages": [{
    "frames": [{
      "component": {
        "type": "wrapper",
        "components": [
          { 
            "type": "hero-premium", 
            "attributes": { "data-title": "NOMBRE REAL", "data-desc": "VALOR REAL" } 
          },
          ...otros componentes con sus attributes...
        ]
      }
    }]
  }]
}

Responde ÚNICAMENTE con el objeto JSON. Sé un redactor creativo y persuasivo para la marca solicitada.`;

export async function POST(req: Request) {
  console.log('[MiniMax AI] Nueva petición de generación de página');

  // Verificar sesión (sin bloquear totalmente - el middleware ya lo hace para /webcreator)
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { prompt, style } = body;

    console.log('[MiniMax AI] Prompt recibido:', prompt);

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt requerido' }, { status: 400 });
    }

    console.log('[MiniMax AI] Llamando a MiniMax M2.5 via OpenRouter...');

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Genera una landing page para: ${prompt}. Estilo deseado: ${style || 'Profesional y moderno'}. Responde SOLO con el JSON.` }
    ];

    const response = await callMinimaxM25(messages);

    console.log('[MiniMax AI] Respuesta recibida');

    if (!response?.choices?.[0]?.message?.content) {
      console.error('[MiniMax AI] Respuesta vacía o inválida');
      return NextResponse.json({ error: 'MiniMax no devolvió contenido' }, { status: 500 });
    }

    const content = response.choices[0].message.content;

    console.log('[MiniMax AI] Contenido recibido, longitud:', content.length);

    if (!content) {
      return NextResponse.json({ error: 'Gemini no devolvió contenido' }, { status: 500 });
    }

    let projectData;
    try {
      projectData = JSON.parse(content);
    } catch (parseError) {
      console.error('[MiniMax AI] Error parseando JSON:', parseError, '\nContenido:', content.slice(0, 300));
      return NextResponse.json({ error: 'La IA devolvió un JSON inválido' }, { status: 500 });
    }

    console.log('[MiniMax AI] ✅ Página generada correctamente');
    return NextResponse.json({ success: true, projectData });

  } catch (error: any) {
    console.error('[MiniMax AI] Error inesperado:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
