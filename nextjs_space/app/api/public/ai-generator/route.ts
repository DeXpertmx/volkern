export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callWebCreatorWithFallback, OpenRouterMessage } from '@/lib/assistant/openrouter-client';

const SYSTEM_PROMPT = `Eres el Estratega de Marca y Arquitecto de Contenidos de Volkern AI. Tu misión es generar landing pages de ALTO IMPACTO VISUAL que parezcan diseñadas por un estudio de UX/UI premium.

REGLAS DE DISEÑO CRÍTICAS (PRIORIDAD ABSOLUTA):
1. IDENTIDAD TOTAL: Si el usuario menciona una empresa o proyecto, usa ese nombre en TODOS los textos. NUNCA uses "Volkern" o placeholders genéricos.
2. DISEÑO VISUAL PROFESIONAL: El usuario debe quedar impresionado con la calidad visual. Si piden temas oscuros, usa colores oscuros elegantes (como Slate-900, Zinc-900).
3. USO DE BLOQUES PREMIUM Y COMPONENTES:
   Puedes usar los siguientes tipos de bloques registrados en la plataforma:
   - "hero-premium": Hero banner. Atributos: {"data-title": "Título", "data-desc": "Descripción", "data-btn-1": "Botón 1", "data-btn-2": "Botón 2"}
   - "features-premium": Lista de 3 características. Atributos: {"data-title": "Título Sección", "data-desc": "Descripción Sección", "data-f1-title": "C1 Título", "data-f1-desc": "C1 Desc", "data-f2-title": "C2 Título", "data-f2-desc": "C2 Desc", "data-f3-title": "C3 Título", "data-f3-desc": "C3 Desc"}
   - "volkern-lead-form": Formulario de contacto integrado con CRM. Atributos: {"data-title": "Título Form", "data-subtitle": "Subtítulo Form", "data-btn-text": "Texto Botón"}
   - "testimonials-premium": Sección de testimoniales. Atributos: {"data-main-quote": "Cita principal", "data-main-author": "Autor", "data-main-job": "Cargo", "data-s1-quote": "Cita secundaria", "data-s1-author": "Autor secundario"}
   - "contact-premium": Bloque de contacto con mapa y datos de correo/teléfono. (Sin atributos, usar: {"type": "contact-premium"})
   - "gallery-premium": Galería de imágenes (ideal para fotos de propiedades). (Sin atributos, usar: {"type": "gallery-premium"})
   - "carousel-premium": Carrusel de imágenes deslizable. (Sin atributos, usar: {"type": "carousel-premium"})
   - "faq-premium": Acordeón de preguntas frecuentes. (Sin atributos, usar: {"type": "faq-premium"})
   - "footer-premium": Footer de la página. Atributos: {"data-company": "Empresa", "data-tagline": "Eslogan"}

4. COMPONENTES A MEDIDA (CUSTOM HTML):
   Si necesitas crear una sección que no esté cubierta por los bloques anteriores (por ejemplo, un mapa de Google Maps, una lista de amenidades con iconos, o una sección interactiva personalizada), puedes crear componentes usando etiquetas estándar de HTML como "section", "div", "h2", "p", "iframe", "span".
   Reglas para componentes a medida:
   - NO uses "type": "text" para contenedores (div, section, footer). Solo usa "type": "text" para elementos de texto simples que contengan solo caracteres sin etiquetas hijas.
   - Especifica las clases CSS como un arreglo en la propiedad "classes" (ej: "classes": ["py-16", "bg-slate-900"]).
   - Ejemplo de un mapa interactivo personalizado:
     {
       "tagName": "section",
       "classes": ["py-16", "bg-slate-900"],
       "components": [
         {
           "tagName": "div",
           "classes": ["max-w-6xl", "mx-auto", "text-center"],
           "components": [
             { "tagName": "h2", "classes": ["text-3xl", "font-bold", "text-white", "mb-4"], "content": "Ubicación Privilegiada" },
             { "tagName": "p", "classes": ["text-slate-400", "mb-8"], "content": "Visítanos en el corazón de Tulum." },
             {
               "tagName": "div",
               "classes": ["rounded-2xl", "overflow-hidden", "shadow-xl"],
               "components": [
                 {
                   "tagName": "iframe",
                   "attributes": {
                     "src": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15024.96020584288!2d-87.47702815!3d20.2104392!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8f4f68660e1d532b%3A0x6d3967341071286b!2sTulum%2C%20Q.R.!5e0!3m2!1ses-419!2smx!4v1678912345678!5m2!1ses-419!2smx",
                     "width": "100%",
                     "height": "400",
                     "style": "border:0;"
                   }
                 }
               ]
             }
           ]
         }
       ]
     }

ESTRUCTURA JSON REQUERIDA (Responde ÚNICAMENTE con este formato JSON):
{
  "pages": [{
    "frames": [{
      "component": {
        "type": "wrapper",
        "components": [
          // Arreglo de bloques o componentes a medida
        ]
      }
    }]
  }]
}

Responde ÚNICAMENTE con el objeto JSON válido.`;

