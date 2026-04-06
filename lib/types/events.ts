/**
 * Volkern Event Types
 * Definición de todos los eventos del sistema
 * 
 * Arquitectura:
 * Skill → Core → EventBus → Listeners
 */

// ============== EVENTOS DEL SISTEMA ==============

export const EVENTS = {
  // Contactos
  CONTACT_CREATED: 'contact_created',
  CONTACT_UPDATED: 'contact_updated',
  CONTACT_DELETED: 'contact_deleted',
  
  // Leads
  LEAD_CREATED: 'lead_created',
  LEAD_UPDATED: 'lead_updated',
  LEAD_CONVERTED: 'lead_converted',
  LEAD_QUALIFIED: 'lead_qualified',
  
  // Conversaciones
  CONVERSATION_CREATED: 'conversation_created',
  CONVERSATION_CLOSED: 'conversation_closed',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',
  
  // Tareas
  TASK_CREATED: 'task_created',
  TASK_COMPLETED: 'task_completed',
  TASK_UPDATED: 'task_updated',
  
  // Notas
  NOTE_CREATED: 'note_created',
  
  // Diagnósticos
  DIAGNOSIS_COMPLETED: 'diagnosis_completed',
  
  // Citas
  BOOKING_CREATED: 'booking_created',
  BOOKING_CONFIRMED: 'booking_confirmed',
  BOOKING_CANCELLED: 'booking_cancelled',
  BOOKING_COMPLETED: 'booking_completed',
  
  // Deals
  DEAL_CREATED: 'deal_created',
  DEAL_STAGE_CHANGED: 'deal_stage_changed',
  DEAL_WON: 'deal_won',
  DEAL_LOST: 'deal_lost',
  
  // Pagos
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_FAILED: 'payment_failed',
  
  // n8n / Workflows
  WORKFLOW_EXECUTED: 'workflow_executed',
  WORKFLOW_FAILED: 'workflow_failed',
} as const;

export type EventType = typeof EVENTS[keyof typeof EVENTS];

// ============== PAYLOADS DE EVENTOS ==============

