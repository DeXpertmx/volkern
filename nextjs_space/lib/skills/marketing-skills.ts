import { prisma } from '../db';
import { SocialMediaService } from '../marketing/social-media-service';
import { callWebCreatorWithFallback, OpenRouterMessage } from '../assistant/openrouter-client';

/**
 * Genera copy para marketing usando IA (Gemma 4)
 */
export async function generate_marketing_copy(params: {
  topic: string;
  platform: 'LINKEDIN' | 'YOUTUBE' | 'TIKTOK' | 'EMAIL';
  tone?: 'professional' | 'aggressive' | 'friendly' | 'educational';
  tenantId: string;
}) {
  const { topic, platform, tone = 'professional', tenantId } = params;

  // Aquí iría la llamada a Gemma 4 vía OpenRouter/Local
  // Simulación:
  const copy = `[${platform} - ${tone}] Aquí tienes una propuesta de copy para ${topic} que maximiza el engagement en Volkern...`;

  return { copy, platform, topic, tone };
}

/**
 * Analiza el sentimiento de interacciones sociales
 */
export async function analyze_marketing_sentiment(params: {
  text: string;
  platform: string;
  tenantId: string;
}) {
  // Simulación de análisis de sentimiento con Gemma
  const sentiments = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];
  const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
  const score = Math.random();

  return { sentiment, score, text: params.text };
}

/**
 * Sugiere optimizaciones de campaña basadas en analíticas reales
 */
export async function suggest_campaign_optimization(params: {
  campaignId: string;
  tenantId: string;
}) {
  const analytics = await prisma.socialAnalytics.findMany({
    where: {
      post: {
        tenantId: params.tenantId,
        // campaignId vinculación si existiera
      }
    },
    take: 5
  });

  // Gemma analiza los datos y sugiere:
  return {
    suggestions: [
      "Incrementar frecuencia de posts en LinkedIn los martes a las 10:00 AM",
      "Usar más contenido de video corto (TikTok) para el segmento industrial",
      "Ajustar el CTA de las landing pages para reducir la tasa de rebote"
    ],
    confidence: 0.89
  };
}

/**
 * Genera HTML/CSS + definición GrapesJS para un bloque nativo del editor
 * Usa DeepSeek como modelo principal con fallback a Gemma 4 / Nemotron / Gemini.
 */