export async function POST(req: Request) {
  console.log('[MiniMax AI] Nueva petición de generación de página');

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { prompt, style } = body;

    console.log('[MiniMax AI] Prompt recibido:', prompt, '| Estilo:', style);

    if (!prompt) {
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
      { role: 'user', content: `Genera landing page para: ${prompt}. Estilo: ${currentStyle.name}. Responde SOLO JSON.` }
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

    let projectData: any;
    let parseError: Error | null = null;
    
    try {
      projectData = JSON.parse(content);
    } catch (e) {
      parseError = e as Error;
    }
    
    if (!projectData && parseError) {
      console.warn('[MiniMax AI] JSON inválido, intentando reparar...', parseError.message);
      let cleaned = content.trim();
      cleaned = cleaned.replace(/```json\n?/i, '').replace(/```\n?$/i, '').trim();
      if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
        const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (match) cleaned = match[0];
      }
      
      let fixed = cleaned;
      let isValid = false;
      
      for (let i = fixed.length; i > 0; i--) {
        try {
          const substr = fixed.substring(0, i);
          JSON.parse(substr);
          fixed = substr;
          isValid = true;
          console.log('[MiniMax AI] ✅ JSON reparado usando prefijo válido');
          break;
        } catch {}
      }
      
      if (!isValid) {
        const openBraces = (fixed.match(/\{/g) || []).length;
        const closeBraces = (fixed.match(/\}/g) || []).length;
        const openBrackets = (fixed.match(/\[/g) || []).length;
        const closeBrackets = (fixed.match(/\}/g) || []).length; // error tipográfico original
        
        for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
        for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
        
        const lastCompleteProp = fixed.lastIndexOf(',');
        if (lastCompleteProp > 0) {
          const check = fixed.substring(0, lastCompleteProp);
          try {
            JSON.parse(check);
            fixed = check;
          } catch {}
        }
        
        try {
          projectData = JSON.parse(fixed);
          console.log('[MiniMax AI] ✅ JSON reparado con estrategia de cierre');
        } catch {}
      }
    }

    // Si falló el parsing o no se obtuvo un JSON válido estructurado
    if (!projectData || !projectData.pages) {
      console.warn('[MiniMax AI] Generando landing page profesional automática');
      const pageTitle = prompt.substring(0, 60) || 'Tu Negocio';
      projectData = {
        pages: [{
          frames: [{
            component: {
              type: "wrapper",
              components: [
                {
                  tagName: "div",
                  classes: ["min-h-screen", "bg-slate-950", "text-white"],
                  attributes: { style: "font-family: system-ui, -apple-system, sans-serif;" },
                  components: [
                    {
                      tagName: "header",
                      classes: ["py-6", "px-8", "flex", "justify-between", "items-center", "border-b", "border-slate-800", "bg-slate-900/50", "backdrop-blur-md"],
                      components: [
                        { tagName: "div", classes: ["text-2xl", "font-extrabold", "tracking-wider", "text-transparent", "bg-clip-text", "bg-gradient-to-r", "from-purple-400", "to-indigo-400"], content: pageTitle },
                        { tagName: "button", classes: ["bg-purple-600", "hover:bg-purple-505", "text-white", "font-bold", "px-5", "py-2.5", "rounded-xl", "transition-all"], content: "Contáctanos" }
                      ]
                    },
                    {
                      tagName: "section",
                      classes: ["py-24", "px-6", "text-center", "relative", "overflow-hidden", "bg-gradient-to-b", "from-slate-900", "to-slate-950"],
                      components: [
                        { tagName: "span", classes: ["inline-flex", "items-center", "gap-1.5", "bg-purple-500/10", "border", "border-purple-500/30", "text-purple-400", "text-xs", "font-semibold", "px-4", "py-1.5", "rounded-full", "mb-6"], content: "PROYECTO DE LUJO" },
                        { tagName: "h1", classes: ["text-5xl", "md:text-6xl", "font-extrabold", "tracking-tight", "mb-6", "bg-clip-text", "text-transparent", "bg-gradient-to-r", "from-white", "via-slate-100", "to-slate-400"], content: pageTitle },
                        { tagName: "p", classes: ["text-lg", "md:text-xl", "text-slate-400", "max-w-2xl", "mx-auto", "mb-10", "leading-relaxed"], content: "Un desarrollo inmobiliario exclusivo que redefine el lujo caribeño. Descubre un santuario privado rodeado de selva exótica y playas de arena blanca." },
                        {
                          tagName: "div",
                          classes: ["flex", "flex-wrap", "justify-center", "gap-4"],
                          components: [
                            { tagName: "button", classes: ["bg-purple-600", "hover:bg-purple-500", "text-white", "font-bold", "px-8", "py-4", "rounded-xl", "shadow-lg", "shadow-purple-500/20", "transition-all"], content: "Registrar Interés" },
                            { tagName: "button", classes: ["bg-slate-800", "hover:bg-slate-700", "text-slate-300", "font-semibold", "px-8", "py-4", "rounded-xl", "transition-all"], content: "Ver Galería" }
                          ]
                        }
                      ]
                    },
                    {
                      tagName: "section",
                      classes: ["py-20", "px-6", "bg-slate-900"],
                      components: [
                        {
                          tagName: "div",
                          classes: ["max-w-6xl", "mx-auto"],
                          components: [
                            { tagName: "h2", classes: ["text-3xl", "font-bold", "text-center", "mb-4", "text-white"], content: "Amenidades Exclusivas" },
                            { tagName: "p", classes: ["text-center", "text-slate-400", "mb-12"], content: "Diseñado para brindar el máximo confort y conexión natural." },
                            {
                              tagName: "div",
                              classes: ["grid", "md:grid-cols-3", "gap-8"],
                              components: [
                                {
                                  tagName: "div",
                                  classes: ["bg-slate-955", "p-8", "rounded-2xl", "border", "border-slate-800"],
                                  components: [
                                    { tagName: "h3", classes: ["text-xl", "font-bold", "text-white", "mb-3"], content: "Infinity Pool" },
                                    { tagName: "p", classes: ["text-slate-400", "leading-relaxed"], content: "Vistas panorámicas sobre el dosel de la selva maya." }
                                  ]
                                },
                                {
                                  tagName: "div",
                                  classes: ["bg-slate-955", "p-8", "rounded-2xl", "border", "border-slate-800"],
                                  components: [
                                    { tagName: "h3", classes: ["text-xl", "font-bold", "text-white", "mb-3"], content: "Wellness & Spa" },
                                    { tagName: "p", classes: ["text-slate-400", "leading-relaxed"], content: "Espacios de relajación profunda y terapias ancestrales." }
                                  ]
                                },
                                {
                                  tagName: "div",
                                  classes: ["bg-slate-955", "p-8", "rounded-2xl", "border", "border-slate-800"],
                                  components: [
                                    { tagName: "h3", classes: ["text-xl", "font-bold", "text-white", "mb-3"], content: "Club de Playa" },
                                    { tagName: "p", classes: ["text-slate-400", "leading-relaxed"], content: "Acceso VIP a las playas más cotizadas de Tulum." }
                                  ]
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      tagName: "section",
                      classes: ["py-20", "px-6", "bg-slate-950"],
                      components: [
                        {
                          tagName: "div",
                          classes: ["max-w-5xl", "mx-auto", "text-center"],
                          components: [
                            { tagName: "h2", classes: ["text-3xl", "font-bold", "mb-4"], content: "Ubicación" },
                            { tagName: "p", classes: ["text-slate-400", "mb-8"], content: "Ubicación estratégica en Tulum." },
                            {
                              tagName: "div",
                              classes: ["rounded-2xl", "overflow-hidden", "border", "border-slate-800", "shadow-2xl"],
                              components: [
                                {
                                  tagName: "iframe",
                                  attributes: {
                                    src: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15024.96020584288!2d-87.47702815!3d20.2104392!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8f4f68660e1d532b%3A0x6d3967341071286b!2sTulum%2C%20Q.R.!5e0!3m2!1ses-419!2smx!4v1678912345678!5m2!1ses-419!2smx",
                                    width: "100%",
                                    height: "400",
                                    style: "border:0;"
                                  }
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      tagName: "section",
                      classes: ["py-20", "px-6", "bg-slate-900"],
                      components: [
                        {
                          tagName: "div",
                          classes: ["max-w-md", "mx-auto", "bg-slate-955", "p-8", "rounded-2xl", "border", "border-slate-800"],
                          components: [
                            { tagName: "h3", classes: ["text-2xl", "font-bold", "text-center", "mb-2"], content: "Solicitar Folleto" },
                            { tagName: "p", classes: ["text-slate-400", "text-center", "mb-6", "text-sm"], content: "Recibe lista de precios y planos de distribución." },
                            {
                              tagName: "form",
                              classes: ["flex", "flex-col", "gap-4"],
                              components: [
                                { tagName: "input", attributes: { type: "text", placeholder: "Nombre Completo", class: "w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-white outline-none focus:border-purple-500" } },
                                { tagName: "input", attributes: { type: "email", placeholder: "Correo Electrónico", class: "w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-white outline-none focus:border-purple-500" } },
                                { tagName: "button", classes: ["bg-purple-600", "hover:bg-purple-555", "text-white", "font-bold", "py-3", "rounded-xl", "transition-all"], content: "Recibir Planos" }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      tagName: "footer",
                      classes: ["bg-slate-950", "border-t", "border-slate-800", "py-12", "px-6", "text-center", "text-slate-500"],
                      components: [
                        { tagName: "p", classes: ["text-sm"], content: `© ${new Date().getFullYear()} ${pageTitle}. Todos los derechos reservados.` }
                      ]
                    }
                  ]
                }
              ]
            }
          }]
        }]
      };
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