import { IntentSchema } from './types';

/**
 * Intenciones de Finanzas: facturación Veri*factu, gastos, proveedores,
 * análisis financiero y rentabilidad global.
 */
export const financeIntents: IntentSchema[] = [
  // ========== FACTURACIÓN & VERI*FACTU ==========
  {
    name: 'crear_factura',
    description: 'Generar una factura legal con sello Veri*factu',
    requiredParams: ['leadId'],
    optionalParams: ['monto', 'concepto'],
    examples: [
      'genera una factura para el lead juan@email.com',
      'crea factura para María García por 5000€',
      'factura para Carlos Ruiz por consultoría'
    ],
    destructive: false
  },
  {
    name: 'estado_fiscal',
    description: 'Consultar el estado fiscal e integridad de una factura',
    requiredParams: ['invoiceId'],
    optionalParams: [],
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
    requiredParams: ['invoiceId', 'razon'],
    optionalParams: ['monto'],
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
    name: 'crear_proveedor',
    description: 'Registrar un nuevo proveedor',
    requiredParams: ['nombre'],
    optionalParams: ['email', 'telefono', 'direccion'],
    examples: [
      'registra proveedor: Suministros SA, email ventas@suministros.com',
      'nuevo proveedor: Papelería López',
      'crea proveedor Tecnología Plus SA de CV'
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
];
