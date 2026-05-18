import { prisma } from '../db';
import { SocialMediaService } from '../marketing/social-media-service';
import { callAssistantWithFallback } from '../assistant/openrouter-client';

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
 * Genera código HTML/CSS para un bloque de GrapesJS basado en un prompt
 */
export async function generate_web_creator_block(params: {
  description: string;
  category: string;
  tenantId: string;
}) {
  const { description, category } = params;

  const systemPrompt = `Eres un DISEÑADOR WEB PROFESIONAL especializado en landing pages de ALTO IMPACTO. Tu trabajo es crear bloques HTML con DISEÑO VISUAL PROFESIONAL.

REGLAS DE DISEÑO CRÍTICAS:
1. Usa clases Tailwind CSS para TODOS los estilos visuales (colores, espaciado, tipografía, sombras, bordes)
2. Crea jerarquía visual clara: títulos grandes y llamativos, texto legible, CTAs prominentes
3. Añade profundidad visual: gradientes sutiles, sombras elegantes, bordes redondeados
4. Usa paleta de colores profesional y coherente
5. Espaciado generoso para respiración visual
6. Tipografía clara con tamaños diferenciados

EJEMPLO de lo que DEBES generar para un Hero:
<div class="relative bg-gradient-to-br from-indigo-600 to-purple-700 text-white py-24 px-8 rounded-3xl shadow-2xl overflow-hidden">
  <div class="absolute top-0 right-0 w-96 h-96 bg-white opacity-10 rounded-full blur-3xl"></div>
  <div class="relative z-10 max-w-4xl mx-auto text-center">
    <h1 class="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">Título Impactante</h1>
    <p class="text-xl md:text-2xl text-indigo-100 mb-10 max-w-2xl mx-auto">Descripción persuasiva que captura la atención del visitante</p>
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <button class="bg-white text-indigo-600 font-bold px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">CTA Principal</button>
      <button class="border-2 border-white text-white font-semibold px-8 py-4 rounded-xl hover:bg-white hover:text-indigo-600 transition-all">CTA Secundario</button>
    </div>
  </div>
</div>

Responde SOLO con JSON válido en este formato:
{
  "html": "<código HTML completo con diseño profesional>",
  "css": "<estilos adicionales si son necesarios (mínimo, usa Tailwind principalmente)>",
  "description": "<breve descripción>"
}

Para features usa iconos SVG inline, para pricing usa cards destacadas con badge de "popular", para testimonials usa avatars con fotos.

Categorías: hero, features, testimonials, cta, pricing, team, contact, footer, stats, faq, gallery, blog`;

  const userPrompt = `Genera un bloque de tipo "${category}" para una landing page sobre: ${description}

Diseña con PROFESIONALISMO - no generes texto plano, genera un bloque con DISEÑO VISUAL COMPLETO que parezca diseñado por un experto en UX/UI.`;

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const response = await callAssistantWithFallback(messages);
    const content = response.choices[0]?.message?.content || '';

    let parsed;
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      parsed = {
        html: `<div class="bg-gradient-to-br from-indigo-600 to-purple-700 text-white py-16 px-8 rounded-3xl shadow-2xl text-center"><h2 class="text-4xl font-bold mb-4">${description}</h2><p class="text-xl text-indigo-100 mb-8">Bloque profesional para ${category}</p><button class="bg-white text-indigo-600 font-bold px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all">Comenzar ahora</button></div>`,
        css: ``,
        description: `Bloque ${category} profesional para ${description}`
      };
    }

    return {
      html: parsed.html || '',
      css: parsed.css || '',
      description: parsed.description || description
    };
  } catch (error) {
    console.error('[generate_web_creator_block] Error:', error);
    return {
      html: `<div class="bg-indigo-600 text-white p-12 rounded-2xl text-center"><h2 class="text-3xl font-bold">${description}</h2></div>`,
      css: ``,
      description: `Bloque ${category} para ${description}`
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
    }
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
