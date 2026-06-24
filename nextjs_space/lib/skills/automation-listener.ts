/**
 * Volkern Automation Listener
 * Conecta EventBus → AutomationEngine
 * 
 * Arquitectura:
 * Skill → Core → EventBus → AutomationListener → triggerAutomation
 * 
 * Este listener escucha eventos del EventBus y dispara las
 * automatizaciones correspondientes en el AutomationEngine.
 */

import { eventBus, EVENTS } from './event-bus';
import { triggerAutomation } from '@/lib/automation-engine';
import { executeSkill } from './index';
import type {
  EventType,
  BaseEventPayload,
  LeadCreatedEvent,
  LeadConvertedEvent,
  BookingCreatedEvent,
  TaskCreatedEvent,
  TaskCompletedEvent,
  DiagnosisCompletedEvent,
  MessageSentEvent,
  PaymentReceivedEvent,
  PaymentFailedEvent,
  InventoryLowStockEvent,
  ProductionOrderCreatedEvent,
  SupportTicketCreatedEvent,
  SupportSlaWarningEvent,
  CampaignStartedEvent,
  CampaignCompletedEvent,
  EmailOpenedEvent,
  EmailClickedEvent,
  LeadNurturingTriggerEvent,
  SocialPostPublishedEvent,
  EmployeeCreatedEvent,
  EvaluationCompletedEvent,
  InvoiceDueEvent,
  ExpenseSubmittedEvent,
  InspectionCompletedEvent,
  NonConformityCreatedEvent,
  MilestoneReachedEvent,
  ProjectStartedEvent,
} from '@/lib/types/events';

/**
 * Mapeo de eventos del EventBus a triggers de AutomationEngine
 * EventBus Event → Automation Trigger
 */
const EVENT_TO_TRIGGER_MAP: Record<string, string> = {
  // Leads
  [EVENTS.LEAD_CREATED]: 'nuevo_lead',
  [EVENTS.LEAD_UPDATED]: 'lead_actualizado',
  [EVENTS.LEAD_QUALIFIED]: 'lead_etiquetado',
  
  // Citas / Bookings
  [EVENTS.BOOKING_CREATED]: 'cita_agendada',
  [EVENTS.BOOKING_CONFIRMED]: 'cita_confirmada',
  [EVENTS.BOOKING_CANCELLED]: 'cita_cancelada',
  
  // Pagos
  [EVENTS.PAYMENT_RECEIVED]: 'pago_recibido',
  [EVENTS.PAYMENT_FAILED]: 'pago_fallido',
  
  // Workflows externos
  [EVENTS.WORKFLOW_EXECUTED]: 'n8n_workflow_completado',
  [EVENTS.WORKFLOW_FAILED]: 'n8n_workflow_fallido',

  // Inventario (Fase 1)
  [EVENTS.INVENTORY_LOW_STOCK]: 'stock_bajo',
  [EVENTS.INVENTORY_OUT_OF_STOCK]: 'stock_agotado',
  [EVENTS.INVENTORY_RESTOCKED]: 'stock_reabastecido',

  // Producción (Fase 1)
  [EVENTS.PRODUCTION_ORDER_CREATED]: 'orden_produccion',
  [EVENTS.PRODUCTION_ORDER_COMPLETED]: 'produccion_completada',

  // Soporte (Fase 1)
  [EVENTS.SUPPORT_TICKET_CREATED]: 'ticket_creado',
  [EVENTS.SUPPORT_SLA_WARNING]: 'sla_por_vencer',
  [EVENTS.SUPPORT_SLA_BREACHED]: 'sla_incumplido',

  // Marketing (Fase 2)
  [EVENTS.CAMPAIGN_STARTED]: 'campana_iniciada',
  [EVENTS.CAMPAIGN_COMPLETED]: 'campana_completada',
  [EVENTS.EMAIL_OPENED]: 'email_abierto',
  [EVENTS.EMAIL_CLICKED]: 'link_clicado',
  [EVENTS.EMAIL_BOUNCED]: 'email_bounce',
  [EVENTS.EMAIL_UNSUBSCRIBED]: 'email_unsuscrito',
  [EVENTS.LEAD_NURTURING_TRIGGER]: 'lead_nurturing',
  [EVENTS.SOCIAL_POST_PUBLISHED]: 'post_publicado',
  [EVENTS.SOCIAL_POST_SCHEDULED]: 'post_programado',

  // RRHH (Fase 3)
  [EVENTS.EMPLOYEE_CREATED]: 'empleado_nuevo',
  [EVENTS.EMPLOYEE_TERMINATED]: 'empleado_retirado',
  [EVENTS.EVALUATION_COMPLETED]: 'evaluacion_completada',
  [EVENTS.EVALUATION_DUE]: 'evaluacion_pendiente',
  [EVENTS.TRAINING_COMPLETED]: 'capacitacion_completada',
  [EVENTS.CERTIFICATION_EXPIRED]: 'certificacion_vencida',

  // Finanzas (Fase 3)
  [EVENTS.INVOICE_DUE]: 'factura_por_vencer',
  [EVENTS.INVOICE_OVERDUE]: 'factura_vencida',
  [EVENTS.INVOICE_PAID]: 'factura_pagada',
  [EVENTS.EXPENSE_SUBMITTED]: 'gasto_enviado',
  [EVENTS.EXPENSE_APPROVED]: 'gasto_aprobado',
  [EVENTS.PAYROLL_GENERATED]: 'nomina_generada',
  [EVENTS.BUDGET_ALERT]: 'presupuesto_alerta',

  // Calidad (Fase 4)
  [EVENTS.INSPECTION_COMPLETED]: 'inspeccion_completada',
  [EVENTS.INSPECTION_FAILED]: 'inspeccion_fallida',
  [EVENTS.NON_CONFORMITY_CREATED]: 'no_conformidad',
  [EVENTS.NON_CONFORMITY_RESOLVED]: 'no_conformidad_resuelta',
  [EVENTS.QUALITY_ALERT]: 'alerta_calidad',
  [EVENTS.CALIBRATION_DUE]: 'calibracion_pendiente',

  // Proyectos (Fase 4)
  [EVENTS.MILESTONE_REACHED]: 'milestone_alcanzado',
  [EVENTS.MILESTONE_DUE]: 'milestone_pendiente',
  [EVENTS.PROJECT_STARTED]: 'proyecto_iniciado',
  [EVENTS.PROJECT_COMPLETED]: 'proyecto_completado',
  [EVENTS.PROJECT_DELAYED]: 'proyecto_retrasado',
  [EVENTS.TASK_COMPLETED]: 'tarea_completada',
  [EVENTS.DELIVERABLE_UPLOADED]: 'entregable_subido',
};

