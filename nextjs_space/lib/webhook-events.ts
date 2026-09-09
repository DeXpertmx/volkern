/**
 * Catálogo de eventos de Webhooks Salientes (Outgoing Webhooks).
 *
 * Módulo PURO (sin imports de servidor/BD): puede importarse tanto desde
 * componentes cliente (UI de Configuración → Webhooks Salientes) como desde
 * código de servidor (lib/outgoing-webhooks.ts, rutas API).
 *
 * Es la ÚNICA fuente de verdad de qué eventos existen. La guardia
 * tests/outgoing-webhook-events-guard.test.ts verifica que:
 *   - el catálogo coincida con el union type WebhookEvent (sin divergencias), y
 *   - todo evento disparado/registrado en el código exista aquí.
 */

// Tipos de eventos soportados
export type WebhookEvent =
  | 'lead_creado'
  | 'lead_actualizado'
  | 'contacto_creado'
  | 'contacto_actualizado'
  | 'cita_creada'
  | 'cita_actualizada'
  | 'cita_cancelada'
  | 'mensaje_recibido'
  | 'mensaje_enviado'
  | 'tarea_creada'
  | 'tarea_completada'
  | 'deal_creado'
  | 'deal_actualizado'
  | 'campana_enviada';

export interface WebhookEventOption {
  value: WebhookEvent;
  label: string;
  description: string;
}

/**
 * Función helper para obtener eventos disponibles
 */
export function getAvailableEvents(): WebhookEventOption[] {
  return [
    {
      value: 'lead_creado',
      label: 'Lead Creado',
      description: 'Cuando se crea un nuevo lead en el CRM',
    },
    {
      value: 'lead_actualizado',
      label: 'Lead Actualizado',
      description: 'Cuando se actualiza la información de un lead',
    },
    {
      value: 'contacto_creado',
      label: 'Contacto Creado',
      description: 'Cuando se crea un nuevo contacto',
    },
    {
      value: 'contacto_actualizado',
      label: 'Contacto Actualizado',
      description: 'Cuando se actualiza un contacto',
    },
    {
      value: 'cita_creada',
      label: 'Cita Creada',
      description: 'Cuando se agenda una nueva cita',
    },
    {
      value: 'cita_actualizada',
      label: 'Cita Actualizada',
      description: 'Cuando se modifica una cita existente',
    },
    {
      value: 'cita_cancelada',
      label: 'Cita Cancelada',
      description: 'Cuando se cancela una cita',
    },
    {
      value: 'mensaje_recibido',
      label: 'Mensaje Recibido',
      description: 'Cuando se recibe un mensaje de un cliente',
    },
    {
      value: 'mensaje_enviado',
      label: 'Mensaje Enviado',
      description: 'Cuando se envía un mensaje a un cliente',
    },
    {
      value: 'tarea_creada',
      label: 'Tarea Creada',
      description: 'Cuando se crea una nueva tarea',
    },
    {
      value: 'tarea_completada',
      label: 'Tarea Completada',
      description: 'Cuando se marca una tarea como completada',
    },
    {
      value: 'deal_creado',
      label: 'Oportunidad Creada',
      description: 'Cuando se crea una nueva oportunidad de venta',
    },
    {
      value: 'deal_actualizado',
      label: 'Oportunidad Actualizada',
      description: 'Cuando se actualiza una oportunidad',
    },
    {
      value: 'campana_enviada',
      label: 'Campaña Enviada',
      description: 'Cuando se completa el envío de una campaña',
    },
  ];
}
