import { IntentSchema } from './types';

/**
 * Intenciones de Operaciones: consulta general, auditoría de integridad.
 */
export const operationsIntents: IntentSchema[] = [
  {
    name: 'auditar_integridad',
    description: 'Auditar integridad financiera, brechas en Veri*factu o anomalías en gastos',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'audita la integridad financiera',
      'hay anomalías en los gastos',
      'verifica la integridad fiscal'
    ],
    destructive: false
  },
  {
    name: 'consulta_general',
    description: 'Consulta general, saludo, ayuda, o conversación no relacionada con CRUD',
    requiredParams: [],
    optionalParams: [],
    examples: [
      'hola, ¿cómo estás?',
      'gracias por tu ayuda',
      'qué puedes hacer?',
      'ayuda',
      'comandos disponibles'
    ],
    destructive: false
  },
];

/**
 * Registry que compila todas las intenciones de todos los dominios.
 */
import { crmIntents } from './crm-intents';
import { financeIntents } from './finance-intents';
import { erpIntents } from './erp-intents';
import { hrIntents } from './hr-intents';
import { marketingIntents } from './marketing-intents';

export const ALL_INTENTS: IntentSchema[] = [
  ...crmIntents,
  ...financeIntents,
  ...erpIntents,
  ...hrIntents,
  ...marketingIntents,
  ...operationsIntents,
];