/**
 * Transforma payload de evento a contexto de automatización
 */
function eventToAutomationContext(event: EventType, payload: BaseEventPayload): Record<string, unknown> {
  const baseContext = {
    tenantId: payload.tenantId,
    userId: payload.userId,
    source: payload.source,
    timestamp: payload.timestamp,
  };

  // Enriquecer contexto según tipo de evento
  switch (event) {
    case EVENTS.LEAD_CREATED:
    case EVENTS.LEAD_UPDATED:
    case EVENTS.LEAD_QUALIFIED: {
      const leadPayload = payload as LeadCreatedEvent;
      return {
        ...baseContext,
        leadId: leadPayload.leadId,
        leadEmail: leadPayload.email,
        leadNombre: leadPayload.nombre,
        leadTelefono: leadPayload.telefono,
        leadFuente: leadPayload.fuente,
        leadScore: leadPayload.score,
      };
    }

    case EVENTS.LEAD_CONVERTED: {
      const convertedPayload = payload as LeadConvertedEvent;
      return {
        ...baseContext,
        leadId: convertedPayload.leadId,
        contactId: convertedPayload.contactId,
        dealId: convertedPayload.dealId,
      };
    }

    case EVENTS.BOOKING_CREATED:
    case EVENTS.BOOKING_CONFIRMED:
    case EVENTS.BOOKING_CANCELLED: {
      const bookingPayload = payload as BookingCreatedEvent;
      return {
        ...baseContext,
        citaId: bookingPayload.bookingId,
        leadId: bookingPayload.leadId,
        servicioId: bookingPayload.servicioId,
        fechaHora: bookingPayload.fechaHora,
        googleMeetUrl: bookingPayload.googleMeetUrl,
      };
    }

    case EVENTS.TASK_CREATED: {
      const taskPayload = payload as TaskCreatedEvent;
      return {
        ...baseContext,
        taskId: taskPayload.taskId,
        leadId: taskPayload.leadId,
        taskTitulo: taskPayload.titulo,
        taskDescripcion: taskPayload.descripcion,
        taskFechaVencimiento: taskPayload.fechaVencimiento,
      };
    }

    case EVENTS.TASK_COMPLETED: {
      const taskPayload = payload as TaskCompletedEvent;
      return {
        ...baseContext,
        taskId: taskPayload.taskId,
        leadId: taskPayload.leadId,
        taskTitulo: taskPayload.titulo,
        completedAt: taskPayload.completedAt,
      };
    }

    case EVENTS.DIAGNOSIS_COMPLETED: {
      const diagPayload = payload as DiagnosisCompletedEvent;
      return {
        ...baseContext,
        diagnosisId: diagPayload.diagnosisId,
        leadId: diagPayload.leadId,
        respuestas: diagPayload.respuestas,
        resumen: diagPayload.resumen,
      };
    }

    case EVENTS.MESSAGE_SENT: {
      const msgPayload = payload as MessageSentEvent;
      return {
        ...baseContext,
        conversationId: msgPayload.conversationId,
        leadId: msgPayload.leadId,
        messageContent: msgPayload.content || msgPayload.contenido,
        messageType: msgPayload.messageType,
        canal: msgPayload.canal,
      };
    }

    case EVENTS.PAYMENT_RECEIVED: {
      const paymentPayload = payload as PaymentReceivedEvent;
      return {
        ...baseContext,
        paymentId: paymentPayload.paymentId,
        leadId: paymentPayload.leadId,
        monto: paymentPayload.monto,
        moneda: paymentPayload.moneda,
        metodoPago: paymentPayload.metodoPago,
      };
    }

    case EVENTS.PAYMENT_FAILED: {
      const paymentPayload = payload as PaymentFailedEvent;
      return {
        ...baseContext,
        paymentId: paymentPayload.paymentId,
        leadId: paymentPayload.leadId,
        monto: paymentPayload.monto,
        error: paymentPayload.error,
      };
    }

    case EVENTS.WORKFLOW_EXECUTED: {
      const wfPayload = payload as any;
      return {
        ...baseContext,
        workflowId: wfPayload.workflowId,
        workflowName: wfPayload.workflowName,
        executionId: wfPayload.executionId,
        result: wfPayload.result,
      };
    }

    case EVENTS.WORKFLOW_FAILED: {
      const wfPayload = payload as any;
      return {
        ...baseContext,
        workflowId: wfPayload.workflowId,
        workflowName: wfPayload.workflowName,
        executionId: wfPayload.executionId,
        error: wfPayload.error,
      };
    }

    // === FASE 1: INVENTARIO ===
    case EVENTS.INVENTORY_LOW_STOCK: {
      const invPayload = payload as InventoryLowStockEvent;
      return {
        ...baseContext,
        itemId: invPayload.itemId,
        itemNombre: invPayload.itemNombre,
        itemSku: invPayload.itemSku,
        cantidadActual: invPayload.cantidadActual,
        cantidadMinima: invPayload.cantidadMinima,
        almacenId: invPayload.almacenId,
      };
    }

    case EVENTS.INVENTORY_OUT_OF_STOCK: {
      const invPayload = payload as InventoryLowStockEvent;
      return {
        ...baseContext,
        itemId: invPayload.itemId,
        itemNombre: invPayload.itemNombre,
        itemSku: invPayload.itemSku,
        cantidadActual: 0,
      };
    }

    case EVENTS.INVENTORY_RESTOCKED: {
      const invPayload = payload as InventoryLowStockEvent;
      return {
        ...baseContext,
        itemId: invPayload.itemId,
        itemNombre: invPayload.itemNombre,
        cantidadAgregada: invPayload.cantidadActual,
      };
    }

    // === FASE 1: PRODUCCIÓN ===
    case EVENTS.PRODUCTION_ORDER_CREATED: {
      const prodPayload = payload as ProductionOrderCreatedEvent;
      return {
        ...baseContext,
        orderId: prodPayload.orderId,
        orderNumber: prodPayload.orderNumber,
        productId: prodPayload.productId,
        productNombre: prodPayload.productNombre,
        cantidad: prodPayload.cantidad,
        prioridad: prodPayload.prioridad,
      };
    }

    case EVENTS.PRODUCTION_ORDER_COMPLETED: {
      const prodPayload = payload as ProductionOrderCreatedEvent;
      return {
        ...baseContext,
        orderId: prodPayload.orderId,
        orderNumber: prodPayload.orderNumber,
        cantidadProducida: prodPayload.cantidad,
      };
    }

    // === FASE 1: SOPORTE ===
    case EVENTS.SUPPORT_TICKET_CREATED: {
      const ticketPayload = payload as SupportTicketCreatedEvent;
      return {
        ...baseContext,
        ticketId: ticketPayload.ticketId,
        ticketNumero: ticketPayload.ticketNumero,
        ticketSubject: ticketPayload.subject,
        ticketPrioridad: ticketPayload.prioridad,
        ticketCategoria: ticketPayload.categoria,
        clienteId: ticketPayload.clienteId,
      };
    }

    case EVENTS.SUPPORT_SLA_WARNING:
    case EVENTS.SUPPORT_SLA_BREACHED: {
      const slaPayload = payload as SupportSlaWarningEvent;
      return {
        ...baseContext,
        ticketId: slaPayload.ticketId,
        ticketNumero: slaPayload.ticketNumero,
        slaDueAt: slaPayload.slaDueAt,
        tiempoRestanteMinutos: slaPayload.tiempoRestanteMinutos,
        ticketPrioridad: slaPayload.prioridad,
      };
    }

    // === FASE 2: MARKETING ===
    case EVENTS.CAMPAIGN_STARTED: {
      const campPayload = payload as CampaignStartedEvent;
      return {
        ...baseContext,
        campaignId: campPayload.campaignId,
        campaignNombre: campPayload.campaignNombre,
        campaignTipo: campPayload.campaignTipo,
        destinatariosCount: campPayload.destinatariosCount,
      };
    }

    case EVENTS.CAMPAIGN_COMPLETED: {
      const campPayload = payload as CampaignCompletedEvent;
      return {
        ...baseContext,
        campaignId: campPayload.campaignId,
        campaignNombre: campPayload.campaignNombre,
        enviadosCount: campPayload.enviadosCount,
        abiertosCount: campPayload.abiertosCount,
        clicksCount: campPayload.clicksCount,
      };
    }

    case EVENTS.EMAIL_OPENED: {
      const emailPayload = payload as EmailOpenedEvent;
      return {
        ...baseContext,
        emailId: emailPayload.emailId,
        campaignId: emailPayload.campaignId,
        leadId: emailPayload.leadId,
        email: emailPayload.email,
        tipoInteraccion: 'apertura',
      };
    }

    case EVENTS.EMAIL_CLICKED: {
      const emailPayload = payload as EmailClickedEvent;
      return {
        ...baseContext,
        emailId: emailPayload.emailId,
        campaignId: emailPayload.campaignId,
        leadId: emailPayload.leadId,
        urlClickeada: emailPayload.url,
        tipoInteraccion: 'click',
      };
    }

    case EVENTS.LEAD_NURTURING_TRIGGER: {
      const nurturingPayload = payload as LeadNurturingTriggerEvent;
      return {
        ...baseContext,
        leadId: nurturingPayload.leadId,
        triggerType: nurturingPayload.triggerType,
        daysInStage: nurturingPayload.daysInStage,
        leadScore: nurturingPayload.score,
      };
    }

    case EVENTS.SOCIAL_POST_PUBLISHED: {
      const socialPayload = payload as SocialPostPublishedEvent;
      return {
        ...baseContext,
        postId: socialPayload.postId,
        plataforma: socialPayload.plataforma,
        contenido: socialPayload.contenido,
      };
    }

    case EVENTS.SOCIAL_POST_SCHEDULED: {
      const socialPayload = payload as SocialPostPublishedEvent;
      return {
        ...baseContext,
        postId: socialPayload.postId,
        plataforma: socialPayload.plataforma,
        contenido: socialPayload.contenido,
        scheduledFor: socialPayload.scheduledFor,
      };
    }

    // === FASE 3: RRHH ===
    case EVENTS.EMPLOYEE_CREATED: {
      const empPayload = payload as EmployeeCreatedEvent;
      return {
        ...baseContext,
        employeeId: empPayload.employeeId,
        employeeNombre: empPayload.employeeNombre,
        employeeEmail: empPayload.employeeEmail,
        puesto: empPayload.puesto,
        departamento: empPayload.departamento,
        fechaIngreso: empPayload.fechaIngreso,
      };
    }

    case EVENTS.EMPLOYEE_TERMINATED: {
      const empPayload = payload as EmployeeCreatedEvent;
      return {
        ...baseContext,
        employeeId: empPayload.employeeId,
        employeeNombre: empPayload.employeeNombre,
        motivoTerminacion: (empPayload as any).motivo,
      };
    }

    case EVENTS.EVALUATION_COMPLETED: {
      const evalPayload = payload as EvaluationCompletedEvent;
      return {
        ...baseContext,
        evaluationId: evalPayload.evaluationId,
        employeeId: evalPayload.employeeId,
        employeeNombre: evalPayload.employeeNombre,
        puntuacion: evalPayload.puntuacion,
        feedback: evalPayload.feedback,
      };
    }

    case EVENTS.EVALUATION_DUE: {
      const evalPayload = payload as EvaluationCompletedEvent;
      return {
        ...baseContext,
        evaluationId: evalPayload.evaluationId,
        employeeId: evalPayload.employeeId,
        employeeNombre: evalPayload.employeeNombre,
        fechaEvaluacion: (evalPayload as any).fechaEvaluacion,
      };
    }

    case EVENTS.TRAINING_COMPLETED: {
      const trainPayload = payload as EvaluationCompletedEvent;
      return {
        ...baseContext,
        trainingId: trainPayload.evaluationId,
        employeeId: trainPayload.employeeId,
        employeeNombre: trainPayload.employeeNombre,
        puntuacion: trainPayload.puntuacion,
      };
    }

    case EVENTS.CERTIFICATION_EXPIRED: {
      const certPayload = payload as EvaluationCompletedEvent;
      return {
        ...baseContext,
        certificationId: certPayload.evaluationId,
        employeeId: certPayload.employeeId,
        employeeNombre: certPayload.employeeNombre,
        certificacion: certPayload.feedback,
      };
    }

    // === FASE 3: FINANZAS ===
    case EVENTS.INVOICE_DUE: {
      const invPayload = payload as InvoiceDueEvent;
      return {
        ...baseContext,
        invoiceId: invPayload.invoiceId,
        invoiceNumero: invPayload.invoiceNumero,
        monto: invPayload.monto,
        moneda: invPayload.moneda,
        fechaVencimiento: invPayload.fechaVencimiento,
        clienteNombre: invPayload.clienteNombre,
      };
    }

    case EVENTS.INVOICE_OVERDUE: {
      const invPayload = payload as InvoiceDueEvent;
      return {
        ...baseContext,
        invoiceId: invPayload.invoiceId,
        invoiceNumero: invPayload.invoiceNumero,
        monto: invPayload.monto,
        diasRetraso: 30,
        clienteNombre: invPayload.clienteNombre,
      };
    }

    case EVENTS.EXPENSE_SUBMITTED: {
      const expPayload = payload as ExpenseSubmittedEvent;
      return {
        ...baseContext,
        expenseId: expPayload.expenseId,
        employeeId: expPayload.employeeId,
        employeeNombre: expPayload.employeeNombre,
        monto: expPayload.monto,
        categoria: expPayload.categoria,
        descripcion: expPayload.descripcion,
      };
    }

    case EVENTS.EXPENSE_APPROVED: {
      const expPayload = payload as ExpenseSubmittedEvent;
      return {
        ...baseContext,
        expenseId: expPayload.expenseId,
        employeeId: expPayload.employeeId,
        monto: expPayload.monto,
        aprobado: true,
      };
    }

    case EVENTS.PAYROLL_GENERATED: {
      const payrollPayload = payload as EvaluationCompletedEvent;
      return {
        ...baseContext,
        payrollId: payrollPayload.evaluationId,
        periodo: payrollPayload.feedback,
        totalEmpleados: payrollPayload.puntuacion,
      };
    }

    case EVENTS.BUDGET_ALERT: {
      const budgetPayload = payload as EvaluationCompletedEvent;
      return {
        ...baseContext,
        departmentId: budgetPayload.evaluationId,
        departmentNombre: budgetPayload.employeeNombre,
        presupuestoUsado: budgetPayload.puntuacion,
      };
    }

    // === FASE 4: CALIDAD ===
    case EVENTS.INSPECTION_COMPLETED: {
      const inspPayload = payload as InspectionCompletedEvent;
      return {
        ...baseContext,
        inspectionId: inspPayload.inspectionId,
        inspectionNumero: inspPayload.inspectionNumero,
        resultado: inspPayload.resultado,
        itemsVerificados: inspPayload.itemsVerificados,
        itemsFallidos: inspPayload.itemsFallidos,
      };
    }

    case EVENTS.NON_CONFORMITY_CREATED: {
      const ncPayload = payload as NonConformityCreatedEvent;
      return {
        ...baseContext,
        nonConformityId: ncPayload.nonConformityId,
        ncNumero: ncPayload.ncNumero,
        tipo: ncPayload.tipo,
        gravedad: ncPayload.gravedad,
        causa: ncPayload.causa,
        proyectoId: ncPayload.proyectoId,
      };
    }

    case EVENTS.QUALITY_ALERT: {
      const qualityPayload = payload as NonConformityCreatedEvent;
      return {
        ...baseContext,
        alertType: (qualityPayload as any).alertType,
        mensaje: qualityPayload.causa,
        severity: qualityPayload.gravedad,
        entityId: qualityPayload.proyectoId,
      };
    }

    // === FASE 4: PROYECTOS ===
    case EVENTS.MILESTONE_REACHED: {
      const milestonePayload = payload as MilestoneReachedEvent;
      return {
        ...baseContext,
        milestoneId: milestonePayload.milestoneId,
        milestoneNombre: milestonePayload.milestoneNombre,
        projectId: milestonePayload.projectId,
        projectNombre: milestonePayload.projectNombre,
        fechaCompletado: milestonePayload.fechaCompletado,
      };
    }

    case EVENTS.MILESTONE_DUE: {
      const milestonePayload = payload as MilestoneReachedEvent;
      return {
        ...baseContext,
        milestoneId: milestonePayload.milestoneId,
        milestoneNombre: milestonePayload.milestoneNombre,
        projectId: milestonePayload.projectId,
        diasRestantes: 7,
      };
    }

    case EVENTS.PROJECT_STARTED: {
      const projPayload = payload as ProjectStartedEvent;
      return {
        ...baseContext,
        projectId: projPayload.projectId,
        projectNombre: projPayload.projectNombre,
        fechaInicio: (projPayload as any).fechaInicio,
        fechaFinEstimada: (projPayload as any).fechaFinEstimada,
        managerId: projPayload.managerId,
      };
    }

    case EVENTS.PROJECT_COMPLETED: {
      const projPayload = payload as any;
      return {
        ...baseContext,
        projectId: projPayload.projectId,
        projectNombre: projPayload.projectNombre,
        presupuestoActual: projPayload.fechaFin?.getTime() || 0,
      };
    }

    case EVENTS.PROJECT_DELAYED: {
      const projPayload = payload as MilestoneReachedEvent;
      return {
        ...baseContext,
        projectId: projPayload.projectId,
        projectNombre: projPayload.projectNombre,
        diasRetraso: 5,
        causa: 'Retraso en entregas',
      };
    }

    case EVENTS.TASK_COMPLETED: {
      const taskPayload = payload as any;
      return {
        ...baseContext,
        taskId: taskPayload.taskId,
        taskNombre: taskPayload.taskNombre,
        projectId: taskPayload.projectId,
        completedBy: taskPayload.completedBy,
      };
    }

    case EVENTS.DELIVERABLE_UPLOADED: {
      const deliverPayload = payload as MilestoneReachedEvent;
      return {
        ...baseContext,
        milestoneId: deliverPayload.milestoneId,
        projectId: deliverPayload.projectId,
        proyectoId: deliverPayload.projectId,
      };
    }

    default:
      return baseContext;
  }
}

