import { IntentSchema } from './types';

/**
 * Intenciones de Gobernanza RRHH (Vigésimo-segundo entrenamiento Telegram):
 * autorización masiva de gastos, transferencia de activos, auditoría de
 * accesos digitales y kit de offboarding (kill-switch).
 */
export const hrGovernanceIntents: IntentSchema[] = [
  {
    name: 'autorizar_gastos',
    description: 'Autorizar en bloque todos los gastos pendientes de los empleados (validación VISION-LOCK)',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'autoriza todos los gastos pendientes',
      'aprueba las solicitudes de gasto de los empleados',
      'dale el ok a los gastos pendientes de autorizar',
      'autoriza los gastos de la semana'
    ],
    destructive: false
  },
  {
    name: 'transferir_activo',
    description: 'Transferir o devolver un activo asignado a un empleado (portátil, tablet, herramienta…)',
    requiredParams: ['activo'],
    optionalParams: ['destino', 'accion'],
    examples: [
      'transfiere el portátil de María a Juan',
      'devuelve el activo del técnico',
      'traspasa la tablet de Pedro a Lucía',
      'entrega el móvil corporativo de Ana a Carlos'
    ],
    destructive: false
  },
  {
    name: 'auditar_accesos',
    description: 'Auditoría de seguridad digital: silos de conocimiento, concentración de permisos y accesos críticos',
    requiredParams: [],
    optionalParams: ['empleado'],
    examples: [
      'audita los accesos críticos del sistema',
      'detecta silos de conocimiento',
      'analiza la concentración de permisos',
      'revisa el watchdog de accesos'
    ],
    destructive: false
  },
  {
    name: 'kit_offboarding',
    description: 'Generar el kit de seguridad de baja (kill-switch) de un empleado: roadmap de revocación de accesos',
    requiredParams: ['nombre'],
    optionalParams: [],
    examples: [
      'genera el kit de seguridad de baja de María García',
      'kill-switch para Juan Pérez',
      'kit de offboarding de Carlos Ruiz',
      'prepara el protocolo de baja de Lucía'
    ],
    destructive: false
  },
];
