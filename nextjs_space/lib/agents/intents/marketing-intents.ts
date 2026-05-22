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
];
