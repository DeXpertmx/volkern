export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callAssistantWithFallback, OpenRouterMessage } from '@/lib/assistant/openrouter-client';

const SYSTEM_PROMPT = `Eres el Estratega de Marca y Arquitecto de Contenidos de Volkern AI. Tu misión es generar landing pages de ALTO IMPACTO VISUAL que parezca diseñadas por un estudio de UX/UI premium.

REGLAS DE DISEÑO CRÍTICAS (PRIORIDAD ABSOLUTA):
1. IDENTIDAD TOTAL: Si el usuario menciona una empresa, usa ese nombre en TODOS los textos. NUNCA uses "Volkern" o placeholders genéricos.
2. DISEÑO VISUAL PROFESIONAL: Cada bloque debe tener diseño completo con Tailwind CSS (gradientes, sombras, bordes redondeados, iconos SVG)
3. JERARQUÍA VISUAL: Títulos llamativos (text-4xl, text-5xl), subtítulos claros, CTAs prominentes con hover effects

EJEMPLO de HERO profesional:
<div class="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 text-white py-24 px-8 rounded-[2rem] shadow-2xl overflow-hidden">
  <div class="relative z-10 max-w-5xl mx-auto text-center">
    <h1 class="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">Tu Empresa Aquí</h1>
    <p class="text-xl text-indigo-100 mb-12 max-w-3xl mx-auto">Descripción atractiva</p>
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <button class="bg-white text-indigo-600 font-bold text-lg px-10 py-5 rounded-2xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all">Comenzar</button>
      <button class="border-2 border-white/50 text-white font-semibold text-lg px-10 py-5 rounded-2xl hover:bg-white/10 transition-all">Ver demo</button>
    </div>
  </div>
</div>

ESTILO VISUAL (usa estos colores según el estilo solicitado):
- moderno: primary=#4F46E5, secondary=#6366F1, bg=from-blue-600 to-indigo-700
- elegante: primary=#A855F7, secondary=#C084FC, bg=from-slate-900 to-slate-800
- corporativo: primary=#1E40AF, secondary=#3B82F6, bg=from-blue-900 to-blue-800
- minimalista: primary=#0F172A, secondary=#334155, bg=from-white to-slate-50

ESTRUCTURA JSON:
{
  "pages": [{
    "frames": [{
      "component": {
        "type": "wrapper",
        "components": [
          { "type": "hero-premium", "attributes": { "data-title": "TÍTULO", "data-desc": "DESCRIPCIÓN", "data-btn-1": "CTA1", "data-btn-2": "CTA2" } },
          { "type": "features-premium", "attributes": { "data-title": "Título", "data-f1-title": "Feature 1", "data-f1-desc": "Descripción", "data-f2-title": "Feature 2", "data-f2-desc": "Descripción", "data-f3-title": "Feature 3", "data-f3-desc": "Descripción" } },
          { "type": "volkern-lead-form", "attributes": { "data-title": "Título", "data-subtitle": "Subtítulo", "data-btn-text": "Enviar" } },
          { "type": "footer-premium", "attributes": { "data-company": "Empresa", "data-tagline": "Tagline" } }
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

    const response = await callAssistantWithFallback(messages);

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
        const closeBrackets = (fixed.match(/\]/g) || []).length;
        
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
      
      if (!projectData) {
        console.warn('[MiniMax AI] Generando landing page profesional automática');
        const pageTitle = prompt.substring(0, 60) || 'Tu Negocio';
        const p = currentStyle.primary;
        const s = currentStyle.secondary;
        const a = currentStyle.accent;
        const bg = currentStyle.bg;
        projectData = {
          pages: [{
            frames: [{
              component: {
                type: "wrapper",
                components: [
                  { type: "text", tagName: "div", attributes: { class: `min-h-screen flex items-center justify-center bg-gradient-to-br ${bg}`, style: "font-family: system-ui, sans-serif;" }, components: [
                    { type: "text", tagName: "div", attributes: { class: "max-w-5xl mx-auto px-6 py-20 text-center" }, components: [
                      { type: "text", tagName: "span", attributes: { class: "inline-block bg-white/20 backdrop-blur px-4 py-2 rounded-full text-sm font-semibold text-white mb-6" }, content: "Nueva solucion" },
                      { type: "text", tagName: "h1", attributes: { class: "text-5xl md:text-6xl lg:text-7xl font-extrabold text-white mb-6 leading-tight", style: "text-shadow: 0 4px 20px rgba(0,0,0,0.3);" }, content: pageTitle },
                      { type: "text", tagName: "p", attributes: { class: "text-xl md:text-2xl text-indigo-100 mb-12 max-w-3xl mx-auto leading-relaxed" }, content: "Transforma tu negocio con nuestra solucion innovadora." },
                      { type: "text", tagName: "div", attributes: { class: "flex flex-col sm:flex-row gap-4 justify-center mb-10" }, components: [
                        { type: "text", tagName: "button", attributes: { class: "bg-white font-bold text-lg px-10 py-5 rounded-2xl shadow-2xl hover:shadow-3xl hover:-translate-y-1 transition-all", style: `border: none; cursor: pointer; color: ${p};` }, content: "Comenzar Ahora" },
                        { type: "text", tagName: "button", attributes: { class: "border-2 border-white/50 text-white font-semibold text-lg px-10 py-5 rounded-2xl hover:bg-white/10 transition-all", style: "cursor: pointer;" }, content: "Ver Demo" }
                      ]},
                      { type: "text", tagName: "div", attributes: { class: "flex flex-wrap justify-center gap-8 text-white/90" }, components: [
                        { type: "text", tagName: "span", attributes: { class: "flex items-center gap-2" }, content: "Sin riesgo inicial" },
                        { type: "text", tagName: "span", attributes: { class: "flex items-center gap-2" }, content: "Setup en 5 minutos" },
                        { type: "text", tagName: "span", attributes: { class: "flex items-center gap-2" }, content: "Soporte 24/7" }
                      ]}
                    ]}
                  ]},
                  { type: "text", tagName: "section", attributes: { class: "py-20 px-6 bg-gray-50" }, components: [
                    { type: "text", tagName: "div", attributes: { class: "max-w-6xl mx-auto" }, components: [
                      { type: "text", tagName: "h2", attributes: { class: "text-4xl font-bold text-center text-gray-900 mb-4" }, content: "Caracteristicas Destacadas" },
                      { type: "text", tagName: "p", attributes: { class: "text-center text-gray-600 mb-16 max-w-2xl mx-auto text-lg" }, content: "Funciones disenadas para impulsar tu exito" },
                      { type: "text", tagName: "div", attributes: { class: "grid md:grid-cols-3 gap-8" }, components: [
                        { type: "text", tagName: "div", attributes: { class: "bg-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-shadow" }, components: [
                          { type: "text", tagName: "div", attributes: { class: "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-2xl", style: `background: ${p}20;` }, content: "Rendimiento" },
                          { type: "text", tagName: "h3", attributes: { class: "text-xl font-bold text-gray-900 mb-3" }, content: "Rendimiento Excepcional" },
                          { type: "text", tagName: "p", attributes: { class: "text-gray-600 leading-relaxed" }, content: "Optimizado para velocidad maxima." }
                        ]},
                        { type: "text", tagName: "div", attributes: { class: "bg-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-shadow" }, components: [
                          { type: "text", tagName: "div", attributes: { class: "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-2xl", style: `background: ${s}20;` }, content: "Seguridad" },
                          { type: "text", tagName: "h3", attributes: { class: "text-xl font-bold text-gray-900 mb-3" }, content: "Seguridad Total" },
                          { type: "text", tagName: "p", attributes: { class: "text-gray-600 leading-relaxed" }, content: "Tus datos protegidos." }
                        ]},
                        { type: "text", tagName: "div", attributes: { class: "bg-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-shadow" }, components: [
                          { type: "text", tagName: "div", attributes: { class: "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-2xl", style: `background: ${a}30;` }, content: "Escala" },
                          { type: "text", tagName: "h3", attributes: { class: "text-xl font-bold text-gray-900 mb-3" }, content: "Escalabilidad Ilimitada" },
                          { type: "text", tagName: "p", attributes: { class: "text-gray-600 leading-relaxed" }, content: "Crece sin limites." }
                        ]}
                      ]}
                    ]}
                  ]},
                  { type: "text", tagName: "section", attributes: { class: "py-20 px-6", style: `background: linear-gradient(135deg, ${p} 0%, ${s} 100%);` }, components: [
                    { type: "text", tagName: "div", attributes: { class: "max-w-3xl mx-auto text-center" }, components: [
                      { type: "text", tagName: "h2", attributes: { class: "text-4xl md:text-5xl font-bold text-white mb-6" }, content: "Listo para empezar?" },
                      { type: "text", tagName: "p", attributes: { class: "text-xl text-white/80 mb-10" }, content: "Unete a miles de empresas." },
                      { type: "text", tagName: "button", attributes: { class: "bg-white font-bold text-xl px-12 py-6 rounded-2xl shadow-2xl hover:shadow-3xl hover:-translate-y-1 transition-all", style: `border: none; cursor: pointer; color: ${p};` }, content: "Solicitar Demo Gratuita" }
                    ]}
                  ]},
                  { type: "text", tagName: "footer", attributes: { class: "bg-gray-900 text-white py-12 px-6" }, components: [
                    { type: "text", tagName: "div", attributes: { class: "max-w-6xl mx-auto text-center" }, components: [
                      { type: "text", tagName: "p", attributes: { class: "text-gray-400 text-sm" }, content: `${new Date().getFullYear()} ${pageTitle}. Todos los derechos reservados.` }
                    ]}
                  ]}
                ]
              }
            }]
          }]
        };
      }
    }
       
    console.log('[MiniMax AI] Pagina generada correctamente');
    return NextResponse.json({ success: true, projectData });

  } catch (error: any) {
    console.error('[MiniMax AI] Error inesperado:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}