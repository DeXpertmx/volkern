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
import * as dealSkills from './deal-skills';
import * as chatbotSkills from './chatbot-skill';
import * as chatwootSyncSkills from './chatwoot-sync-skill';
import * as webCreatorSkills from './web-creator-skills';
import * as proactivitySkills from './proactivity-skills';
import * as trainingSkills from './training-skills';
import * as financeSkills from './finance-skills';
import * as inventorySkills from './inventory-skills';
import * as inventoryWatchdogSkills from './inventory-watchdog';
import * as projectSkills from './project-skills';
import * as consolidationSkills from './financial-consolidation-skills';
import * as productionSkills from './production-management-skills';
import * as qualitySkills from './quality-management-skills';
import * as hrSkills from './hr-management-skills';
import * as auditSkills from './audit-skills';
import * as vaultPayrollSkills from './vault-payroll-skills';
import * as operationalSkills from './operational-skills';
import * as marketingSkills from './marketing-skills';
import * as interactionSkills from './interaction-skills';
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

const getDealWrapper = (input: { dealId: string; tenantId: string }) =>
  dealSkills.getDeal(input.dealId, input.tenantId);

const listDealsWrapper = (input: { tenantId: string; etapa?: string; prioridad?: string; leadId?: string; contactId?: string; search?: string; page?: number; limit?: number }) =>
  dealSkills.listDeals(input.tenantId, input);

const updateLeadWrapper = async (input: { tenantId: string; email?: string; nombre?: string; telefono?: string; empresa?: string; contexto?: string; notas?: string }) => {
  const { tenantId, email, nombre, contexto, notas, ...dataToUpdate } = input;
  const { prisma } = await import('@/lib/db');
  
  let targetEmail = email;
  let targetNombre = nombre;

  // 1. Si no hay email, intentar buscar por nombre
  if (!targetEmail && targetNombre) {
    const found = await prisma.lead.findFirst({ 
      where: { tenantId, nombre: { contains: targetNombre, mode: 'insensitive' } } 
    }) || await prisma.contact.findFirst({ 
      where: { tenantId, nombre: { contains: targetNombre, mode: 'insensitive' } } 
    });
    
    if (found) {
      targetEmail = found.email;
      if (!targetNombre) targetNombre = found.nombre;
    }
  }

  if (!targetEmail) throw new Error('Se requiere un email o nombre válido para identificar al contacto');

  const finalNotas = contexto || notas;
  
  // 2. Buscar si es Lead
  const lead = await contactSkills.findLeadByEmail(targetEmail, tenantId);
  if (lead) {
    return await prisma.lead.update({
      where: { id: lead.id },
      data: {
        nombre: targetNombre !== undefined ? targetNombre : undefined,
        telefono: dataToUpdate.telefono !== undefined ? dataToUpdate.telefono : undefined,
        empresa: dataToUpdate.empresa !== undefined ? dataToUpdate.empresa : undefined,
        notas: finalNotas !== undefined ? finalNotas : undefined
      }
    });
  }

  // 3. Buscar si es Contacto
  const contact = await contactSkills.findContactByEmail(targetEmail, tenantId);
  if (contact) {
    return await prisma.contact.update({
      where: { id: contact.id },
      data: {
        nombre: targetNombre !== undefined ? targetNombre : undefined,
        telefono: dataToUpdate.telefono !== undefined ? dataToUpdate.telefono : undefined,
        notas: finalNotas !== undefined ? finalNotas : undefined
      }
    });
  }

  throw new Error(`No se encontró ningún contacto ni lead para actualizar.`);
};

const createLeadWrapper = async (input: { tenantId: string; nombre: string; email: string; telefono?: string; notas?: string; contexto?: string; empresa?: string }) => {
  const { contexto, notas, ...rest } = input;
  return contactSkills.createLead({
    ...rest,
    notas: contexto || notas
  });
};

