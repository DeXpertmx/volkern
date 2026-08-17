import { IntentSchema } from './types';

/**
 * Intenciones de RRHH/Producción avanzada — Bloque 21 de entrenamiento:
 * gastos de empleados pendientes de autorizar, impacto de vacaciones,
 * detección de cuellos de botella, estrategia de ensamblaje y firma
 * digital de documentos de RRHH.
 *
 * Todos los skills ya existían en lib/skills/ (sin intent previo): este
 * bloque los hace controlables desde Telegram.
 */
export const hrAdvancedIntents: IntentSchema[] = [
  {
    name: 'resumen_gastos_pendientes',
    description: 'Resumen de gastos de empleados pendientes de autorización (monto total, empleados afectados y detalle por solicitud)',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'qué gastos están pendientes de autorizar',
      'resumen de gastos de empleados sin aprobar',
      'cuántos gastos esperan autorización',
      'gastos por aprobar de los empleados'
    ],
    destructive: false
  },
  {
    name: 'impacto_vacaciones',
    description: 'Analizar el impacto de las vacaciones de un empleado: días disponibles, solapamiento con hitos críticos, activos asignados y accesos digitales',
    requiredParams: ['empleado'],
    optionalParams: [],
    examples: [
      'cuál es el impacto de las vacaciones de María García',
      'qué pasa si Carlos Ruiz se va de vacaciones la semana que viene',
      'analiza el impacto de las vacaciones de Juan Pérez',
      'evalúa el riesgo de las vacaciones de Laura Mendoza'
    ],
    destructive: false
  },
  {
    name: 'detectar_cuellos_botella',
    description: 'Detectar cuellos de botella actuales en producción: órdenes en curso con retrasos críticos de más de 24 horas',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'dónde está el cuello de botella en la planta',
      'detecta cuellos de botella actuales',
      'qué líneas tienen retrasos críticos',
      'hay estrangulamientos en producción'
    ],
    destructive: false
  },
  {
    name: 'estrategia_ensamblaje',
    description: 'Obtener la estrategia recomendada de ensamblaje para la línea de producción actual',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'cuál es la mejor estrategia de ensamblaje',
      'cómo optimizar la línea de montaje',
      'recomienda la estrategia de montaje',
      'sugiere cómo mejorar el ensamblaje'
    ],
    destructive: false
  },
  {
    name: 'firma_digital_hr',
    description: 'Firmar y sellar digitalmente un documento de RRHH (aprobación de vacaciones) con el sello del CEO',
    requiredParams: ['empleado'],
    optionalParams: [],
    examples: [
      'firma digitalmente las vacaciones de María García',
      'sella digitalmente las vacaciones de Juan Pérez',
      'firma electrónica de las vacaciones de Pedro Mendoza',
      'genera la aprobación sellada de vacaciones de Laura Díaz'
    ],
    destructive: false
  }
];