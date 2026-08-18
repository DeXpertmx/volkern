/**
 * Lista de triggers válidos del sistema
 */
export const VALID_TRIGGERS = {
  // CRM / Leads
  nuevo_lead: 'Nuevo Lead Creado',
  lead_actualizado: 'Lead Actualizado',
  lead_etiquetado: 'Lead Etiquetado',
  lead_sin_respuesta: 'Lead Sin Respuesta (24h)',

  // Formularios web
  formulario_enviado: 'Formulario Enviado',
  
  // Citas
  cita_agendada: 'Cita Agendada',
  cita_confirmada: 'Cita Confirmada',
  cita_cancelada: 'Cita Cancelada',
  
  // Academia (LMS)
  estudiante_inscrito: 'Estudiante Inscrito',
  estudiante_completa_curso: 'Completa Curso',
  leccion_completada: 'Lección Completada',
  
  // Pagos
  pago_recibido: 'Pago Recibido',
  pago_fallido: 'Pago Fallido',
  
  // Externos / n8n
  webhook_recibido: 'Webhook Recibido',
  n8n_workflow_completado: 'Workflow n8n Completado',
  n8n_workflow_fallido: 'Workflow n8n Fallido',
  evento_externo: 'Evento Externo',
} as const

export type TriggerType = keyof typeof VALID_TRIGGERS
