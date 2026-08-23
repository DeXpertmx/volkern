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
    name: 'consumir_inventario',
    description: 'Descontar inventario por consumo de un producto. Si tiene BoM (lista de materiales), descuenta automáticamente los componentes.',
    requiredParams: ['producto', 'cantidad'],
    optionalParams: ['almacenId'],
    examples: [
      'descarga 5 unidades del producto X del inventario',
      'consume 10 unidades del producto Y',
      'registra consumo de 3 unidades del material Z',
      'procesa la salida de 20 unidades del producto del almacén principal'
    ],
    destructive: true
  },
  {
    name: 'watchdog_inventario',
    description: 'Ejecutar el vigilante de inventario para detectar puntos de reorden, alertas de stock bajo y sugerir compras',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'revisa las alertas de inventario',
      'qué productos necesito reponer',
      'ejecuta el watchdog de inventario',
      'hay productos por debajo del punto de reorden'
    ],
    destructive: false
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
    name: 'buscar_catalogo',
    description: 'Buscar en el catálogo de productos/servicios con filtros dinámicos (precio, tipo, ciudad, habitaciones). Ideal para chatbots de inmobiliaria, ecommerce o agencias.',
    requiredParams: [],
    optionalParams: ['query', 'tipo', 'precioMin', 'precioMax', 'categoria', 'ciudad', 'habitaciones'],
    examples: [
      'busca propiedades en Madrid con 3 habitaciones',
      'qué servicios de marketing tienen',
      'muéstrame productos de tipo inmueble por menos de 300000',
      'busca en el catálogo cafeteras',
      'qué apartamentos tienen en Barcelona'
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
  {
    name: 'crear_cotizacion',
    description: 'Crear un borrador de cotización desde un producto o servicio del catálogo, incluyendo periodos recurrentes',
    requiredParams: ['producto', 'months'],
    optionalParams: ['cantidad', 'email', 'nombre', 'clienteEmpresa', 'descuentoPorcentaje'],
    examples: [
      'haz una cotización de Volkern Insurance por 12 meses',
      'cotiza el servicio de implementación durante 3 meses',
      'prepara un presupuesto para Cafetera Pro por 2 unidades'
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
  {
    name: 'verificar_mermas',
    description: 'Auditar mermas de producción con verificación de integridad (Vision-Lock). Requiere evidencia fotográfica y ubicación GPS.',
    requiredParams: ['ordenProduccionId', 'productoId', 'cantidad'],
    optionalParams: ['evidenciaUrl', 'lat', 'lng'],
    examples: [
      'verifica las mermas de la orden de producción #OP-001',
      'audita el desperdicio del producto X, 5 unidades',
      'reporta merma de 3 unidades en la orden #OP-002',
      'registra scrap de producción con evidencia'
    ],
    // Registrar mermas es trazabilidad (crea registro, no borra): la puerta
    // destructiva aplica solo a acciones irreversibles.
    destructive: false
  },
  {
    name: 'registrar_inspeccion_calidad',
    description: 'Registrar una inspección de calidad con firma criptográfica SHA-256 para trazabilidad',
    requiredParams: ['productoId', 'resultado'],
    optionalParams: ['lote', 'inspector', 'notas'],
    examples: [
      'registra inspección de calidad del producto X, resultado aprobado',
      'crea un registro de QC para el lote #L-123, rechazado',
      'inspección de calidad del producto Y, conforme',
      'registra el control de calidad del último lote'
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
