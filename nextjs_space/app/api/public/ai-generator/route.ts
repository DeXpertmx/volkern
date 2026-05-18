export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callAssistantWithFallback, OpenRouterMessage } from '@/lib/assistant/openrouter-client';

const SYSTEM_PROMPT = `Eres el Estratega de Marca y Arquitecto de Contenidos de Volkern AI. Tu misión es generar landing pages de ALTO IMPACTO VISUAL que parezca diseñadas por un estudio de UX/UI premium.

REGLAS DE DISEÑO CRÍTICAS (PRIORIDAD ABSOLUTA):
1. IDENTIDAD TOTAL: Si el usuario menciona una empresa, usa ese nombre en TODOS los textos. NUNCA uses "Volkern" o placeholders genéricos.
2. DISEÑO VISUAL PROFESIONAL: Cada bloque debe tener diseño completo con Tailwind CSS (gradientes, sombras, bordes redondeados, iconos SVG)
3. VARIETY: Usa diferentes configuraciones de color para cada sección, no repitas el mismo fondo
4. JERARQUÍA VISUAL: Títulos llamativos (text-4xl, text-5xl), subtítulos claros, CTAs prominentes con hover effects
5. ICONOGRAFÍA: Usa SVG icons inline para features, servicios, beneficios
6. ESPACIO NEGATIVO: Espaciado generoso (py-16, py-20, px-8+) para respiración visual

EJEMPLO de cómo debe verse un HERO profesional:
<div class="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 text-white py-24 px-8 rounded-[2rem] shadow-2xl overflow-hidden">
  <div class="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-400 opacity-20 rounded-full blur-[100px]"></div>
  <div class="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-400 opacity-20 rounded-full blur-[80px]"></div>
  <div class="relative z-10 max-w-5xl mx-auto text-center">
    <span class="inline-block bg-white/20 backdrop-blur text-sm font-semibold px-4 py-2 rounded-full mb-6">✨ Nueva solución</span>
    <h1 class="text-5xl md:text-6xl lg:text-7xl font-extrabold mb-6 leading-tight">Tu Empresa Aquí</h1>
    <p class="text-xl md:text-2xl text-indigo-100 mb-12 max-w-3xl mx-auto">Descripción atractiva que conecta emocionalmente</p>
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <button class="bg-white text-indigo-600 font-bold text-lg px-10 py-5 rounded-2xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all">Comenzar</button>
      <button class="border-2 border-white/50 text-white font-semibold text-lg px-10 py-5 rounded-2xl hover:bg-white/10 transition-all">Ver demo</button>
    </div>
  </div>
</div>

DISEÑOS POR TIPO DE BLOQUE:
- HERO: Gradientes llamativos, sombras grandes, CTAs duales
- FEATURES: Cards con iconos SVG, hover effects sutiles, sombras suaves
- PRICING: Cards destacadas con borde dorado/purple en el plan popular, badges "Popular"
- TESTIMONIALS: Avatars circulares, comillas decorativas, gradiente de fondo sutil
- CTA: Fondo contrastante, botón grande y prominente
- FOOTER: Fondo oscuro, íconos de redes sociales

CATÁLOGO DE ATRIBUTOS para bloques predefinidos:

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

    console.log('[MiniMax AI] Prompt recibido:', prompt, '| Estilo:', style);

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt requerido' }, { status: 400 });
    }

    console.log('[MiniMax AI] Llamando a MiniMax M2.5 via OpenRouter...');

    const styleConfig: Record<string, { primary: string; secondary: string; bg: string; accent: string; name: string }> = {
      moderno: { primary: '#4F46E5', secondary: '#6366F1', bg: 'gradient-to-br from-blue-600 to-indigo-700', accent: '#818CF8', name: 'Moderno y Limpio' },
      elegante: { primary: '#A855F7', secondary: '#C084FC', bg: 'gradient-to-br from-slate-900 via-purple-900 to-slate-900', accent: '#D946EF', name: 'Elegante / Dark Mode' },
      corporativo: { primary: '#1E40AF', secondary: '#3B82F6', bg: 'gradient-to-br from-blue-900 to-blue-800', accent: '#60A5FA', name: 'Corporativo / Seguro' },
      minimalista: { primary: '#0F172A', secondary: '#334155', bg: 'gradient-to-br from-white to-slate-50', accent: '#64748B', name: 'Minimalista' },
    };
    const currentStyle = styleConfig[style?.toLowerCase() || 'moderno'] || styleConfig.moderno;

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + '\n\nESTILO VISUAL OBLIGATORIO: ' + currentStyle.name + '\nColores: Primary=' + currentStyle.primary + ', Secondary=' + currentStyle.secondary + ', Accent=' + currentStyle.accent },
      { role: 'user', content: `Genera una landing page profesional para: ${prompt}. Estilo: ${currentStyle.name}. Colores: primary="${currentStyle.primary}", secondary="${currentStyle.secondary}", accent="${currentStyle.accent}". Responde SOLO con el JSON.` }
    ];

    const response = await callAssistantWithFallback(messages);

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
      console.warn('[MiniMax AI] JSON inválido, intentando reparar...');
      let cleaned = content.trim();
      cleaned = cleaned.replace(/```json\n?/i, '').replace(/```\n?$/i, '').trim();
      if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
        const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (match) cleaned = match[0];
      }
      // Intentar completar strings no cerrados antes de parsing
      cleaned = cleaned.replace(/([{,]\s*"\w+":\s*")([^"]*)$/gm, '$1$2"');
      // Completar arrays u objetos no cerrados
      const openBraces = (cleaned.match(/\{/g) || []).length;
      const closeBraces = (cleaned.match(/\}/g) || []).length;
      const openBrackets = (cleaned.match(/\[/g) || []).length;
      const closeBrackets = (cleaned.match(/\]/g) || []).length;
      cleaned += '}'.repeat(Math.max(0, openBraces - closeBraces)) + ']'.repeat(Math.max(0, openBrackets - closeBrackets));
      
      try {
        projectData = JSON.parse(cleaned);
        console.warn('[MiniMax AI] JSON repairado exitosamente');
      } catch {
        console.warn('[MiniMax AI] Generando landing page profesional automática');
        const pageTitle = prompt.substring(0, 60) || 'Tu Negocio';
        projectData = {
          pages: [{
            frames: [{
              component: {
                type: "wrapper",
                components: [
                  {
                    type: "text",
                    tagName: "div",
                    attributes: { 
                      class: "min-h-screen flex items-center justify-center bg-gradient-to-br " + currentStyle.bg,
                      style: "font-family: system-ui, sans-serif;"
                    },
                        components: [
                          {
                            type: "text",
                            tagName: "div",
                            attributes: { class: "max-w-5xl mx-auto px-6 py-20 text-center" },
                            components: [
                              {
                                type: "text",
                                tagName: "span",
                                attributes: { class: "inline-block bg-white/20 backdrop-blur px-4 py-2 rounded-full text-sm font-semibold text-white mb-6" },
                                content: "✨ Nueva solución revolucionaria"
                              },
                              {
                                type: "heading",
                                tagName: "h1",
                                attributes: { 
                                  class: "text-5xl md:text-6xl lg:text-7xl font-extrabold text-white mb-6 leading-tight",
                                  style: "text-shadow: 0 4px 20px rgba(0,0,0,0.3);"
                                },
                                content: pageTitle
                              },
                              {
                                type: "text",
                                tagName: "p",
                                attributes: { 
                                  class: "text-xl md:text-2xl text-" + (style.bg.includes('white') ? 'gray-700' : 'indigo-100') + " mb-12 max-w-3xl mx-auto leading-relaxed"
                                },
                                content: "Transforma tu negocio con nuestra solución innovadora. Diseñado para profesionales que buscan resultados excepcionales."
                              },
                              {
                                type: "text",
                                tagName: "div",
                                attributes: { class: "flex flex-col sm:flex-row gap-4 justify-center mb-10" },
                                components: [
                                  {
                                    type: "text",
                                    tagName: "button",
                                    attributes: { 
                                      class: "bg-white font-bold text-lg px-10 py-5 rounded-2xl shadow-2xl hover:shadow-3xl hover:-translate-y-1 transition-all duration-300",
                                      style: `border: none; cursor: pointer; color: ${currentStyle.primary};`
                                    },
                                    content: "Comenzar Ahora"
                                  },
                                  {
                                    type: "text",
                                    tagName: "button",
                                    attributes: { 
                                      class: "border-2 border-white/50 text-white font-semibold text-lg px-10 py-5 rounded-2xl hover:bg-white/10 transition-all duration-300",
                                      style: "cursor: pointer;"
                                    },
                                    content: "Ver Demo"
                                  }
                                ]
                              },
                              {
                                type: "text",
                                tagName: "div",
                                attributes: { class: "flex flex-wrap justify-center gap-8 text-white/90" },
                                components: [
                                  { type: "text", tagName: "span", attributes: { class: "flex items-center gap-2" }, content: "✓ Sin riesgo inicial" },
                                  { type: "text", tagName: "span", attributes: { class: "flex items-center gap-2" }, content: "✓ Setup en 5 minutos" },
                                  { type: "text", tagName: "span", attributes: { class: "flex items-center gap-2" }, content: "✓ Soporte 24/7" }
                                ]
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  },
                  {
                    type: "text",
                    tagName: "div",
                    components: [
                      {
                        type: "text",
                        tagName: "section",
                        attributes: { class: "py-20 px-6 bg-gray-50" },
                        components: [
                          {
                            type: "text",
                            tagName: "div",
                            attributes: { class: "max-w-6xl mx-auto" },
                            components: [
                              {
                                type: "text",
                                tagName: "h2",
                                attributes: { class: "text-4xl font-bold text-center text-gray-900 mb-4" },
                                content: "为什么选择我们"
                              },
                              {
                                type: "text",
                                tagName: "p",
                                attributes: { class: "text-center text-gray-600 mb-16 max-w-2xl mx-auto text-lg" },
                                content: "Funciones diseñadas para impulsar tu éxito"
                              },
                              {
                                type: "text",
                                tagName: "div",
                                attributes: { class: "grid md:grid-cols-3 gap-8" },
                                components: [
                                  {
                                    type: "text",
                                    tagName: "div",
                                    attributes: { class: "bg-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-shadow" },
                                    components: [
                                      {
                                        type: "text",
                                        tagName: "div",
                                        attributes: { class: "w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6 text-2xl" },
                                        content: "⚡"
                                      },
                                      {
                                        type: "text",
                                        tagName: "h3",
                                        attributes: { class: "text-xl font-bold text-gray-900 mb-3" },
                                        content: "Rendimiento Excepcional"
                                      },
                                      {
                                        type: "text",
                                        tagName: "p",
                                        attributes: { class: "text-gray-600 leading-relaxed" },
                                        content: "Optimizado para velocidad máxima y eficiencia en cada interacción."
                                      }
                                    ]
                                  },
                                  {
                                    type: "text",
                                    tagName: "div",
                                    attributes: { class: "bg-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-shadow" },
                                    components: [
                                      {
                                        type: "text",
                                        tagName: "div",
                                        attributes: { class: "w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mb-6 text-2xl" },
                                        content: "🔒"
                                      },
                                      {
                                        type: "text",
                                        tagName: "h3",
                                        attributes: { class: "text-xl font-bold text-gray-900 mb-3" },
                                        content: "Seguridad Total"
                                      },
                                      {
                                        type: "text",
                                        tagName: "p",
                                        attributes: { class: "text-gray-600 leading-relaxed" },
                                        content: "Tus datos protegidos con encriptación de grado militar."
                                      }
                                    ]
                                  },
                                  {
                                    type: "text",
                                    tagName: "div",
                                    attributes: { class: "bg-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-shadow" },
                                    components: [
                                      {
                                        type: "text",
                                        tagName: "div",
                                        attributes: { class: "w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-6 text-2xl" },
                                        content: "🚀"
                                      },
                                      {
                                        type: "text",
                                        tagName: "h3",
                                        attributes: { class: "text-xl font-bold text-gray-900 mb-3" },
                                        content: "Escalabilidad Ilimitada"
                                      },
                                      {
                                        type: "text",
                                        tagName: "p",
                                        attributes: { class: "text-gray-600 leading-relaxed" },
                                        content: "Crece sin límites. El sistema se adapta a tu ritmo de crecimiento."
                                      }
                                    ]
                                  }
                                ]
                              }
                            ]
                          }
                        ]
                      },
                      {
                        type: "text",
                        tagName: "section",
                        attributes: { class: `py-20 px-6 bg-gradient-to-br ${currentStyle.bg.replace('from-', 'to-').replace('to-', 'from-' + currentStyle.secondary.replace('#', '') + ' to-').replace('-50', '-700').replace('-100', '-600').replace('-900', '-900')}` },
                        components: [
                          {
                            type: "text",
                            tagName: "div",
                            attributes: { class: "max-w-3xl mx-auto text-center" },
                            components: [
                              {
                                type: "text",
                                tagName: "h2",
                                attributes: { class: "text-4xl md:text-5xl font-bold text-white mb-6" },
                                content: "¿Listo para empezar?"
                              },
                              {
                                type: "text",
                                tagName: "p",
                                attributes: { class: "text-xl text-white/80 mb-10" },
                                content: "Únete a miles de empresas que ya están transformando su negocio."
                              },
                              {
                                type: "text",
                                tagName: "button",
                                attributes: { 
                                  class: "bg-white font-bold text-xl px-12 py-6 rounded-2xl shadow-2xl hover:shadow-3xl hover:-translate-y-1 transition-all",
                                  style: `border: none; cursor: pointer; color: ${currentStyle.primary};`
                                },
                                content: "Solicitar Demo Gratuita"
                              }
                            ]
                          }
                        ]
                      },
                      {
                        type: "text",
                        tagName: "footer",
                        attributes: { class: "bg-gray-900 text-white py-12 px-6" },
                        components: [
                          {
                            type: "text",
                            tagName: "div",
                            attributes: { class: "max-w-6xl mx-auto text-center" },
                            components: [
                              {
                                type: "text",
                                tagName: "p",
                                attributes: { class: "text-gray-400 text-sm" },
                                content: `© ${new Date().getFullYear()} ${pageTitle}. Todos los derechos reservados.`
                              }
                            ]
                          }
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
    }

    console.log('[MiniMax AI] ✅ Página generada correctamente');
    return NextResponse.json({ success: true, projectData });

  } catch (error: any) {
    console.error('[MiniMax AI] Error inesperado:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
