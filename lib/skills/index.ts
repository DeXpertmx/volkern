/**
 * Volkern Skills Registry
 * Punto de entrada para todos los skills del sistema
 * 
 * Arquitectura:
 * App/Agent/Automation → Skills → Core → EventBus
 * 
 * Uso:
 * import { skills } from '@/lib/skills';
 * await skills.create_contact(payload);
 * 
 * Para MCP/Agentes:
 * await skills[skillName](payload);
 */

// ============== IMPORTS ==============

import * as contactSkills from './contact-skills';
import * as conversationSkills from './conversation-skills';
import * as taskSkills from './task-skills';
import * as diagnosisSkills from './diagnosis-skills';
import * as bookingSkills from './booking-skills';
import * as catalogSkills from './catalog-skills';
import * as chatbotSkills from './chatbot-skill';
import * as chatwootSyncSkills from './chatwoot-sync-skill';
import { eventBus, EVENTS } from './event-bus';

// ============== SKILL REGISTRY ==============

/**
 * Registry de todos los skills disponibles
 * Permite invocación dinámica desde MCP/Agentes
 */
// Wrappers para funciones con argumentos posicionales
const findContactByEmailWrapper = (input: { email: string; tenantId: string }) => 
  contactSkills.findContactByEmail(input.email, input.tenantId);

const findLeadByEmailWrapper = (input: { email: string; tenantId: string }) => 
  contactSkills.findLeadByEmail(input.email, input.tenantId);

const getConversationWrapper = (input: { conversationId: string; tenantId: string }) => 
  conversationSkills.getConversation(input.conversationId, input.tenantId);

const getTasksByLeadWrapper = (input: { leadId: string; tenantId: string }) => 
  taskSkills.getTasksByLead(input.leadId, input.tenantId);

const getPendingTasksWrapper = (input: { userId: string; tenantId: string }) => 
  taskSkills.getPendingTasksByUser(input.userId, input.tenantId);

const getNotesByLeadWrapper = (input: { leadId: string }) => 
  taskSkills.getNotesByLead(input.leadId);

const getDiagnosisByLeadWrapper = (input: { leadId: string; tenantId: string }) => 
  diagnosisSkills.getDiagnosisByLead(input.leadId, input.tenantId);

const getBookingsByLeadWrapper = (input: { leadId: string; tenantId: string }) => 
  bookingSkills.getBookingsByLead(input.leadId, input.tenantId);

const getUpcomingBookingsWrapper = (input: { tenantId: string; limit?: number }) => 
  bookingSkills.getUpcomingBookings(input.tenantId, input.limit);

export const skills = {
  // Contactos
  create_contact: contactSkills.createContact,
  update_contact: contactSkills.updateContact,
  get_contact: contactSkills.getContact,
  find_contact_by_email: findContactByEmailWrapper,
  
  // Leads
  create_lead: contactSkills.createLead,
  get_lead: contactSkills.getLead,
  find_lead_by_email: findLeadByEmailWrapper,
  convert_lead: contactSkills.convertLead,
  
  // Conversaciones
  create_conversation: conversationSkills.createConversation,
  get_conversation: getConversationWrapper,
  get_or_create_conversation: conversationSkills.getOrCreateConversation,
  send_message: conversationSkills.sendMessage,
  close_conversation: conversationSkills.closeConversation,
  
  // Tareas
  create_task: taskSkills.createTask,
  complete_task: taskSkills.completeTask,
  get_tasks_by_lead: getTasksByLeadWrapper,
  get_pending_tasks: getPendingTasksWrapper,
  
  // Notas
  create_note: taskSkills.createNote,
  get_notes_by_lead: getNotesByLeadWrapper,
  
  // Diagnósticos (skill compuesto)
  complete_diagnosis: diagnosisSkills.completeDiagnosis,
  get_diagnosis_by_lead: getDiagnosisByLeadWrapper,
  
  // Bookings/Citas (skill compuesto)
  create_booking: bookingSkills.createBooking,
  confirm_booking: bookingSkills.confirmBooking,
  cancel_booking: bookingSkills.cancelBooking,
  get_bookings_by_lead: getBookingsByLeadWrapper,
  get_upcoming_bookings: getUpcomingBookingsWrapper,
  
  // Catálogo
  export_catalog: catalogSkills.exportCatalog,
  get_catalog_field_definitions: catalogSkills.getFieldDefinitions,
  get_catalog_item: catalogSkills.getCatalogItem,
  search_catalog: catalogSkills.searchCatalog,
  
  // AI & Chatbot
  execute_chatbot_response: chatbotSkills.executeChatbotResponse,
  
  // Sincronización Chatwoot
  sync_chatwoot_incoming: chatwootSyncSkills.syncIncomingChatwootMessage,
  sync_chatwoot_outgoing: chatwootSyncSkills.syncOutgoingChatwootMessage,
} as const;

export type SkillName = keyof typeof skills;

/**
 * Ejecutar un skill por nombre (para MCP/Agentes)
 */
