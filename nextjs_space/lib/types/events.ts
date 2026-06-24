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
  DEAL_UPDATED: 'deal_updated',
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

  // RRHH (Fase 3)
  EMPLOYEE_CREATED: 'employee_created',
  EMPLOYEE_UPDATED: 'employee_updated',
  EMPLOYEE_TERMINATED: 'employee_terminated',
  EVALUATION_COMPLETED: 'evaluation_completed',
  EVALUATION_DUE: 'evaluation_due',
  TRAINING_COMPLETED: 'training_completed',
  CERTIFICATION_EXPIRED: 'certification_expired',

  // Finanzas (Fase 3)
  INVOICE_DUE: 'invoice_due',
  INVOICE_OVERDUE: 'invoice_overdue',
  INVOICE_PAID: 'invoice_paid',
  PAYMENT_TO_SUPPLIER: 'payment_to_supplier',
  EXPENSE_SUBMITTED: 'expense_submitted',
  EXPENSE_APPROVED: 'expense_approved',
  PAYROLL_GENERATED: 'payroll_generated',
  BUDGET_ALERT: 'budget_alert',

  // Calidad (Fase 4)
  INSPECTION_COMPLETED: 'inspection_completed',
  INSPECTION_FAILED: 'inspection_failed',
  NON_CONFORMITY_CREATED: 'non_conformity_created',
  NON_CONFORMITY_RESOLVED: 'non_conformity_resolved',
  QUALITY_ALERT: 'quality_alert',
  CALIBRATION_DUE: 'calibration_due',

  // Proyectos (Fase 4)
  MILESTONE_REACHED: 'milestone_reached',
  MILESTONE_DUE: 'milestone_due',
  PROJECT_STARTED: 'project_started',
  PROJECT_COMPLETED: 'project_completed',
  PROJECT_DELAYED: 'project_delayed',
  TASK_ASSIGNED: 'task_assigned',
  PROJECT_TASK_COMPLETED: 'project_task_completed',
  DELIVERABLE_UPLOADED: 'deliverable_uploaded',

  // Genéricos para extensibilidad
  RESOURCE_CREATED: 'resource_created',
  RESOURCE_UPDATED: 'resource_updated',
  RESOURCE_DELETED: 'resource_deleted',
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

export interface DealUpdatedEvent extends BaseEventPayload {
  dealId: string;
  valor?: number;
  etapa?: string;
  titulo?: string;
}

export interface DealWonEvent extends BaseEventPayload {
  dealId: string;
  titulo: string;
  valor: number;
}

