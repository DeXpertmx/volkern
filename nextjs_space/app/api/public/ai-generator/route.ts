export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callWebCreatorWithFallback, OpenRouterMessage } from '@/lib/assistant/openrouter-client';
import { WEBCREATOR_SYSTEM_PROMPT } from '@/lib/assistant/webcreator-system-prompt';
import {
  cleanWebCreatorPrompt,
  unwrapWebCreatorProject,
  validateAndNormalizeWebCreatorProject,
} from '@/lib/assistant/webcreator-validator';
import { extractJsonFromContent } from '@/lib/assistant/json-extract';

const SYSTEM_PROMPT = WEBCREATOR_SYSTEM_PROMPT;

export async function POST(req: Request) {
  console.log('[MiniMax AI] Nueva petición de generación de página');

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { prompt, style } = body;

    const cleanedPrompt = cleanWebCreatorPrompt(String(prompt || ''));
    console.log('[MiniMax AI] Prompt recibido:', String(prompt).length, 'caracteres; limpio:', cleanedPrompt.length, '| Estilo:', style);

    if (!cleanedPrompt) {
      return NextResponse.json({ error: 'Prompt requerido' }, { status: 400 });
    }

    const styleConfig: Record<string, { primary: string; secondary: string; bg: string; accent: string; name: string }> = {
      moderno: { primary: '#4F46E5', secondary: '#6366F1', bg: 'from-blue-600 to-indigo-700', accent: '#818CF8', name: 'Moderno y Limpio' },
      elegante: { primary: '#A855F7', secondary: '#C084FC', bg: 'from-slate-900 to-slate-800', accent: '#D946EF', name: 'Elegante / Dark Mode' },
      corporativo: { primary: '#1E40AF', secondary: '#3B82F6', bg: 'from-blue-900 to-blue-800', accent: '#60A5FA', name: 'Corporativo / Seguro' },
      minimalista: { primary: '#0F172A', secondary: '#334155', bg: 'from-white to-slate-50', accent: '#64748B', name: 'Minimalista' },
    };
    const currentStyle = styleConfig[style?.toLowerCase() || 'moderno'] || styleConfig.moderno;

    console.log('[MiniMax AI] Llamando a IA...');

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + '\n\nESTILO: ' + currentStyle.name + ' (' + currentStyle.primary + ')' },
      { role: 'user', content: `Genera landing page para: ${cleanedPrompt}. Estilo: ${currentStyle.name}. Responde SOLO JSON.` }
    ];

    const response = await callWebCreatorWithFallback(messages);

    console.log('[MiniMax AI] Respuesta recibida');

    if (!response?.choices?.[0]?.message?.content) {
      return NextResponse.json({ error: 'IA no devolvió contenido' }, { status: 500 });
    }

    const content = response.choices[0].message.content;
    console.log('[MiniMax AI] Contenido recibido, longitud:', content.length);

    if (!content) {
      return NextResponse.json({ error: 'La IA no devolvió contenido' }, { status: 500 });
    }

    // 1. Parseo directo + extracción robusta del JSON (tolera bloques de
    //    código markdown y texto alrededor). NUNCA caer en plantillas
    //    hardcodeadas que ignoren el prompt del usuario.
    let projectData = unwrapWebCreatorProject(extractJsonFromContent(content));

    // 2. Si no se obtuvo un JSON válido, reintentar UNA vez. La causa más
    //    común es la respuesta truncada por el tope de tokens del modelo
    //    (finish_reason 'length'): una página completa supera 8K tokens. Para
    //    el reintento se usa un prompt COMPACTO (no el system prompt gigante,
    //    que consume presupuesto de salida) y se amplía max_tokens a 16K.
    if (!projectData || !projectData.pages) {
      console.warn('[MiniMax AI] JSON inválido. Reintentando con prompt compacto y max_tokens ampliado...');
      const finishedEarly = response.choices?.[0]?.finish_reason === 'length';
      const compactSystem = finishedEarly
        ? 'Eres un diseñador de landing pages premium. Genera el JSON de la página pedida por el usuario de forma CONCISA: cada sección con lo esencial, sin rellenar. Responde ÚNICAMENTE con JSON válido sin markdown ni texto extra.'
        : 'Eres un diseñador de landing pages premium. Genera el JSON de la página pedida por el usuario. Responde ÚNICAMENTE con JSON válido, sin bloques markdown, sin comentarios ni explicaciones.';
      const retryMessages: OpenRouterMessage[] = [
        { role: 'system', content: compactSystem },
        { role: 'user', content: `Genera la landing page para este brief: ${cleanedPrompt}\n\nUsa bloques premium y componentes con clases Tailwind. Estilo: ${currentStyle.name}. Responde SOLO JSON (máximo ~12000 tokens, conciso).` }
      ];
      const retryResponse = await callWebCreatorWithFallback(retryMessages, 16384);
      const retryContent = retryResponse?.choices?.[0]?.message?.content;
      if (retryContent) {
        console.log('[MiniMax AI] Reintento recibido, longitud:', retryContent.length);
        projectData = unwrapWebCreatorProject(extractJsonFromContent(retryContent));
      }
    }

    // 3. Tras los reintentos, si seguimos sin JSON válido y estructurado,
    //    devolver un error claro en lugar de contenido inventado.
    if (!projectData || !projectData.pages || !projectData.pages[0]?.frames?.[0]?.component) {
      console.error('[MiniMax AI] No se obtuvo JSON válido tras los reintentos');
      return NextResponse.json(
        { error: 'La IA no pudo generar la página con contenido válido. Inténtalo de nuevo en unos segundos.' },
        { status: 502 }
      );
    }

    // La IA no tiene la última palabra sobre reglas funcionales y de
    // veracidad. Normalizar antes de devolver el proyecto al editor:
    // formularios CRM, tags HTML válidos y claims prudentes.
    const normalized = validateAndNormalizeWebCreatorProject(projectData);
    projectData = normalized.projectData;
    if (normalized.warnings.length > 0) {
      console.warn('[MiniMax AI] Normalizaciones aplicadas:', normalized.warnings);
    }

    // Inyectar overrides para Dark Mode (Elegante) si corresponde
    if (projectData && style?.toLowerCase() === 'elegante') {
      try {
        const components = projectData?.pages?.[0]?.frames?.[0]?.component?.components;
        if (Array.isArray(components)) {
          const darkStyles = `
            .premium-hero-section { background: #0f172a !important; color: #ffffff !important; }
            .premium-hero-title { color: #ffffff !important; }
            .premium-hero-desc { color: #94a3b8 !important; }
            .premium-features-section { background: #1e293b !important; color: #ffffff !important; }
            .premium-features-badge { background: #334155 !important; color: #c084fc !important; }
            .premium-features-title { color: #ffffff !important; }
            .premium-features-desc { color: #94a3b8 !important; }
            .premium-feature-card { background: #0f172a !important; border-color: #334155 !important; }
            .premium-feature-icon { background: #334155 !important; color: #c084fc !important; }
            .premium-feature-title { color: #ffffff !important; }
            .premium-feature-text { color: #94a3b8 !important; }
            .volkern-lead-section { background: #0f172a !important; }
            .volkern-lead-card { background: #1e293b !important; border-color: #334155 !important; color: #ffffff !important; }
            .volkern-lead-title { color: #ffffff !important; }
            .volkern-lead-subtitle { color: #94a3b8 !important; }
            .volkern-lead-input { background: #0f172a !important; border-color: #334155 !important; color: #ffffff !important; }
            .volkern-lead-btn { background: #a855f7 !important; }
            .volkern-lead-btn:hover { background: #c084fc !important; }
            .premium-contact-section { background: #0f172a !important; }
            .premium-contact-info h2 { color: #ffffff !important; }
            .premium-contact-info > p { color: #94a3b8 !important; }
            .premium-contact-icon { background: #334155 !important; color: #c084fc !important; }
            .premium-contact-label { color: #94a3b8 !important; }
            .premium-contact-val { color: #ffffff !important; }
            .premium-contact-form { background: #1e293b !important; border-color: #334155 !important; }
            .premium-form-label { color: #ffffff !important; }
            .premium-input { background: #0f172a !important; border-color: #334155 !important; color: #ffffff !important; }
            .premium-submit-btn { background: #a855f7 !important; }
            .premium-submit-btn:hover { background: #c084fc !important; }
            .premium-testimonials-section { background: #1e293b !important; color: #ffffff !important; }
            .premium-testimonials-badge { background: #334155 !important; color: #c084fc !important; }
            .premium-testimonials-title { color: #ffffff !important; }
            .premium-testimonial-main { background: #0f172a !important; }
            .premium-testimonial-quote { color: #ffffff !important; }
            .premium-testimonial-author-info h4 { color: #ffffff !important; }
            .premium-testimonial-author-info p { color: #94a3b8 !important; }
            .premium-testimonial-small { background: #0f172a !important; }
            .premium-testimonial-small-quote { color: #94a3b8 !important; }
            .premium-gallery-section { background: #1e293b !important; }
            .premium-gallery-title { color: #ffffff !important; }
            .premium-gallery-item { background: #0f172a !important; border-color: #334155 !important; }
            .premium-carousel-section { background: #1e293b !important; }
            .premium-faq-section { background: #1e293b !important; }
            .premium-faq-badge { background: #334155 !important; color: #c084fc !important; }
            .premium-faq-title { color: #ffffff !important; }
            .premium-faq-desc { color: #94a3b8 !important; }
            .v-faq-item { background: #0f172a !important; border-color: #334155 !important; }
            .v-faq-summary { color: #ffffff !important; }
            .v-faq-icon { color: #c084fc !important; }
            .v-faq-content { color: #94a3b8 !important; }
            .premium-footer-section { background: #0f172a !important; border-top: 1px solid #334155 !important; color: #94a3b8 !important; }
            .premium-footer-company { color: #ffffff !important; }
          `;
          components.unshift({
            tagName: 'style',
            content: darkStyles
          });
        }
      } catch (err) {
        console.error('[MiniMax AI] Error prepending style overrides:', err);
      }
    }
       
    console.log('[MiniMax AI] Pagina generada correctamente');
    return NextResponse.json({ success: true, projectData });

  } catch (error: any) {
    console.error('[MiniMax AI] Error inesperado:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}