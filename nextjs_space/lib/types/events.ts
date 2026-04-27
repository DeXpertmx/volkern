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
  
  // Pagos e Invoicing
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_FAILED: 'payment_failed',
  INVOICE_CREATED: 'invoice_created',
  
  // n8n / Workflows
  WORKFLOW_EXECUTED: 'workflow_executed',
  WORKFLOW_FAILED: 'workflow_failed',

  // Inventario (Fase 1)
  INVENTORY_LOW_STOCK: 'inventory_low_stock',
  INVENTORY_OUT_OF_STOCK: 'inventory_out_of_stock',
  INVENTORY_RESTOCKED: 'inventory_restocked',

  // Producción (Fase 1)
  PRODUCTION_ORDER_CREATED: 'production_order_created',
  PRODUCTION_ORDER_STARTED: 'production_order_started',
  PRODUCTION_ORDER_COMPLETED: 'production_order_completed',
  PRODUCTION_ORDER_CANCELLED: 'production_order_cancelled',

  // Soporte (Fase 1)
  SUPPORT_TICKET_CREATED: 'support_ticket_created',
  SUPPORT_TICKET_ASSIGNED: 'support_ticket_assigned',
  SUPPORT_TICKET_RESOLVED: 'support_ticket_resolved',
  SUPPORT_SLA_WARNING: 'support_sla_warning',
  SUPPORT_SLA_BREACHED: 'support_sla_breached',

  // Marketing (Fase 2)
  CAMPAIGN_STARTED: 'campaign_started',
  CAMPAIGN_PAUSED: 'campaign_paused',
  CAMPAIGN_COMPLETED: 'campaign_completed',
  EMAIL_OPENED: 'email_opened',
  EMAIL_CLICKED: 'email_clicked',
  EMAIL_BOUNCED: 'email_bounced',
  EMAIL_UNSUBSCRIBED: 'email_unsubscribed',
  LEAD_NURTURING_TRIGGER: 'lead_nurturing_trigger',
  SOCIAL_POST_PUBLISHED: 'social_post_published',
  SOCIAL_POST_SCHEDULED: 'social_post_scheduled',
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

// Invoicing
export interface InvoiceCreatedEvent extends BaseEventPayload {
  invoiceId: string;
  monto: number;
  moneda: string;
  numero: string;
  leadId?: string;
  contactId?: string;
}

// Workflows
export interface WorkflowFailedEvent extends BaseEventPayload {
  workflowId: string;
  workflowName?: string;
  templateId?: string;
  executionId?: string;
  error: string;
}

// ============== INVENTARIO (Fase 1) ==============
export interface InventoryLowStockEvent extends BaseEventPayload {
  itemId: string;
  itemNombre: string;
  itemSku: string;
  cantidadActual: number;
  cantidadMinima: number;
  almacenId?: string;
  almacenNombre?: string;
}

export interface InventoryOutOfStockEvent extends BaseEventPayload {
  itemId: string;
  itemNombre: string;
  itemSku: string;
  cantidadActual: number;
  almacenId?: string;
}

export interface InventoryRestockedEvent extends BaseEventPayload {
  itemId: string;
  itemNombre: string;
  cantidadAnterior: number;
  cantidadNueva: number;
  cantidadAgregada: number;
  almacenId?: string;
}

// ============== PRODUCCIÓN (Fase 1) ==============
export interface ProductionOrderCreatedEvent extends BaseEventPayload {
  orderId: string;
  orderNumber: string;
  productId: string;
  productNombre: string;
  cantidad: number;
  prioridad?: string;
  fechaEstimadaInicio?: Date;
  fechaEstimadaFin?: Date;
  bomId?: string;
}

export interface ProductionOrderCompletedEvent extends BaseEventPayload {
  orderId: string;
  orderNumber: string;
  productId: string;
  cantidadProducida: number;
  cantidadRechazada?: number;
  tiempoTotalHoras?: number;
}

// ============== SOPORTE (Fase 1) ==============
export interface SupportTicketCreatedEvent extends BaseEventPayload {
  ticketId: string;
  ticketNumero: string;
  subject: string;
  prioridad: string;
  categoria?: string;
  clienteId?: string;
  clienteNombre?: string;
  assigneeId?: string;
}

export interface SupportSlaWarningEvent extends BaseEventPayload {
  ticketId: string;
  ticketNumero: string;
  slaDueAt: Date;
  tiempoRestanteMinutos: number;
  prioridad: string;
}

// ============== MARKETING (Fase 2) ==============
export interface CampaignStartedEvent extends BaseEventPayload {
  campaignId: string;
  campaignNombre: string;
  campaignTipo: string;
  destinatariosCount: number;
}

export interface CampaignCompletedEvent extends BaseEventPayload {
  campaignId: string;
  campaignNombre: string;
  enviadosCount: number;
  abiertosCount: number;
  clicksCount: number;
}

export interface EmailOpenedEvent extends BaseEventPayload {
  emailId: string;
  campaignId?: string;
  leadId?: string;
  contactId?: string;
  email: string;
}

export interface EmailClickedEvent extends BaseEventPayload {
  emailId: string;
  campaignId?: string;
  leadId?: string;
  contactId?: string;
  url: string;
}

export interface LeadNurturingTriggerEvent extends BaseEventPayload {
  leadId: string;
  triggerType: string;
  daysInStage: number;
  score: number;
}

export interface SocialPostPublishedEvent extends BaseEventPayload {
  postId: string;
  plataforma: string;
  contenido: string;
  scheduledFor?: Date;
}

export interface SocialPostScheduledEvent extends BaseEventPayload {
  postId: string;
  plataforma: string;
  contenido: string;
  scheduledFor: Date;
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
  [EVENTS.INVOICE_CREATED]: InvoiceCreatedEvent;
  [EVENTS.WORKFLOW_EXECUTED]: WorkflowExecutedEvent;
  [EVENTS.WORKFLOW_FAILED]: WorkflowFailedEvent;

  // Inventario (Fase 1)
  [EVENTS.INVENTORY_LOW_STOCK]: InventoryLowStockEvent;
  [EVENTS.INVENTORY_OUT_OF_STOCK]: InventoryOutOfStockEvent;
  [EVENTS.INVENTORY_RESTOCKED]: InventoryRestockedEvent;

  // Producción (Fase 1)
  [EVENTS.PRODUCTION_ORDER_CREATED]: ProductionOrderCreatedEvent;
  [EVENTS.PRODUCTION_ORDER_COMPLETED]: ProductionOrderCompletedEvent;

  // Soporte (Fase 1)
  [EVENTS.SUPPORT_TICKET_CREATED]: SupportTicketCreatedEvent;
  [EVENTS.SUPPORT_SLA_WARNING]: SupportSlaWarningEvent;

  // Marketing (Fase 2)
  [EVENTS.CAMPAIGN_STARTED]: CampaignStartedEvent;
  [EVENTS.CAMPAIGN_COMPLETED]: CampaignCompletedEvent;
  [EVENTS.EMAIL_OPENED]: EmailOpenedEvent;
  [EVENTS.EMAIL_CLICKED]: EmailClickedEvent;
  [EVENTS.LEAD_NURTURING_TRIGGER]: LeadNurturingTriggerEvent;
  [EVENTS.SOCIAL_POST_PUBLISHED]: SocialPostPublishedEvent;
  [EVENTS.SOCIAL_POST_SCHEDULED]: SocialPostScheduledEvent;
};
