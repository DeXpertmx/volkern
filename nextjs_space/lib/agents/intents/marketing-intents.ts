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

  // ========== ADS SCHEDULES ==========
  {
    name: 'programar_campania',
    description: 'Crear o modificar programación horaria para activar/pausar campañas publicitarias',
    requiredParams: ['campania', 'accion'],
    optionalParams: ['dias', 'horaInicio', 'horaFin', 'zonaHoraria'],
    examples: [
      'programa mi campaña de Meta para que se active en horario laboral',
      'pausa mi campaña de Google Ads los fines de semana',
      'activa la campaña de verano solo de lunes a viernes de 9 a 18',
      'programa la campaña de Facebook para que se pause por la noche'
    ],
    destructive: false
  },
  {
    name: 'listar_horarios',
    description: 'Listar todas las programaciones activas de campañas',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'muéstrame las programaciones activas',
      'qué campañas tienen horarios programados',
      'lista las programaciones de mis campañas'
    ],
    destructive: false
  },
  {
    name: 'eliminar_horario',
    description: 'Eliminar una programación horaria de campaña',
    requiredParams: ['programacion'],
    optionalParams: [],
    examples: [
      'elimina la programación de la campaña de verano',
      'borra el horario de la campaña de Meta',
      'cancela la programación nocturna'
    ],
    destructive: true
  },

  // ========== ADS A/B TESTS ==========
  {
    name: 'crear_test_ab',
    description: 'Crear un test A/B para campañas publicitarias con variantes',
    requiredParams: ['campania', 'nombre'],
    optionalParams: ['metrica', 'variantes', 'autoDeclarar'],
    examples: [
      'crea un test A/B para la campaña de verano',
      'quiero hacer un test A/B en mi campaña de Facebook',
      'crea un test con dos variantes para la campaña de Google Ads',
      'configura un test A/B que declare ganador automáticamente'
    ],
    destructive: false
  },
  {
    name: 'iniciar_test_ab',
    description: 'Iniciar un test A/B en estado borrador',
    requiredParams: ['test'],
    optionalParams: [],
    examples: [
      'inicia el test A/B de la campaña de verano',
      'activa el test A/B que creé',
      'pon en marcha el test de la campaña de Facebook'
    ],
    destructive: false
  },
  {
    name: 'evaluar_test_ab',
    description: 'Calcular significancia estadística de un test A/B',
    requiredParams: ['test'],
    optionalParams: [],
    examples: [
      'cómo va el test A/B de la campaña de productos',
      'dame la significancia del test de la campaña de verano',
      'qué variante va ganando en mi test A/B',
      'el test A/B ya tiene significancia estadística?'
    ],
    destructive: false
  },
  {
    name: 'declarar_ganador',
    description: 'Declarar un ganador en un test A/B (opcional: especificar variante)',
    requiredParams: ['test'],
    optionalParams: ['variante'],
    examples: [
      'declara ganador el test A/B de la campaña de verano',
      'qué variante ganó el test? declárala ganadora',
      'declara ganadora la variante B del test de Facebook'
    ],
    destructive: true
  },
];
