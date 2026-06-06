import { IntentSchema } from './types';

/**
 * Intenciones de Marketing: generación de copy, análisis de sentimiento
 * y sugerencias de campañas.
 */
export const marketingIntents: IntentSchema[] = [
  {
    name: 'generar_copy',
    description: 'Generar copy publicitario, contenido social o textos de marketing con IA',
    requiredParams: ['tema'],
    optionalParams: ['tono', 'formato'],
    examples: [
      'genera un copy para una campaña de email sobre nuestro nuevo producto',
      'crea un post para redes sociales promocionando descuento',
      'escribe un texto publicitario para WhatsApp'
    ],
    destructive: false
  },
  {
    name: 'analizar_sentimiento',
    description: 'Analizar sentimiento de feedback social o comentarios de clientes',
    requiredParams: ['texto'],
    optionalParams: [],
    examples: [
      'analiza el sentimiento de este feedback: "El servicio fue excelente"',
      'qué opinan los clientes sobre nosotros',
      'analiza estos comentarios: "Muy mal servicio"'
    ],
    destructive: false
  },
  {
    name: 'sugerir_campania',
    description: 'Sugerir optimizaciones de campaña basadas en datos',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'sugiere mejoras para mi campaña actual',
      'cómo puedo optimizar mis campañas de marketing',
      'dame sugerencias de campaña'
    ],
    destructive: false
  },

  // ========== MARKETING AVANZADO ==========
  {
    name: 'generar_web_block',
    description: 'Generar bloques HTML para landing pages con IA (Web Creator): hero, features, testimonials, CTA, etc.',
    requiredParams: ['tipoBloque', 'producto'],
    optionalParams: ['tono'],
    examples: [
      'genera un bloque hero para la landing de mi producto',
      'crea una sección de testimonios para la web',
      'dame un bloque CTA para promocionar el servicio',
      'genera un bloque de features para el SaaS'
    ],
    destructive: false
  },
  {
    name: 'generar_seo',
    description: 'Generar metadatos SEO (title, description, keywords) para una página usando IA',
    requiredParams: ['tituloPagina'],
    optionalParams: ['contenido', 'palabrasClave'],
    examples: [
      'genera el SEO para la página de servicios',
      'dame metadatos SEO para mi landing de ventas',
      'optimiza el título y descripción para la página de contacto',
      'crea keywords para mi página de producto'
    ],
    destructive: false
  },
  {
    name: 'sugerir_automatizacion',
    description: 'Analizar el tenant y sugerir reglas de automatización de marketing basadas en patrones de uso',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'sugiere reglas de automatización para mi negocio',
      'qué automatizaciones de marketing puedo implementar',
      'dame ideas de reglas automáticas para campañas',
      'cómo puedo automatizar mi marketing'
    ],
    destructive: false
  },
];