export interface DealLostEvent extends BaseEventPayload {
  dealId: string;
  titulo: string;
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

// ============== RRHH (Fase 3) ==============
export interface EmployeeCreatedEvent extends BaseEventPayload {
  employeeId: string;
  employeeNombre: string;
  employeeEmail: string;
  puesto: string;
  departamento?: string;
  fechaIngreso: Date;
}

export interface EmployeeTerminatedEvent extends BaseEventPayload {
  employeeId: string;
  employeeNombre: string;
  motivo: string;
  fechaTerminacion: Date;
}

export interface EvaluationCompletedEvent extends BaseEventPayload {
  evaluationId: string;
  employeeId: string;
  employeeNombre: string;
  puntuacion: number;
  feedback?: string;
}

export interface EvaluationDueEvent extends BaseEventPayload {
  evaluationId: string;
  employeeId: string;
  employeeNombre: string;
  fechaEvaluacion: Date;
  tipo: string;
}

export interface TrainingCompletedEvent extends BaseEventPayload {
  trainingId: string;
  employeeId: string;
  employeeNombre: string;
  cursoNombre: string;
  puntuacion?: number;
  certificadoEmitido: boolean;
}

export interface CertificationExpiredEvent extends BaseEventPayload {
  certificationId: string;
  employeeId: string;
  employeeNombre: string;
  certificacion: string;
  fechaExpiracion: Date;
}

// ============== FINANZAS (Fase 3) ==============
export interface InvoiceDueEvent extends BaseEventPayload {
  invoiceId: string;
  invoiceNumero: string;
  monto: number;
  moneda: string;
  fechaVencimiento: Date;
  clienteNombre?: string;
}

export interface InvoiceOverdueEvent extends BaseEventPayload {
  invoiceId: string;
  invoiceNumero: string;
  monto: number;
  diasRetraso: number;
  clienteNombre?: string;
}

export interface ExpenseSubmittedEvent extends BaseEventPayload {
  expenseId: string;
  employeeId: string;
  employeeNombre: string;
  monto: number;
  categoria: string;
  descripcion: string;
}

export interface ExpenseApprovedEvent extends BaseEventPayload {
  expenseId: string;
  employeeId: string;
  monto: number;
  aprobadoPor: string;
}

export interface PayrollGeneratedEvent extends BaseEventPayload {
  payrollId: string;
  periodo: string;
  totalEmpleados: number;
  montoTotal: number;
}

export interface BudgetAlertEvent extends BaseEventPayload {
  departmentId: string;
  departmentNombre: string;
  presupuestoActual: number;
  presupuestoUsado: number;
  porcentajeUsado: number;
}

// ============== CALIDAD (Fase 4) ==============
export interface InspectionCompletedEvent extends BaseEventPayload {
  inspectionId: string;
  inspectionNumero: string;
  resultado: 'aprobado' | 'rechazado' | 'observacion';
  itemsVerificados: number;
  itemsFallidos: number;
  inspectorId?: string;
}

export interface NonConformityCreatedEvent extends BaseEventPayload {
  nonConformityId: string;
  ncNumero: string;
  tipo: string;
  gravedad: 'baja' | 'media' | 'alta' | 'critica';
  causa: string;
  proyectoId?: string;
  ordenId?: string;
}

export interface QualityAlertEvent extends BaseEventPayload {
  alertType: string;
  mensaje: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  entityId?: string;
  entityType?: string;
}

// ============== PROYECTOS (Fase 4) ==============
export interface MilestoneReachedEvent extends BaseEventPayload {
  milestoneId: string;
  milestoneNombre: string;
  projectId: string;
  projectNombre: string;
  fechaCompletado: Date;
}

export interface MilestoneDueEvent extends BaseEventPayload {
  milestoneId: string;
  milestoneNombre: string;
  projectId: string;
  fechaVencimiento: Date;
  diasRestantes: number;
}

export interface ProjectStartedEvent extends BaseEventPayload {
  projectId: string;
  projectNombre: string;
  fechaInicio: Date;
  fechaFinEstimada: Date;
  managerId?: string;
}

export interface ProjectCompletedEvent extends BaseEventPayload {
  projectId: string;
  projectNombre: string;
  fechaFin: Date;
  presupuestoActual: number;
  presupuestoInicial: number;
}

export interface ProjectDelayedEvent extends BaseEventPayload {
  projectId: string;
  projectNombre: string;
  diasRetraso: number;
  nuevaFechaFin: Date;
  causa: string;
}

export interface TaskCompletedEvent2 extends BaseEventPayload {
  taskId: string;
  taskNombre: string;
  projectId: string;
  completedBy: string;
  tiempoEstimado?: number;
  tiempoReal?: number;
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
  [EVENTS.DEAL_UPDATED]: DealUpdatedEvent;
  [EVENTS.DEAL_STAGE_CHANGED]: DealStageChangedEvent;
  [EVENTS.DEAL_WON]: DealWonEvent;
  [EVENTS.DEAL_LOST]: DealLostEvent;
  [EVENTS.PAYMENT_RECEIVED]: PaymentReceivedEvent;
  [EVENTS.PAYMENT_FAILED]: PaymentFailedEvent;
  [EVENTS.INVOICE_CREATED]: InvoiceCreatedEvent;
  [EVENTS.WORKFLOW_EXECUTED]: any;
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

  // RRHH (Fase 3)
  [EVENTS.EMPLOYEE_CREATED]: EmployeeCreatedEvent;
  [EVENTS.EMPLOYEE_TERMINATED]: EmployeeTerminatedEvent;
  [EVENTS.EVALUATION_COMPLETED]: EvaluationCompletedEvent;
  [EVENTS.EVALUATION_DUE]: EvaluationDueEvent;
  [EVENTS.TRAINING_COMPLETED]: TrainingCompletedEvent;
  [EVENTS.CERTIFICATION_EXPIRED]: CertificationExpiredEvent;

  // Finanzas (Fase 3)
  [EVENTS.INVOICE_DUE]: InvoiceDueEvent;
  [EVENTS.INVOICE_OVERDUE]: InvoiceOverdueEvent;
  [EVENTS.EXPENSE_SUBMITTED]: ExpenseSubmittedEvent;
  [EVENTS.EXPENSE_APPROVED]: ExpenseApprovedEvent;
  [EVENTS.PAYROLL_GENERATED]: PayrollGeneratedEvent;
  [EVENTS.BUDGET_ALERT]: BudgetAlertEvent;

  // Calidad (Fase 4)
  [EVENTS.INSPECTION_COMPLETED]: InspectionCompletedEvent;
  [EVENTS.NON_CONFORMITY_CREATED]: NonConformityCreatedEvent;
  [EVENTS.QUALITY_ALERT]: QualityAlertEvent;

  // Proyectos (Fase 4)
  [EVENTS.MILESTONE_REACHED]: MilestoneReachedEvent;
  [EVENTS.MILESTONE_DUE]: MilestoneDueEvent;
  [EVENTS.PROJECT_STARTED]: ProjectStartedEvent;
  [EVENTS.PROJECT_COMPLETED]: ProjectCompletedEvent;
  [EVENTS.PROJECT_DELAYED]: ProjectDelayedEvent;
  [EVENTS.PROJECT_TASK_COMPLETED]: TaskCompletedEvent2;
};