const createTaskWrapper = async (input: { tenantId: string; titulo: string; email?: string; descripcion?: string; fechaVencimiento?: string | Date; prioridad?: string; userId?: string }) => {
  const { tenantId, email, titulo, descripcion, fechaVencimiento, userId } = input;
  
  let lead = null;
  let contact = null;

  if (email) {
    // Buscar lead o contacto
    lead = await contactSkills.findLeadByEmail(email, tenantId);
    if (!lead) {
      contact = await contactSkills.findContactByEmail(email, tenantId);
    }
    
    if (!lead && !contact) {
      throw new Error(`No se encontró ningún lead o contacto con el correo ${email}`);
    }
  }

  // Parsear fecha o default a mañana
  let fecha = new Date();
  if (fechaVencimiento) {
    fecha = new Date(fechaVencimiento);
    if (isNaN(fecha.getTime())) fecha = new Date();
  } else {
    fecha.setDate(fecha.getDate() + 1); // Por defecto mañana si no viene
  }

  const { prisma } = await import('@/lib/db');
  const task = await prisma.task.create({
    data: {
      tenantId,
      leadId: lead ? lead.id : null,
      contactId: contact ? contact.id : null,
      titulo,
      tipo: 'seguimiento',
      descripcion,
      fechaVencimiento: fecha,
      completada: false,
    }
  });

  const { eventBus, EVENTS } = await import('./event-bus');
  eventBus.emitEvent(EVENTS.TASK_CREATED, {
    tenantId,
    userId,
    timestamp: new Date(),
    source: 'app',
    taskId: task.id,
    leadId: task.leadId,
    titulo: task.titulo,
    tipo: task.tipo,
    fechaVencimiento: task.fechaVencimiento,
  });

  return task;
};

const registerInteractionWrapper = async (input: { tenantId: string; email?: string; nombre?: string; tipo: any; contenido: string; resultado?: string; userId?: string }) => {
  const { tenantId, email, nombre, tipo, contenido, resultado, userId } = input;
  
  const { prisma } = await import('@/lib/db');
  
  let lead = null;
  let contact = null;

  if (email) {
    lead = await contactSkills.findLeadByEmail(email, tenantId);
    if (!lead) contact = await contactSkills.findContactByEmail(email, tenantId);
  } else if (nombre) {
    lead = await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
    if (!lead) contact = await prisma.contact.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
  }

  if (!lead && !contact) {
    throw new Error('No se encontró el contacto o lead para registrar la interacción');
  }

  return interactionSkills.createInteraction({
    tenantId,
    leadId: lead?.id,
    contactId: contact?.id,
    tipo,
    contenido,
    resultado,
    userId
  });
};

const getPhoneByNameWrapper = async (input: { tenantId: string; nombre: string }) => {
  const { tenantId, nombre } = input;
  const { prisma } = await import('@/lib/db');
  
  const lead = await prisma.lead.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
  if (lead?.telefono) return { nombre: lead.nombre, telefono: lead.telefono, tipo: 'lead' };
  
  const contact = await prisma.contact.findFirst({ where: { tenantId, nombre: { contains: nombre, mode: 'insensitive' } } });
  if (contact?.telefono) return { nombre: contact.nombre, telefono: contact.telefono, tipo: 'contact' };
  
  throw new Error(`No se encontró teléfono para el nombre "${nombre}"`);
};

const createBookingWrapper = async (input: { 
  tenantId: string; 
  email?: string; 
  nombre?: string; 
  fecha?: string; 
  hora?: string; 
  titulo?: string;
  userId?: string;
}) => {
  const { tenantId, email, nombre, fecha, hora, titulo, userId } = input;
  const { prisma } = await import('@/lib/db');

  let targetEmail = email;
  let targetNombre = nombre;

  // 1. Si no hay email pero hay nombre, intentar buscarlo
  if (!targetEmail && targetNombre) {
    const lead = await prisma.lead.findFirst({ 
      where: { tenantId, nombre: { contains: targetNombre, mode: 'insensitive' } } 
    });
    
    if (lead) {
      targetEmail = lead.email;
      targetNombre = lead.nombre;
    } else {
      const contact = await prisma.contact.findFirst({ 
        where: { tenantId, nombre: { contains: targetNombre, mode: 'insensitive' } } 
      });
      if (contact) {
        targetEmail = contact.email;
        targetNombre = contact.nombre;
      }
    }
  }

  if (!targetEmail) throw new Error('Se requiere un email para agendar la cita. Si el contacto no existe, por favor proporciónalo.');
  if (!targetNombre) targetNombre = targetEmail.split('@')[0];

  // 2. Procesar fecha y hora
  let dt = new Date();
  if (fecha) {
    const [y, m, d] = fecha.split('-').map(Number);
    dt.setFullYear(y, m - 1, d);
  }
  if (hora) {
    const [h, min] = hora.split(':').map(Number);
    dt.setHours(h, min || 0, 0, 0);
  }

  return bookingSkills.createBooking({
    tenantId,
    email: targetEmail,
    nombre: targetNombre,
    titulo: titulo || 'Cita de Seguimiento',
    fechaHora: dt,
    userId,
    source: 'app'
  });
};

