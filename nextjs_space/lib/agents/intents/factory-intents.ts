import { IntentSchema } from './types';

/**
 * Intenciones de Fábrica avanzada (Vigésimo entrenamiento):
 * nómina segura, asistencia/anomalías GPS, mantenimiento predictivo,
 * capacidad de planta, simulación de escenarios, readiness de producción,
 * plan de compras, secuenciación y rentabilidad de producción.
 *
 * Todos los skills ya existían en lib/skills/ (sin intent previo): este
 * bloque los hace controlables desde Telegram.
 */
export const factoryIntents: IntentSchema[] = [
  {
    name: 'ejecutar_nomina',
    description: 'Ejecutar la nómina consolidada de un empleado (salario cifrado + gastos validados Veri*factu). Requiere rol OWNER/ADMIN.',
    requiredParams: ['empleado'],
    optionalParams: [],
    examples: [
      'ejecuta la nómina de Juan Pérez',
      'procesa la nómina del empleado María García',
      'dame el resumen de nómina de Carlos Ruiz'
    ],
    destructive: false
  },
  {
    name: 'anomalias_asistencia',
    description: 'Detectar anomalías de asistencia: viajes imposibles (spoofing GPS), marcajes en proximidad entre empleados y revisión de geo-anomalías',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'detecta anomalías de asistencia',
      'hay marcajes sospechosos de GPS',
      'revisa las geo-anomalías de los marcajes'
    ],
    destructive: false
  },
  {
    name: 'predecir_fallo_activo',
    description: 'Predecir probabilidad de fallo de un activo industrial según horas de uso y mantenimientos',
    requiredParams: ['activo'],
    optionalParams: [],
    examples: [
      'predice fallos del activo prensa S1',
      'cuál es el riesgo de fallo de la máquina 3',
      'analiza el mantenimiento predictivo del activo X'
    ],
    destructive: false
  },
  {
    name: 'dashboard_mantenimiento',
    description: 'Obtener el estado de salud de todos los activos industriales (dashboard de mantenimiento)',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'dame el dashboard de mantenimiento',
      'cómo está la salud de los activos',
      'estado del mantenimiento de la planta'
    ],
    destructive: false
  },
  {
    name: 'proyeccion_capacidad',
    description: 'Analizar capacidad de la planta a 7 días: cuellos de botella y riesgos de saturación por línea',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'analiza la capacidad de la planta para los próximos 7 días',
      'hay cuellos de botella en producción',
      'riesgos de saturación de las líneas'
    ],
    destructive: false
  },
  {
    name: 'simular_escenario_produccion',
    description: 'Simular el impacto de añadir unidades extra a una línea de producción en el forecast de capacidad',
    requiredParams: ['unidades'],
    optionalParams: ['linea'],
    examples: [
      'simula añadir 500 unidades a la línea A',
      'qué pasaría si agrego 1000 unidades a la línea 2',
      'simula el escenario de producción con 300 unidades extra'
    ],
    destructive: false
  },
  {
    name: 'readiness_produccion',
    description: 'Analizar readiness de órdenes de producción: órdenes bloqueadas por faltantes de material y cobertura de BOM',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'qué órdenes no están listas para producir',
      'readiness de la producción',
      'órdenes bloqueadas por faltantes de material'
    ],
    destructive: false
  },
  {
    name: 'plan_compras',
    description: 'Generar sugerencias de compra o transferencia de insumos basándose en el plan de producción',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'sugiere el plan de compras de insumos',
      'qué materiales necesito comprar para la producción',
      'plan de aprovisionamiento'
    ],
    destructive: false
  },
  {
    name: 'optimizar_secuenciacion',
    description: 'Analizar el plan de secuenciación activo: solapamientos, conflictos de línea y mejoras de secuencia',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'optimiza la secuenciación de producción',
      'hay conflictos en el plan de secuencia',
      'sugiere mejoras de secuencia del plan activo'
    ],
    destructive: false
  },
  {
    name: 'maximizar_rentabilidad_scheduling',
    description: 'Re-priorizar el scheduling para maximizar el margen financiero adelantando órdenes con mayor margen',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'maximiza la rentabilidad del plan de producción',
      're-prioriza las órdenes por margen',
      'adelanta las órdenes con mejor margen'
    ],
    destructive: false
  },
  {
    name: 'rentabilidad_produccion',
    description: 'Detectar causas de baja rentabilidad en órdenes de producción (mermas, mano de obra, varianza)',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'por qué baja la rentabilidad de producción',
      'órdenes de producción con margen bajo',
      'analiza la rentabilidad de la producción reciente'
    ],
    destructive: false
  },
];