export async function executeSkill<T extends SkillName>(
  skillName: T,
  payload: Parameters<typeof skills[T]>[0]
): Promise<ReturnType<typeof skills[T]>> {
  const skill = skills[skillName];
  if (!skill) {
    throw new Error(`Skill "${skillName}" no encontrado`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return skill(payload as any) as ReturnType<typeof skills[T]>;
}

/**
 * Listar skills disponibles (para MCP)
 */
export function listSkills(): Array<{ name: SkillName; description: string; category: string }> {
  return [
    // Contactos
    { name: 'create_contact', description: 'Crear un nuevo contacto', category: 'contacts' },
    { name: 'update_contact', description: 'Actualizar un contacto existente', category: 'contacts' },
    { name: 'get_contact', description: 'Obtener contacto por ID', category: 'contacts' },
    { name: 'find_contact_by_email', description: 'Buscar contacto por email', category: 'contacts' },
    // Leads
    { name: 'create_lead', description: 'Crear un nuevo lead', category: 'leads' },
    { name: 'get_lead', description: 'Obtener lead por ID', category: 'leads' },
    { name: 'find_lead_by_email', description: 'Buscar lead por email', category: 'leads' },
    { name: 'convert_lead', description: 'Convertir lead a contacto', category: 'leads' },
    // Conversaciones
    { name: 'create_conversation', description: 'Crear una nueva conversación', category: 'conversations' },
    { name: 'get_conversation', description: 'Obtener conversación por ID', category: 'conversations' },
    { name: 'get_or_create_conversation', description: 'Obtener o crear conversación', category: 'conversations' },
    { name: 'send_message', description: 'Enviar mensaje en una conversación', category: 'conversations' },
    { name: 'close_conversation', description: 'Cerrar una conversación', category: 'conversations' },
    // Tareas
    { name: 'create_task', description: 'Crear una nueva tarea', category: 'tasks' },
    { name: 'complete_task', description: 'Marcar tarea como completada', category: 'tasks' },
    { name: 'get_tasks_by_lead', description: 'Obtener tareas de un lead', category: 'tasks' },
    { name: 'get_pending_tasks', description: 'Obtener tareas pendientes de un usuario', category: 'tasks' },
    // Notas
    { name: 'create_note', description: 'Crear una nota en un lead', category: 'notes' },
    { name: 'get_notes_by_lead', description: 'Obtener notas de un lead', category: 'notes' },
    // Diagnósticos
    { name: 'complete_diagnosis', description: 'Completar flujo de diagnóstico completo', category: 'diagnosis' },
    { name: 'get_diagnosis_by_lead', description: 'Obtener diagnósticos de un lead', category: 'diagnosis' },
    // Bookings
    { name: 'create_booking', description: 'Crear una reserva/cita completa', category: 'bookings' },
    { name: 'confirm_booking', description: 'Confirmar una cita', category: 'bookings' },
    { name: 'cancel_booking', description: 'Cancelar una cita', category: 'bookings' },
    { name: 'get_bookings_by_lead', description: 'Obtener citas de un lead', category: 'bookings' },
    { name: 'get_upcoming_bookings', description: 'Obtener próximas citas', category: 'bookings' },
    // Catálogo
    { name: 'export_catalog', description: 'Exportar catálogo completo con custom fields (JSON/CSV)', category: 'catalog' },
    { name: 'get_catalog_field_definitions', description: 'Obtener definiciones de campos personalizados del catálogo', category: 'catalog' },
    { name: 'get_catalog_item', description: 'Obtener un ítem del catálogo por ID', category: 'catalog' },
    { name: 'search_catalog', description: 'Buscar en el catálogo con filtros', category: 'catalog' },
    // AI
    { name: 'execute_chatbot_response', description: 'Procesar mensaje del chatbot y responder', category: 'ai' },
  ];
}

// ============== RE-EXPORTS ==============

// Event Bus
export { eventBus, EVENTS };

// Tipos
export * from '@/lib/types/events';

// Skills individuales (para importación directa si se necesita)
export { createContact, updateContact, createLead, convertLead } from './contact-skills';
export { createConversation, sendMessage, closeConversation } from './conversation-skills';
export { createTask, completeTask, createNote } from './task-skills';
export { completeDiagnosis } from './diagnosis-skills';
export { createBooking, confirmBooking, cancelBooking } from './booking-skills';
export { exportCatalog, getFieldDefinitions, getCatalogItem, searchCatalog } from './catalog-skills';

// ============== COMPONENTES DE MADUREZ ==============

// Skill Context
export {
  SkillContext,
  createContextFromSession,
  createContextFromApiKey,
  createContextFromMCP,
  createContextFromWebhook,
  createContextFromAutomation,
  createSystemContext,
  runWithContext,
  getCurrentContext,
  requireContext,
} from './context';
export type { SkillContextData, SkillSource, PermissionLevel, SkillPermissions } from './context';

// Event Metadata
export {
  EventBuilder,
  createEvent,
  createSimpleEvent,
  createDerivedEvent,
  generateIdempotencyKey,
  extractMetadataForLog,
} from './event-metadata';
export type { EventMetadata, EnrichedEvent } from './event-metadata';

// Idempotency
export {
  default as idempotencyService,
  withIdempotency,
  skillIdempotencyKey,
  automationIdempotencyKey,
} from './idempotency';
export type { IdempotencyRecord, IdempotencyOptions } from './idempotency';

// Observability
export {
  skillsLogger,
  automationLogger,
  eventBusLogger,
  mcpLogger,
  webhookLogger,
  metrics,
  spans,
  createLogger,
  trackSkillExecution,
  trackAutomationExecution,
  trackEvent,
  getHealthStatus,
} from './observability';
export type { StructuredLog, MetricPoint, SpanInfo, HealthStatus, LogLevel } from './observability';

// Notification Layer
export {
  notificationService,
  notifyByEmail,
  notifyByWhatsApp,
  notifyUser,
  notifyLead,
} from './notification-layer';
export type {
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  NotificationRecipient,
  NotificationContent,
  NotificationOptions,
  NotificationResult,
} from './notification-layer';