export const skills = {
  // Contactos
  create_contact: contactSkills.createContact,
  update_contact: contactSkills.updateContact,
  get_contact: contactSkills.getContact,
  find_contact_by_email: findContactByEmailWrapper,
  
  // Leads
  create_lead: createLeadWrapper,
  update_lead: updateLeadWrapper,
  get_lead: contactSkills.getLead,
  find_lead_by_email: findLeadByEmailWrapper,
  convert_lead: contactSkills.convertLead,
  obtener_telefono: getPhoneByNameWrapper,
  registrar_interaccion: registerInteractionWrapper,
  
  // Conversaciones
  create_conversation: conversationSkills.createConversation,
  get_conversation: getConversationWrapper,
  get_or_create_conversation: conversationSkills.getOrCreateConversation,
  send_message: conversationSkills.sendMessage,
  close_conversation: conversationSkills.closeConversation,
  
  // Tareas
  create_task: createTaskWrapper,
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
  create_booking: createBookingWrapper,
  confirm_booking: bookingSkills.confirmBooking,
  cancel_booking: bookingSkills.cancelBooking,
  get_bookings_by_lead: getBookingsByLeadWrapper,
  get_upcoming_bookings: getUpcomingBookingsWrapper,
  auto_schedule: bookingSkills.autoScheduleAppointment,
  
  // Deals / Pipeline
  create_deal: dealSkills.createDeal,
  update_deal: dealSkills.updateDeal,
  get_deal: getDealWrapper,
  list_deals: listDealsWrapper,
  prequalify_lead: dealSkills.prequalifyLead,
  
  // Catálogo
  export_catalog: catalogSkills.exportCatalog,
  get_catalog_field_definitions: catalogSkills.getFieldDefinitions,
  get_catalog_item: catalogSkills.getCatalogItem,
  search_catalog: catalogSkills.searchCatalog,
  
  // WebCreator AI
  generate_landing_draft: webCreatorSkills.generateLandingDraft,
  
  // Proactividad & Training
  detect_ghosting: proactivitySkills.detectGhosting,
  generate_success_path: proactivitySkills.generateSuccessPath,
  generate_customer_response: trainingSkills.generateCustomerResponse,
  generate_post_mortem: trainingSkills.generatePostMortem,
  
  // AI & Chatbot
  execute_chatbot_response: chatbotSkills.executeChatbotResponse,
  
  // Sincronización Chatwoot
  sync_chatwoot_incoming: chatwootSyncSkills.syncIncomingChatwootMessage,
  sync_chatwoot_outgoing: chatwootSyncSkills.syncOutgoingChatwootMessage,
  
  // ERP Finanzas
  create_supplier: financeSkills.createSupplier,
  create_expense: financeSkills.createExpense,
  register_expense_vision: financeSkills.registerExpenseVision,
  analyze_burn_rate: financeSkills.analyzeBurnRate,
  
  // ERP Inventario
  adjust_stock: inventorySkills.adjustStock,
  get_inventory_health: inventorySkills.getInventoryHealth,
  process_inventory_consumption: inventorySkills.processInventoryConsumption,
  inventory_watchdog: inventoryWatchdogSkills.inventoryWatchdog,
  
  // ERP Proyectos
  get_project_profitability: projectSkills.getProjectProfitability,
  detect_project_drifting: projectSkills.detectProjectDrifting,
  
  // ERP Consolidación (The Financial Brain)
  analyze_global_profitability: consolidationSkills.analyzeGlobalProfitability,
  audit_expense_integrity: consolidationSkills.auditExpenseIntegrity,
  project_financial_forecast: consolidationSkills.projectFinancialForecast,
  tax_prospector: consolidationSkills.taxProspector,
  
  // ERP Producción (MRP)
  calculate_production_cost: productionSkills.calculate_production_cost,
  verify_waste_integrity: productionSkills.verify_waste_integrity,

  // ERP Calidad (QC)
  detect_quality_anomalies: qualitySkills.detect_quality_anomalies,
  register_qc_inspection: qualitySkills.register_qc_inspection,

  // ERP RRHH (HRM)
  talent_retention_risk: hrSkills.talent_retention_risk,
  get_employee_confidential_data: hrSkills.get_employee_confidential_data,
  get_hr_daily_brief: hrSkills.get_hr_daily_brief,
  authorize_bulk_expenses: hrSkills.authorize_bulk_expenses,
  approve_vacation_voice: hrSkills.approve_vacation_voice,
  orchestrate_asset_transfer: hrSkills.orchestrate_asset_transfer,
  mcp_access_watchdog: hrSkills.mcp_access_watchdog,
  generate_offboarding_security_kit: hrSkills.generate_offboarding_security_kit,
  confirm_digital_seal: hrSkills.confirm_digital_seal,
  access_security_audit: hrSkills.access_security_audit,

  // Agentic Skills (Gemma 4 Optimized)
  audit_finance_integrity: auditSkills.audit_finance_integrity,
  orchestrate_secure_payroll: vaultPayrollSkills.orchestrate_secure_payroll,
  get_field_activity: operationalSkills.get_field_activity,
  audit_material_leaks: operationalSkills.audit_material_leaks,
  
  // Marketing Hub
  generate_marketing_copy: marketingSkills.generate_marketing_copy,
  analyze_marketing_sentiment: marketingSkills.analyze_marketing_sentiment,
  suggest_campaign_optimization: marketingSkills.suggest_campaign_optimization,
  generate_web_creator_block: marketingSkills.generate_web_creator_block,
  generate_seo_metadata: marketingSkills.generate_seo_metadata,
  advise_on_automation_rules: marketingSkills.advise_on_automation_rules,
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
    // Deals
    { name: 'create_deal', description: 'Crear un nuevo deal en el pipeline', category: 'deals' },
    { name: 'update_deal', description: 'Actualizar un deal existente', category: 'deals' },
    { name: 'get_deal', description: 'Obtener deal por ID', category: 'deals' },
    { name: 'list_deals', description: 'Listar deals con filtros', category: 'deals' },
    // Catálogo
    { name: 'export_catalog', description: 'Exportar catálogo completo con custom fields (JSON/CSV)', category: 'catalog' },
    { name: 'get_catalog_field_definitions', description: 'Obtener definiciones de campos personalizados del catálogo', category: 'catalog' },
    { name: 'get_catalog_item', description: 'Obtener un ítem del catálogo por ID', category: 'catalog' },
    { name: 'search_catalog', description: 'Buscar en el catálogo con filtros', category: 'catalog' },
    // AI
    { name: 'execute_chatbot_response', description: 'Procesar mensaje del chatbot y responder', category: 'ai' },
    // Advanced composite skills
    { name: 'prequalify_lead', description: 'Registrar nota, actualizar deal y buscar en catálogo (Escucha Activa)', category: 'advanced' },
    { name: 'auto_schedule', description: 'Agendar cita automáticamente verificando disponibilidad y notificando al cliente', category: 'advanced' },
    { name: 'generate_landing_draft', description: 'Generar borrador de landing page personalizado con IA', category: 'advanced' },
    // Proactivity & Training
    { name: 'detect_ghosting', description: 'Detectar leads inactivos en etapas calientes', category: 'proactivity' },
    { name: 'generate_success_path', description: 'Generar sugerencia estratégica para un lead basada en patrones de cierre', category: 'proactivity' },
    { name: 'generate_customer_response', description: 'Simular respuesta de cliente en roleplay de negociación', category: 'training' },
    { name: 'generate_post_mortem', description: 'Generar reporte de retroalimentación tras una sesión de roleplay', category: 'training' },
    // ERP Finanzas
    { name: 'create_supplier', description: 'Registrar un nuevo proveedor', category: 'finance' },
    { name: 'create_expense', description: 'Registrar un nuevo gasto u egreso', category: 'finance' },
    { name: 'register_expense_vision', description: 'Registrar gasto mediante procesamiento de visión', category: 'finance' },
    { name: 'analyze_burn_rate', description: 'Analizar relación ingresos vs gastos y salud financiera', category: 'finance' },
    // ERP Inventario
    { name: 'adjust_stock', description: 'Ajustar niveles de stock (Entrada/Salida/Transferencia)', category: 'inventory' },
    { name: 'get_inventory_health', description: 'Analizar salud del inventario y predicción de rupturas', category: 'inventory' },
    { name: 'process_inventory_consumption', description: 'Descontar producto o componentes (BoM) automáticamente', category: 'inventory' },
    { name: 'inventory_watchdog', description: 'Vigilante de IA para puntos de reorden y alertas de stock', category: 'inventory' },
    // ERP Proyectos
    { name: 'get_project_profitability', description: 'Calcular rentabilidad real de un proyecto vinculando ingresos y costos', category: 'projects' },
    { name: 'detect_project_drifting', description: 'Detectar desviaciones presupuestarias o cronológicas vía IA', category: 'projects' },
    // ERP Consolidación (The Financial Brain)
    { name: 'analyze_global_profitability', description: 'Calcula el EBITDA, margen real y salud financiera cruzando ventas, gastos y proyectos', category: 'finance' },
    { name: 'audit_expense_integrity', description: 'Verifica si los gastos registrados coinciden con los hashes de seguridad y detecta anomalías', category: 'finance' },
    { name: 'project_financial_forecast', description: 'Predice el flujo de caja (Cash Flow) basado en el pipeline de ventas y gastos fijos', category: 'finance' },
    { name: 'tax_prospector', description: 'Proyección fiscal regional (MX, ES, US-LLC)', category: 'finance' },
    // ERP Producción (MRP)
    { name: 'calculate_production_cost', description: 'Calcula el costo proyectado de fabricación (BoM + Mano de Obra)', category: 'production' },
    { name: 'verify_waste_integrity', description: 'Auditoría visual de mermas e integridad de planta vía Gemma Vision', category: 'production' },
    // ERP Calidad (QC)
    { name: 'detect_quality_anomalies', description: 'Analizar anomalías de calidad cruzando materiales y proveedores', category: 'quality' },
    { name: 'register_qc_inspection', description: 'Registrar inspección con firma criptográfica SHA-256', category: 'quality' },
    // ERP RRHH (HRM)
    { name: 'talent_retention_risk', description: 'Analizar riesgo de rotación cruzando carga de proyectos y compromiso', category: 'hr' },
    { name: 'get_employee_confidential_data', description: 'Acceso auditado a datos cifrados de nómina en The Vault 2.0', category: 'hr' },
    { name: 'get_hr_daily_brief', description: 'Resumen ejecutivo narrativo (Briefing Militar) del estado de RRHH', category: 'hr' },
    { name: 'authorize_bulk_expenses', description: 'Autorización masiva con validación GPS VISION-LOCK', category: 'hr' },
    { name: 'approve_vacation_voice', description: 'Aprobar vacaciones con nota personalizada vía voz', category: 'hr' },
    { name: 'orchestrate_asset_transfer', description: 'Gestionar traspaso o devolución de activos críticos de personal', category: 'hr' },
    { name: 'mcp_access_watchdog', description: 'Watchdog de seguridad: detecta silos de conocimiento y concentración de poder digital', category: 'hr' },
    { name: 'generate_offboarding_security_kit', description: 'Generar roadmap de revocación de accesos (Kill-Switch) ante una baja', category: 'hr' },
    { name: 'confirm_digital_seal', description: 'Autorizar y sellar digitalmente actas de entrega o vacaciones vía voz', category: 'hr' },
    { name: 'access_security_audit', description: 'Auditoría de seguridad digital: detecta silos de conocimiento y riesgos de acceso', category: 'hr' },
    
    // Agentic Skills
    { name: 'audit_finance_integrity', description: 'Auditoría forense automatizada: verifica brechas en Veri*factu y dispara el Protocolo de Desconfianza', category: 'advanced' },
    { name: 'orchestrate_secure_payroll', description: 'Orquestación de nómina cruzando Vault y Veri*factu. Requiere rol OWNER.', category: 'advanced' },
    { name: 'get_field_activity', description: 'Localiza técnicos y activos en campo mediante VISION-LOCK', category: 'advanced' },
    { name: 'audit_material_leaks', description: 'Detecta desviaciones y mermas industriales cruzando stock y producción', category: 'advanced' },
    
    // Marketing Hub
    { name: 'generate_marketing_copy', description: 'Generar copy publicitario o social con IA', category: 'marketing' },
    { name: 'analyze_marketing_sentiment', description: 'Analizar sentimiento de feedback social', category: 'marketing' },
    { name: 'suggest_campaign_optimization', description: 'Sugerencias de optimización basadas en datos', category: 'marketing' },
    { name: 'generate_web_creator_block', description: 'Generar bloques HTML para Web Creator con IA', category: 'marketing' },
    { name: 'generate_seo_metadata', description: 'Generar metadatos SEO con IA', category: 'marketing' },
    { name: 'advise_on_automation_rules', description: 'Analizar tenant y sugerir reglas de automatización', category: 'marketing' },
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
export { createDeal, updateDeal, getDeal, listDeals } from './deal-skills';
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
