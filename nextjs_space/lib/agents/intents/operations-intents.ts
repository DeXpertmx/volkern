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
    name: 'actividad_campo',
    description: 'Localizar técnicos y activos en campo mediante geolocalización (VISION-LOCK) y consultar su estado de actividad',
    requiredParams: [],
    optionalParams: ['fecha'],
    examples: [
      'dónde están los técnicos en campo hoy',
      'muéstrame la actividad de campo',
      'localiza a los trabajadores en terreno',
      'qué activos están desplegados'
    ],
    destructive: false
  },
  {
    name: 'auditar_fugas_materiales',
    description: 'Detectar desviaciones, mermas y fugas de materiales cruzando datos de stock contra consumo de producción',
    requiredParams: [],
    optionalParams: ['periodo', 'almacenId'],
    examples: [
      'audita las fugas de materiales',
      'hay mermas sospechosas en el inventario',
      'detecta desviaciones de stock contra producción',
      'revisa si hay robos o fugas de material'
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
import { logisticsIntents } from './logistics-intents';
import { realEstateIntents } from './real-estate-intents';

export const ALL_INTENTS: IntentSchema[] = [
  ...crmIntents,
  ...financeIntents,
  ...erpIntents,
  ...hrIntents,
  ...marketingIntents,
  ...logisticsIntents,
  ...realEstateIntents,
  ...operationsIntents,
];