export interface BaseEventPayload {
  tenantId: string;
  userId?: string;
  timestamp: Date;
  source: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

// Contactos
export interface ContactCreatedEvent extends BaseEventPayload {
  contactId: string;
  email: string;
  nombre: string;
  telefono?: string;
  fuente?: string;
}

export interface ContactUpdatedEvent extends BaseEventPayload {
  contactId: string;
  changes: Record<string, { old: unknown; new: unknown }>;
}

// Leads
export interface LeadCreatedEvent extends BaseEventPayload {
  leadId: string;
  email: string;
  nombre: string;
  telefono?: string;
  fuente?: string;
  score?: number;
}

export interface LeadConvertedEvent extends BaseEventPayload {
  leadId: string;
  contactId: string;
  dealId?: string;
}

// Conversaciones
export interface ConversationCreatedEvent extends BaseEventPayload {
  conversationId: string;
  contactoNombre: string;
  canal: string;
  leadId?: string;
}

export interface MessageSentEvent extends BaseEventPayload {
  messageId: string;
  conversationId: string;
  contenido: string;
  content?: string; // Alias
  canal: string;
  messageType?: string;
  destinatario: string;
  leadId?: string;
}

export interface MessageReceivedEvent extends BaseEventPayload {
  messageId: string;
  conversationId: string;
  content: string;
  canal: string;
  metadata?: Record<string, unknown>;
}

// Tareas
export interface TaskCreatedEvent extends BaseEventPayload {
  taskId: string;
  leadId: string;
  titulo: string;
  descripcion?: string;
  tipo: string;
  fechaVencimiento: Date;
  asignadoA?: string;
}

export interface TaskCompletedEvent extends BaseEventPayload {
  taskId: string;
  leadId: string;
  titulo?: string;
  completadoPor?: string;
  completedAt?: Date;
}

// Notas
export interface NoteCreatedEvent extends BaseEventPayload {
  noteId: string;
  leadId: string;
  contenido: string;
}

// Diagnósticos
export interface DiagnosisCompletedEvent extends BaseEventPayload {
  diagnosisId?: string;
  leadId: string;
  contactId?: string;
  resultado?: Record<string, unknown>;
  respuestas?: Record<string, unknown>;
  resumen?: string;
  score?: number;
}

// Citas/Bookings
export interface BookingCreatedEvent extends BaseEventPayload {
  bookingId: string;
  leadId?: string;
  servicioId?: string;
  fechaHora: Date;
  titulo: string;
  googleMeetUrl?: string;
  googleCalendarEventId?: string;
}

export interface BookingConfirmedEvent extends BaseEventPayload {
  bookingId: string;
  leadId?: string;
  googleEventId?: string;
}

// Deals
export interface DealCreatedEvent extends BaseEventPayload {
  dealId: string;
  leadId?: string;
  contactId?: string;
  valor: number;
  etapa: string;
}

export interface DealStageChangedEvent extends BaseEventPayload {
  dealId: string;
  previousStage: string;
  newStage: string;
  valor: number;
}

// Pagos
export interface PaymentReceivedEvent extends BaseEventPayload {
  paymentId: string;
  monto: number;
  moneda: string;
  metodoPago?: string;
  leadId?: string;
  contactId?: string;
  // Alias en inglés para compatibilidad
  amount?: number;
  currency?: string;
}

export interface PaymentFailedEvent extends BaseEventPayload {
  paymentId?: string;
  monto: number;
  moneda?: string;
  error: string;
  leadId?: string;
  contactId?: string;
}

// Workflows
export interface WorkflowExecutedEvent extends BaseEventPayload {
  workflowId: string;
  workflowName?: string;
  templateId?: string;
  executionId: string;
  result?: Record<string, unknown>;
  resultado?: Record<string, unknown>;
}

export interface WorkflowFailedEvent extends BaseEventPayload {
  workflowId: string;
  workflowName?: string;
  templateId?: string;
  executionId?: string;
  error: string;
}

// ============== MAPA DE EVENTOS ==============

export type EventPayloadMap = {
  [EVENTS.CONTACT_CREATED]: ContactCreatedEvent;
  [EVENTS.CONTACT_UPDATED]: ContactUpdatedEvent;
  [EVENTS.LEAD_CREATED]: LeadCreatedEvent;
  [EVENTS.LEAD_CONVERTED]: LeadConvertedEvent;
  [EVENTS.CONVERSATION_CREATED]: ConversationCreatedEvent;
  [EVENTS.MESSAGE_SENT]: MessageSentEvent;
  [EVENTS.MESSAGE_RECEIVED]: MessageReceivedEvent;
  [EVENTS.TASK_CREATED]: TaskCreatedEvent;
  [EVENTS.TASK_COMPLETED]: TaskCompletedEvent;
  [EVENTS.NOTE_CREATED]: NoteCreatedEvent;
  [EVENTS.DIAGNOSIS_COMPLETED]: DiagnosisCompletedEvent;
  [EVENTS.BOOKING_CREATED]: BookingCreatedEvent;
  [EVENTS.BOOKING_CONFIRMED]: BookingConfirmedEvent;
  [EVENTS.BOOKING_CANCELLED]: BookingCreatedEvent;
  [EVENTS.DEAL_CREATED]: DealCreatedEvent;
  [EVENTS.DEAL_STAGE_CHANGED]: DealStageChangedEvent;
  [EVENTS.PAYMENT_RECEIVED]: PaymentReceivedEvent;
  [EVENTS.PAYMENT_FAILED]: PaymentFailedEvent;
  [EVENTS.WORKFLOW_EXECUTED]: WorkflowExecutedEvent;
  [EVENTS.WORKFLOW_FAILED]: WorkflowFailedEvent;
};
