import { IntentSchema } from './types';

/**
 * Intenciones de Logística: envíos, flota, rutas, almacén y tracking.
 */
export const logisticsIntents: IntentSchema[] = [
  // ========== ENVÍOS ==========
  {
    name: 'estado_envio',
    description: 'Consultar el estado de un envío por número de tracking o referencia',
    requiredParams: ['tracking'],
    optionalParams: [],
    examples: [
      'cuál es el estado del envío con tracking TRK-12345',
      'dame el estado del pedido #PED-001',
      'dónde está el envío ABC-987',
      'consulta el tracking del paquete de Juan Pérez'
    ],
    destructive: false
  },
  {
    name: 'rastrear_pedido',
    description: 'Tracking público de un pedido con timeline de eventos para el cliente',
    requiredParams: ['pedidoId'],
    optionalParams: [],
    examples: [
      'rastrea el pedido #ORD-456',
      'dame el timeline del pedido 789',
      'en qué estado está mi pedido #PED-100',
      'seguimiento del pedido de María García'
    ],
    destructive: false
  },
  {
    name: 'tracking_envio',
    description: 'Consultar el estado y la ubicación de un envío mediante número de tracking o referencia',
    requiredParams: ['tracking'],
    optionalParams: [],
    examples: [
      'dónde está mi envío TRK-998',
      'consultar el tracking del paquete',
      'cuándo llega mi pedido #ENV-550',
      'muéstrame el estado del envío ABC-123',
      'haz seguimiento del envío de Carlos'
    ],
    destructive: false
  },

  // ========== FLOTA ==========
  {
    name: 'salud_flota',
    description: 'Analizar el estado de la flota de vehículos, mantenimientos pendientes e ITVs próximas a vencer',
    requiredParams: [],
    optionalParams: ['vehiculoId'],
    examples: [
      'cómo está la flota de vehículos',
      'qué mantenimientos pendientes hay',
      'dame la salud de la flota',
      'qué vehículos tienen ITV próxima a vencer',
      'estado del vehículo VEH-001'
    ],
    destructive: false
  },
  {
    name: 'estado_flota',
    description: 'Consultar el estado general de la flota: vehículos activos, en mantenimiento, ITV próxima, y posiciones GPS actuales',
    requiredParams: [],
    optionalParams: ['vehiculoId'],
    examples: [
      'cómo está la flota hoy',
      'dame el estado de todos los vehículos',
      'qué camiones están activos',
      'estado de la flota de reparto',
      'qué vehículos tienen mantenimiento pendiente'
    ],
    destructive: false
  },
  {
    name: 'optimizar_ruta',
    description: 'Optimizar ruta de reparto o logística basada en pedidos pendientes y destinos',
    requiredParams: [],
    optionalParams: ['fecha', 'vehiculoId'],
    examples: [
      'optimiza la ruta de reparto para hoy',
      'cómo puedo organizar las entregas de mañana',
      'sugiere la mejor ruta para los pedidos pendientes',
      'optimiza la ruta del vehículo VEH-002'
    ],
    destructive: false
  },

  // ========== ALMACÉN ==========
  {
    name: 'reorganizar_almacen',
    description: 'Sugerir reorganización del almacén basada en rotación de productos y eficiencia de espacio',
    requiredParams: [],
    optionalParams: ['almacenId'],
    examples: [
      'sugiere cómo reorganizar el almacén',
      'cómo puedo optimizar el espacio del almacén',
      'reorganización del almacén principal',
      'dame ideas para mejorar la distribución del almacén'
    ],
    destructive: false
  },
];
