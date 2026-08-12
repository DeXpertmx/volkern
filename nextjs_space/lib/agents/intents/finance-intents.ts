import { IntentSchema } from './types';

/**
 * Intenciones de Finanzas: facturación Veri*factu, gastos, proveedores,
 * análisis financiero y rentabilidad global.
 */
export const financeIntents: IntentSchema[] = [
  // ========== FACTURACIÓN & VERI*FACTU ==========
  {
    name: 'crear_factura',
    description: 'Generar una factura legal con sello Veri*factu (requiere cliente —nombre o email— y monto; el wrapper resuelve el lead/contacto y sella la factura)',
    requiredParams: ['cliente', 'monto'],
    optionalParams: ['email', 'nombre', 'concepto', 'descripcion', 'moneda'],
    examples: [
      'genera una factura para el lead juan@email.com',
      'crea factura para María García por 5000€',
      'factura para Carlos Ruiz por consultoría',
      'emite una factura a juan@email.com por 750€ de consultoría'
    ],
    destructive: false
  },
  {
    name: 'cancelar_factura',
    description: 'Anular o cancelar una factura existente (Veri*factu)',
    requiredParams: ['factura'],
    optionalParams: ['motivo'],
    examples: [
      'cancela la factura FAC-001',
      'anula la factura #123',
      'cancelar factura de Juan Pérez, motivo: error en datos'
    ],
    destructive: true
  },
  {
    name: 'estado_fiscal',
    description: 'Consultar el estado fiscal e integridad de una factura',
    requiredParams: ['factura'],
    optionalParams: ['email'],
    examples: [
      'dime el estado fiscal de la factura FAC-001',
      'verifica la integridad de la factura #123',
      'estado de la factura de juan@email.com'
    ],
    destructive: false
  },
  {
    name: 'rectificar_factura',
    description: 'Rectificar o corregir una factura existente (Veri*factu no permite cancelación, solo rectificación)',
    requiredParams: ['factura', 'razon'],
    optionalParams: ['monto', 'motivo'],
    examples: [
      'rectifica la factura FAC-001, el monto correcto es 4500€',
      'corrige la factura #123 por error en el concepto',
      'rectificar factura de juan@email.com, motivo: cálculo incorrecto'
    ],
    destructive: true
  },

  // ========== GASTOS & FINANZAS ==========
  {
    name: 'registrar_gasto',
    description: 'Registrar un gasto o egreso',
    requiredParams: ['monto', 'concepto'],
    optionalParams: ['fecha', 'proveedor', 'email', 'categoria', 'fotoUrl'],
    examples: [
      'registra gasto de 45.90 en comida',
      'nuevo gasto: 120€ de electricidad, proveedor Iberdrola',
      'gasto de 300€ en software, categoría herramientas'
    ],
    destructive: false
  },
  {
    name: 'registrar_gasto_vision',
    description: 'Registrar un gasto mediante procesamiento de imagen/foto del ticket o factura usando IA (Gemma Vision)',
    requiredParams: ['fotoUrl'],
    optionalParams: ['categoria', 'fecha'],
    examples: [
      'registra este ticket de compra',
      'procesa la foto de esta factura',
      'escanea este recibo y regístralo como gasto',
      'digitaliza este ticket de restaurante'
    ],
    destructive: false
  },
  {
    name: 'crear_proveedor',
    description: 'Registrar un nuevo proveedor',
    requiredParams: ['nombre'],
    optionalParams: ['email', 'telefono', 'direccion', 'categoria'],
    examples: [
      'registra proveedor: Suministros SA, email ventas@suministros.com',
      'nuevo proveedor: Papelería López',
      'crea proveedor Tecnología Plus SA de CV'
    ],
    destructive: false
  },
  {
    name: 'listar_proveedores',
    description: 'Listar los proveedores registrados',
    requiredParams: [],
    optionalParams: ['categoria'],
    examples: [
      'lista los proveedores',
      'qué proveedores tengo',
      'muéstrame mis proveedores',
      'proveedores de categoría oficina'
    ],
    destructive: false
  },
  {
    name: 'analizar_gastos',
    description: 'Analizar gastos, burn rate o salud financiera',
    requiredParams: [],
    optionalParams: ['periodo'],
    examples: [
      'cómo vamos de gastos este mes',
      'analiza mi burn rate',
      'dame mi salud financiera',
      'qué gastos hemos tenido'
    ],
    destructive: false
  },
  {
    name: 'proyeccion_financiera',
    description: 'Proyección financiera, EBITDA, flujo de caja o forecast',
    requiredParams: [],
    optionalParams: ['periodo'],
    examples: [
      'cómo se ve el flujo de caja para el próximo mes',
      'pronóstico financiero',
      'proyecta el EBITDA del trimestre'
    ],
    destructive: false
  },
  {
    name: 'proyeccion_impuestos',
    description: 'Proyección fiscal regional (MX, ES, US-LLC). Calcula la provisión de impuestos estimada según la jurisdicción.',
    requiredParams: ['pais'],
    optionalParams: ['periodo'],
    examples: [
      'calcula la provisión de impuestos para España',
      'proyección fiscal de México este trimestre',
      'cuánto debo pagar de impuestos en USA este año',
      'dame la estimación de impuestos para mi LLC'
    ],
    destructive: false
  },
  {
    name: 'analizar_rentabilidad_global',
    description: 'Analizar rentabilidad global: EBITDA, margen real y salud financiera integral',
    requiredParams: [],
    optionalParams: ['periodo'],
    examples: [
      'dame la rentabilidad global del negocio',
      'cómo vamos financieramente en general',
      'analiza el EBITDA del último trimestre',
      'estado de salud financiera integral'
    ],
    destructive: false
  },
  {
    name: 'auditar_integridad_gastos',
    description: 'Auditar la integridad de los gastos registrados: verifica hashes de seguridad, detecta anomalías y discrepancias',
    requiredParams: [],
    optionalParams: ['periodo', 'proveedorId'],
    examples: [
      'audita la integridad de los gastos',
      'hay discrepancias en los gastos de este mes',
      'verifica la integridad de los gastos del proveedor X',
      'revisa si hay gastos duplicados o sospechosos'
    ],
    destructive: false
  },

  // ========== IMPUESTOS & DECLARACIONES (Décimo octavo entrenamiento) ==========
  // Permiten consultar el calendario fiscal y el resumen de cada modelo desde
  // Telegram sin depender del LLM (ruta determinista en el clasificador).
  {
    name: 'impuestos_pendientes',
    description: 'Consultar las declaraciones fiscales pendientes o próximas a vencer (calendario fiscal): modelos 303, 111, 115, 130, 180, 390, 347 y 349',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'qué impuestos tengo que declarar',
      'qué declaraciones vencen pronto',
      'impuestos por pagar este mes',
      'dame mi calendario fiscal'
    ],
    destructive: false
  },
  {
    name: 'resumen_impuesto',
    description: 'Consultar el resumen de un impuesto o modelo fiscal concreto del periodo: IVA/Modelo 303, retenciones IRPF/111, arrendamientos/115, IRPF/130, intracomunitario/349, resumen anual/180, operaciones terceros/347 o IVA anual/390',
    requiredParams: ['modelo'],
    optionalParams: ['trimestre', 'anio'],
    examples: [
      'dame el modelo 303 del tercer trimestre',
      'cuánto IVA tengo que pagar este trimestre',
      'modelo 115 de este trimestre',
      'retenciones de IRPF del segundo trimestre',
      'modelo 180 del 2026'
    ],
    destructive: false
  },
  {
    name: 'marcar_impuesto_presentado',
    description: 'Marcar una declaración fiscal como presentada (cierra los registros del periodo). Requiere el modelo (303, 111, 115, 130, 180, 390, 347, 349)',
    requiredParams: ['modelo'],
    optionalParams: ['trimestre', 'anio'],
    examples: [
      'marca como presentado el modelo 303 del tercer trimestre',
      'presenté el modelo 111 del trimestre',
      'marca presentada la declaración del 115'
    ],
    destructive: false
  },

  // ========== CONTABILIDAD (Décimo noveno entrenamiento) ==========
  {
    name: 'balance_general',
    description: 'Consultar el balance general o de situación (activo, pasivo y patrimonio neto)',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'dame el balance general',
      'cómo está mi balance de situación',
      'dame el balance de la empresa'
    ],
    destructive: false
  },
  {
    name: 'cuenta_resultados',
    description: 'Consultar la cuenta de resultados (PyG): ingresos, gastos y resultado del ejercicio',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'dame la cuenta de resultados',
      'cuánto gané este mes',
      'cuál es el resultado del ejercicio'
    ],
    destructive: false
  },
  {
    name: 'balance_comprobacion',
    description: 'Consultar el balance de comprobación (sumas y saldos de todas las cuentas)',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'dame el balance de comprobación',
      'la comprobación de sumas y saldos',
      'dame el balance de comprobación de la contabilidad'
    ],
    destructive: false
  },
];
