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
  WorkflowExecutedEvent,
  WorkflowFailedEvent,
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
      const wfPayload = payload as WorkflowExecutedEvent;
      return {
        ...baseContext,
        workflowId: wfPayload.workflowId,
        workflowName: wfPayload.workflowName,
        executionId: wfPayload.executionId,
        result: wfPayload.result,
      };
    }

    case EVENTS.WORKFLOW_FAILED: {
      const wfPayload = payload as WorkflowFailedEvent;
      return {
        ...baseContext,
        workflowId: wfPayload.workflowId,
        workflowName: wfPayload.workflowName,
        executionId: wfPayload.executionId,
        error: wfPayload.error,
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