/**
 * Handler genérico para eventos
 */
async function handleEvent(event: EventType, payload: BaseEventPayload): Promise<void> {
  const trigger = EVENT_TO_TRIGGER_MAP[event];
  
  if (!trigger) {
    // Evento sin trigger de automatización asociado (ej: MESSAGE_RECEIVED, CONTACT_UPDATED)
    console.log(`[AutomationListener] Evento ${event} no tiene trigger de automatización asociado`);
    return;
  }

  console.log(`[AutomationListener] Evento ${event} → Trigger ${trigger}`);

  try {
    const context = eventToAutomationContext(event, payload);
    await triggerAutomation(trigger, context);
  } catch (error) {
    console.error(`[AutomationListener] Error disparando automatización para ${event}:`, error);
  }
}

/**
 * Registra todos los listeners
 * Llamar una vez al iniciar la aplicación
 */
export function initializeAutomationListeners(): void {
  console.log('🔗 [AutomationListener] Inicializando listeners EventBus → AutomationEngine...');

  // Leads
  eventBus.onEvent(EVENTS.LEAD_CREATED, (payload) => handleEvent(EVENTS.LEAD_CREATED, payload));
  eventBus.onEvent(EVENTS.LEAD_UPDATED, (payload) => handleEvent(EVENTS.LEAD_UPDATED, payload));
  eventBus.onEvent(EVENTS.LEAD_QUALIFIED, (payload) => handleEvent(EVENTS.LEAD_QUALIFIED, payload));
  eventBus.onEvent(EVENTS.LEAD_CONVERTED, (payload) => handleEvent(EVENTS.LEAD_CONVERTED, payload));

  // Bookings / Citas
  eventBus.onEvent(EVENTS.BOOKING_CREATED, (payload) => handleEvent(EVENTS.BOOKING_CREATED, payload));
  eventBus.onEvent(EVENTS.BOOKING_CONFIRMED, (payload) => handleEvent(EVENTS.BOOKING_CONFIRMED, payload));
  eventBus.onEvent(EVENTS.BOOKING_CANCELLED, (payload) => handleEvent(EVENTS.BOOKING_CANCELLED, payload));

  // Tasks
  eventBus.onEvent(EVENTS.TASK_CREATED, (payload) => handleEvent(EVENTS.TASK_CREATED, payload));
  eventBus.onEvent(EVENTS.TASK_COMPLETED, (payload) => handleEvent(EVENTS.TASK_COMPLETED, payload));

  // Diagnosis
  eventBus.onEvent(EVENTS.DIAGNOSIS_COMPLETED, (payload) => handleEvent(EVENTS.DIAGNOSIS_COMPLETED, payload));

  // Messages
  eventBus.onEvent(EVENTS.MESSAGE_SENT, async (payload) => {
    // 1. Procesar como evento genérico de automatización
    handleEvent(EVENTS.MESSAGE_SENT, payload);

    // 2. Sincronizar con Chatwoot si aplica
    if (payload.source === 'app' || payload.source === 'api') {
      try {
        await executeSkill('sync_chatwoot_outgoing', {
          tenantId: payload.tenantId,
          conversationId: payload.conversationId,
          content: payload.contenido || payload.content || '',
          messageId: payload.messageId
        });
      } catch (err) {
        console.error('[AutomationListener] Error sincronizando mensaje saliente con Chatwoot:', err);
      }
    }
  });

  eventBus.onEvent(EVENTS.MESSAGE_RECEIVED, async (payload) => {
    console.log(`[AutomationListener] Recibido MESSAGE_RECEIVED para tenant ${payload.tenantId}`);
    // Ejecutar chatbot si aplica
    try {
      await executeSkill('execute_chatbot_response', payload as any);
    } catch (err) {
      console.error('[AutomationListener] Error ejecutando chatbot skill:', err);
    }
    // También procesar como evento genérico de automatización si tuviera trigger
    return handleEvent(EVENTS.MESSAGE_RECEIVED, payload);
  });

  // Payments
  eventBus.onEvent(EVENTS.PAYMENT_RECEIVED, (payload) => handleEvent(EVENTS.PAYMENT_RECEIVED, payload));
  eventBus.onEvent(EVENTS.PAYMENT_FAILED, (payload) => handleEvent(EVENTS.PAYMENT_FAILED, payload));

  // Workflows
  eventBus.onEvent(EVENTS.WORKFLOW_EXECUTED, (payload) => handleEvent(EVENTS.WORKFLOW_EXECUTED, payload));
  eventBus.onEvent(EVENTS.WORKFLOW_FAILED, (payload) => handleEvent(EVENTS.WORKFLOW_FAILED, payload));

  console.log('✅ [AutomationListener] Listeners inicializados:', Object.keys(EVENT_TO_TRIGGER_MAP).length, 'eventos conectados');
}

/**
 * Verifica estado del listener (para debugging)
 */
export function getAutomationListenerStatus(): {
  mappedEvents: string[];
  eventBusListenerCount: number;
} {
  return {
    mappedEvents: Object.keys(EVENT_TO_TRIGGER_MAP),
    eventBusListenerCount: eventBus.listenerCount(EVENTS.LEAD_CREATED),
  };
}

// Exportar mapeo para referencia
export { EVENT_TO_TRIGGER_MAP };
