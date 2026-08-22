import { IntentSchema } from './types';

/**
 * Intenciones de Consultas Avanzadas, Web Creator y Training
 * (Vigésimo-tercer entrenamiento Telegram): ficha de negocio/contacto/
 * producto, exportación de catálogo, sugerencia de respuesta al cliente
 * (Training Room) y generación de borrador de landing (Web Creator).
 */
export const advancedConsultIntents: IntentSchema[] = [
  {
    name: 'detalles_negocio',
    description: 'Ver la ficha y el estado de un negocio (deal) concreto: etapa, monto, prioridad y cliente',
    requiredParams: [],
    optionalParams: ['email', 'nombre', 'etapa'],
    examples: [
      'dame los detalles del negocio de María García',
      'cómo va la venta con juan@email.com',
      'en qué etapa está el negocio de la oficina',
      'muéstrame la ficha del deal de Ana',
      'cuánto vale el negocio abierto de Carlos'
    ],
    destructive: false
  },
  {
    name: 'detalles_contacto',
    description: 'Ver la ficha de un contacto concreto del CRM: email, teléfono, cargo y empresa',
    requiredParams: [],
    optionalParams: ['email', 'nombre'],
    examples: [
      'dame los detalles del contacto Laura Gómez',
      'muéstrame la ficha de juan@email.com',
      'qué datos tengo del contacto de la empresa X',
      'ficha completa del contacto Ana Pérez'
    ],
    destructive: false
  },
  {
    name: 'detalles_producto',
    description: 'Ver la ficha de un producto o servicio concreto del catálogo: precio, impuesto y campos personalizados',
    requiredParams: [],
    optionalParams: ['nombre'],
    examples: [
      'dame los detalles del producto Cafetera Pro',
      'muéstrame la ficha del servicio de consultoría',
      'qué precio e impuesto tiene el paquete premium',
      'detalles del artículo Silla Ergonómica'
    ],
    destructive: false
  },
  {
    name: 'exportar_catalogo',
    description: 'Exportar el catálogo completo o filtrado a JSON o CSV con todos los campos',
    requiredParams: [],
    optionalParams: ['formato', 'tipo'],
    examples: [
      'exporta el catálogo en CSV',
      'exporta el catálogo completo en JSON',
      'dame el catálogo de productos en Excel',
      'exporta solo los servicios del catálogo'
    ],
    destructive: false
  },
  {
    name: 'sugerir_respuesta',
    description: 'Sugerir la mejor respuesta para un cliente en el Training Room (rol de cliente simulado)',
    requiredParams: [],
    optionalParams: ['email', 'nombre', 'mensaje'],
    examples: [
      'sugiere una respuesta para el lead María García',
      'qué le respondo a juan@email.com',
      'enséñame cómo responder al cliente de la oficina',
      'sugiere la respuesta al mensaje del cliente Carlos'
    ],
    destructive: false
  },
  {
    name: 'generar_landing',
    description: 'Generar un borrador de landing page en el Web Creator para un lead, listo para editar',
    requiredParams: ['nombre'],
    optionalParams: ['titulo', 'email'],
    examples: [
      'genera una landing para el lead María García',
      'crea un borrador de página de aterrizaje para juan@email.com',
      'haz una landing de bienvenida para el contacto Carlos'
    ],
    destructive: false
  },
];
