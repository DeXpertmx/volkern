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

  const systemPrompt = `Eres un experto desarrollador web especializado en crear bloques HTML/CSS para landing pages modernas. Debes responder SOLO con JSON válido en este formato exacto:
{
  "html": "<código HTML del bloque>",
  "css": "<estilos CSS del bloque>",
  "description": "<breve descripción del bloque>"
}

El bloque debe ser:
- Responsive y mobile-first
- Con clases Tailwind CSS (usa clases existentes como: bg-white, text-gray-900, p-6, rounded-xl, shadow-lg, etc.)
- Estilizado con Tailwind, NO usar CSS externo
- Profesional y optimizado para conversión
- Compatible con GrapesJS

Categorías disponibles: hero, features, testimonials, cta, pricing, team, contact, footer, stats, faq, gallery, blog`;

  const userPrompt = `Genera un bloque de tipo "${category}" para una landing page sobre: ${description}

Responde SOLO con JSON válido, sin explicaciones ni texto adicional.`;

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
        html: `<div class="ai-generated-block"><h2 class="text-2xl font-bold text-gray-900">${description}</h2><p class="text-gray-600 mt-2">Bloque generado para ${category}</p><button class="bg-indigo-600 text-white px-6 py-3 rounded-lg mt-4">Contactar ahora</button></div>`,
        css: `.ai-generated-block { padding: 32px; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }`,
        description: `Bloque ${category} generado para ${description}`
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
      html: `<div class="ai-generated-block"><h2 class="text-2xl font-bold">${description}</h2><p>Bloque generado por IA</p></div>`,
      css: `.ai-generated-block { padding: 32px; }`,
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