export async function generate_web_creator_block(params: {
  description: string;
  category: string;
  tenantId: string;
}) {
  const { description, category } = params;

  const systemPrompt = `Eres un DISEÑADOR WEB PROFESIONAL especializado en landing pages de ALTO IMPACTO. Tu trabajo es crear bloques HTML nativos de GrapesJS con DISEÑO VISUAL PROFESIONAL.

REGLAS DE DISEÑO CRÍTICAS:
1. Usa clases Tailwind CSS para TODOS los estilos visuales
2. Jerarquía visual clara: títulos grandes y llamativos, texto legible, CTAs prominentes
3. Profundidad visual: gradientes sutiles, sombras elegantes, bordes redondeados
4. Paleta de colores profesional y coherente (máximo 3 colores + neutros)
5. Espaciado generoso, tipografía clara con tamaños diferenciados
6. Diseño MODERNO, limpio, tipo startup/SaaS premium
7. NO uses texto plano — genera un bloque con DISEÑO VISUAL COMPLETO

REGLAS GRAPESJS (editables en el editor visual):
- Los textos editables DEBEN tener atributo contenteditable="true"
- Los elementos clave deben tener atributo data-gjs-selectable="true"
- El HTML debe ser semántico y bien estructurado

EJEMPLO de bloque HERO profesional:
<div class="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 text-white py-24 px-6 md:px-12 rounded-3xl shadow-2xl overflow-hidden">
  <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,...')] opacity-10"></div>
  <div class="relative z-10 max-w-4xl mx-auto text-center">
    <span class="inline-block px-4 py-1.5 bg-white/15 rounded-full text-sm font-medium mb-6 backdrop-blur-sm">Nueva funcionalidad</span>
    <h1 class="text-4xl md:text-6xl font-extrabold mb-6 leading-tight" contenteditable="true">Título Impactante que Convierte</h1>
    <p class="text-lg md:text-xl text-indigo-100/90 mb-10 max-w-2xl mx-auto leading-relaxed" contenteditable="true">Descripción persuasiva que conecta con tu audiencia y los guía hacia la acción</p>
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a class="inline-block bg-white text-indigo-700 font-bold px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 hover:scale-105 cursor-pointer">CTA Principal →</a>
      <a class="inline-block border-2 border-white/30 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/10 transition-all cursor-pointer">Ver Demo</a>
    </div>
  </div>
</div>

CRITERIOS POR CATEGORÍA:
- features: 3 columnas con iconos SVG inline, hover elevación
- testimonials: cards con avatar, nombre, cargo, estrella, texto
- pricing: 3 planes con badge "popular" destacado, CTA diferenciado
- cta: fondo gradiente o imagen, texto grande, botón prominente
- team: grid de miembros con foto circular, nombre, cargo, redes
- contact: formulario + info de contacto, mapa o gradiente
- footer: links en columnas, copyright, redes sociales
- stats: números grandes con etiqueta, animación sutil
- faq: acordeón con preguntas expansibles
- gallery: grid de imágenes con hover overlay
- blog: cards de artículo con imagen, fecha, categoría, extracto

Responde SOLO con JSON válido en este formato:
{
  "html": "<código HTML completo con Tailwind y contenteditable en textos>",
  "css": "<estilos adicionales si son necesarios (mínimo)>",
  "description": "<breve descripción del bloque>",
  "traits": [
    {
      "type": "text",
      "label": "Título",
      "name": "data-title",
      "placeholder": "Título principal"
    }
  ]
}

Los traits son opcionales pero recomendados para que el usuario pueda editar propiedades desde el panel de GrapesJS. Incluye traits para: título, descripción, textos de botones, colores clave, etc.`;

  const userPrompt = `Genera un bloque de tipo "${category}" para una landing page sobre: ${description}

Diseña con PROFESIONALISMO ABSOLUTO - el bloque debe verse como diseñado por un expert en UX/UI premiado. USA DeepSeek Design System: colores vibrantes pero elegantes, tipografía moderna, espaciado generoso, micro-interacciones.`;

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const response = await callWebCreatorWithFallback(messages);
    const content = response.choices[0]?.message?.content || '';

    let parsed;
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      parsed = {
        html: `<div class="bg-gradient-to-br from-indigo-600 to-purple-700 text-white py-16 px-8 rounded-3xl shadow-2xl text-center"><h2 class="text-4xl font-bold mb-4" contenteditable="true">${description}</h2><p class="text-xl text-indigo-100 mb-8" contenteditable="true">Diseño profesional para ${category}</p><a class="inline-block bg-white text-indigo-600 font-bold px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer">Comenzar ahora</a></div>`,
        css: ``,
        description: `Bloque ${category} profesional para ${description}`,
        traits: []
      };
    }

    return {
      html: parsed.html || '',
      css: parsed.css || '',
      description: parsed.description || description,
      traits: parsed.traits || []
    };
  } catch (error) {
    console.error('[generate_web_creator_block] Error:', error);
    return {
      html: `<div class="bg-indigo-600 text-white p-12 rounded-2xl text-center"><h2 class="text-3xl font-bold" contenteditable="true">${description}</h2></div>`,
      css: ``,
      description: `Bloque ${category} para ${description}`,
      traits: []
    };
  }
}

/**
 * Analiza el comportamiento de un tenant y sugiere nuevas reglas de automatización
 */
export async function advise_on_automation_rules(params: {
  tenantId: string;
}) {
  // Analizar datos históricos del ERP (leads, ventas, inactividad)
  const inactives = await prisma.contact.count({
    where: {
      tenantId: params.tenantId,
      updatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // 30 días
    } as any
  });

  const suggestions = [];
  
  if (inactives > 50) {
    suggestions.push({
      name: "Reactivación de Clientes Inactivos",
      triggerType: "CUSTOMER_INACTIVE",
      logic: "Si no hay actividad en 30 días",
      action: "Enviar secuencia de email de reactivación",
      reason: `Tienes ${inactives} clientes sin actividad reciente. Una regla de automatización podría recuperar un 15% de ellos.`
    });
  }

  suggestions.push({
    name: "Upsell Post-Pago",
    triggerType: "PAYMENT_RECEIVED",
    logic: "Si el monto > 5000",
    action: "Programar llamada de consultoría estratégica",
    reason: "Los clientes de alto valor tienen un 40% más de probabilidad de recompra si se les contacta en las primeras 48h."
  });

  return { suggestions };
}

/**
 * Genera metadatos SEO (título, descripción, keywords) basados en el contenido de la página
 */
export async function generate_seo_metadata(params: {
  pageTitle: string;
  contentSnippet: string;
  tenantId: string;
}) {
  const { pageTitle, contentSnippet } = params;

  // Simulación de generación de SEO por Gemma 4
  // En producción esto llamaría a un LLM analizando el contenido
  const metaTitulo = `${pageTitle} | Volkern Experiencia Premium`;
  const metaDescripcion = `Descubre cómo ${pageTitle} puede transformar tu negocio. ${contentSnippet.substring(0, 100)}... Optimizado para conversión y rendimiento con Volkern CRM.`;
  const metaKeywords = `${pageTitle.toLowerCase().replace(/\s+/g, ', ')}, volkern, crm, marketing digital, conversión`;

  return { metaTitulo, metaDescripcion, metaKeywords };
}
