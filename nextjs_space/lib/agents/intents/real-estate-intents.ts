import { IntentSchema } from './types';

/**
 * Intenciones de Real Estate / Inmobiliario: descripciones, precios,
 * búsqueda, recomendaciones y comisiones de franquicia.
 */
export const realEstateIntents: IntentSchema[] = [
  // ========== PROPIEDADES ==========
  {
    name: 'generar_descripcion_inmueble',
    description: 'Generar una descripción comercial atractiva para una propiedad usando IA',
    requiredParams: ['propiedadId'],
    optionalParams: ['tono', 'idioma'],
    examples: [
      'genera la descripción de la propiedad #PROP-001',
      'crea una descripción atractiva para el inmueble del centro',
      'escribe la descripción de la casa en venta',
      'redacta la descripción del departamento en la playa'
    ],
    destructive: false
  },
  {
    name: 'sugerir_precio_inmueble',
    description: 'Sugerir precio de venta o alquiler basado en propiedades similares en la misma zona',
    requiredParams: ['propiedadId'],
    optionalParams: ['tipo_operacion'],
    examples: [
      'sugiere un precio para la propiedad #PROP-001',
      'a qué precio debería vender la casa de la colonia Roma',
      'cuánto vale alquilar el departamento del centro',
      'dame una estimación de precio para el inmueble de lujo'
    ],
    destructive: false
  },
  {
    name: 'calificar_inmueble',
    description: 'Calcular un score de calidad (0-100) basado en datos, imágenes y completitud de la propiedad',
    requiredParams: ['propiedadId'],
    optionalParams: [],
    examples: [
      'califica la propiedad #PROP-001',
      'qué score de calidad tiene el inmueble del centro',
      'evalúa la propiedad de la agencia',
      'dame la puntuación del departamento en venta'
    ],
    destructive: false
  },
  {
    name: 'buscar_inmuebles',
    description: 'Buscar propiedades por filtros en lenguaje natural (tipo, operación, zona, precio, características)',
    requiredParams: [],
    optionalParams: ['tipo_operacion', 'tipo_inmueble', 'zona', 'precio_min', 'precio_max', 'habitaciones'],
    examples: [
      'busca inmuebles en venta en Madrid',
      'qué departamentos en alquiler hay en Barcelona',
      'encuentra casas con alberca en la playa',
      'busca propiedades de lujo con más de 3 habitaciones',
      'muéstrame inmuebles disponibles en la zona norte'
    ],
    destructive: false
  },
  {
    name: 'recomendar_inmuebles',
    description: 'Recomendar propiedades basadas en preferencias del cliente o perfil de búsqueda',
    requiredParams: [],
    optionalParams: ['tipo_operacion', 'presupuesto', 'zona', 'preferencias'],
    examples: [
      'recomiéndame propiedades para un inversor con presupuesto de 500k',
      'qué inmuebles le puedo ofrecer a un cliente que busca casa familiar',
      'sugiere propiedades para alguien que quiere alquilar oficina',
      'dame recomendaciones de propiedades para una pareja joven'
    ],
    destructive: false
  },

  // ========== FRANQUICIAS ==========
  {
    name: 'calcular_comision_franquicia',
    description: 'Calcular comisiones de agentes y franquicias con splits (agente/agencia/franquicia)',
    requiredParams: ['propiedadId'],
    optionalParams: ['agenteId', 'precio_venta'],
    examples: [
      'calcula la comisión de la propiedad #PROP-001',
      'cuánto gana el agente por la venta del inmueble',
      'dame el split de comisiones de la franquicia para esta propiedad',
      'calcula las comisiones de la venta del departamento'
    ],
    destructive: false
  },
];
