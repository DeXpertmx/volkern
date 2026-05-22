import { IntentSchema } from './types';

/**
 * Intenciones de ERP: inventario, producción, proyectos y calidad.
 */
export const erpIntents: IntentSchema[] = [
  // ========== INVENTARIO ==========
  {
    name: 'salud_inventario',
    description: 'Consultar la salud del inventario, stock bajo o predicción de rupturas',
    requiredParams: [],
    optionalParams: ['producto'],
    examples: [
      'cómo está el inventario',
      'qué productos tienen stock bajo',
      'salud del inventario del producto X',
      'hay riesgo de ruptura de stock'
    ],
    destructive: false
  },
  {
    name: 'ajustar_stock',
    description: 'Ajustar cantidades de stock (entrada, salida o transferencia)',
    requiredParams: ['producto', 'cantidad'],
    optionalParams: ['tipo'],
    examples: [
      'ajusta el stock del producto X, entrada de 50 unidades',
      'salida de 10 unidades del producto Y',
      'transfiere 20 unidades del producto Z al almacén 2'
    ],
    destructive: true
  },
  {
    name: 'buscar_producto',
    description: 'Buscar productos en el catálogo o inventario',
    requiredParams: [],
    optionalParams: ['producto', 'categoria'],
    examples: [
      'busca el producto X en el catálogo',
      'qué productos hay en la categoría Y',
      'encuentra el ítem Z en el inventario'
    ],
    destructive: false
  },
  {
    name: 'gestionar_catalogo',
    description: 'Exportar catálogo, ver definiciones o ver ítems del catálogo',
    requiredParams: [],
    optionalParams: ['accion'],
    examples: [
      'exporta el catálogo completo',
      'dame las definiciones del catálogo',
      'muéstrame los ítems del catálogo'
    ],
    destructive: false
  },

  // ========== PRODUCCIÓN / CALIDAD ==========
  {
    name: 'calcular_costo_produccion',
    description: 'Calcular costo proyectado de fabricación (BoM + mano de obra)',
    requiredParams: ['productoId'],
    optionalParams: [],
    examples: [
      'calcula el costo de producción del producto X',
      'cuánto cuesta fabricar el producto Y',
      'dame el costo de manufactura del lote Z'
    ],
    destructive: false
  },
  {
    name: 'detectar_anomalias_calidad',
    description: 'Detectar anomalías de calidad cruzando materiales y proveedores',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'detecta anomalías de calidad',
      'hay problemas de calidad con algún proveedor',
      'análisis de calidad del último lote'
    ],
    destructive: false
  },

  // ========== PROYECTOS ==========
  {
    name: 'rentabilidad_proyecto',
    description: 'Calcular la rentabilidad real de un proyecto',
    requiredParams: ['proyectoId'],
    optionalParams: [],
    examples: [
      'cuál es la rentabilidad del proyecto Alpha',
      'dame el profitability del proyecto X',
      'cómo va el proyecto Y financieramente'
    ],
    destructive: false
  },
  {
    name: 'desviaciones_proyecto',
    description: 'Detectar desviaciones presupuestarias o de cronograma en proyectos',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'detecta desviaciones en mis proyectos',
      'hay proyectos con problemas de presupuesto',
      'qué proyectos se están desviando del plan'
    ],
    destructive: false
  },
];
