import { IntentSchema } from './types';

/**
 * Intenciones de RRHH: briefing diario, vacaciones y riesgo de rotación.
 */
export const hrIntents: IntentSchema[] = [
  {
    name: 'resumen_rrhh',
    description: 'Obtener el resumen ejecutivo diario de RH (briefing militar)',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'dame el resumen diario de RH',
      'briefing de recursos humanos',
      'cómo está el equipo hoy'
    ],
    destructive: false
  },
  {
    name: 'aprobar_vacaciones',
    description: 'Aprobar solicitud de vacaciones con nota personalizada. El bot localiza la solicitud por número (#123) o por el nombre del empleado; si solo se da el nombre, usa la solicitud pendiente del empleado',
    requiredParams: ['solicitudId'],
    optionalParams: ['nombre', 'nota'],
    examples: [
      'aprueba la solicitud de vacaciones #123',
      'autoriza vacaciones de María con nota: "Disfruta tus días"',
      'confirma la solicitud de vacaciones de Juan Pérez'
    ],
    destructive: false
  },
  {
    name: 'riesgo_rotacion',
    description: 'Analizar riesgo de rotación de talento en el equipo',
    requiredParams: [],
    optionalParams: ['empleadoId'],
    examples: [
      'analiza el riesgo de rotación del equipo',
      'quién tiene riesgo de irse',
      'dame el análisis de retención de talento'
    ],
    destructive: false
  },
];
