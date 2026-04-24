import { eventBus, EVENTS } from '@/lib/skills/event-bus';
import { ConnectService } from './connect-service';
import { GemmaConnectService } from './gemma-connect-service';
import { 
  LeadCreatedEvent, 
  PaymentReceivedEvent, 
  InvoiceCreatedEvent, 
  DealWonEvent,
  TaskCompletedEvent,
  BookingCreatedEvent,
  EventType,
  BaseEventPayload
} from '@/lib/types/events';

export function initConnectEventBridge() {
  console.log('🔗 [ConnectBridge] Inicializando puente de eventos Connect...');

  // Helper para notificar y analizar
  const bridge = async (event: string, payload: any, channel: string, message: string, attribution: any) => {
    await ConnectService.notifySystem(payload.tenantId, channel, message, attribution);
    await GemmaConnectService.analyzeEvent(event, payload);
  };

  // --- VENTAS ---
  
  // Nuevo Lead
  eventBus.onEvent(EVENTS.LEAD_CREATED, async (payload: LeadCreatedEvent) => {
    await bridge(EVENTS.LEAD_CREATED, payload, 'Ventas', 
      `🆕 **Nuevo Lead**: ${payload.nombre} registrado vía ${payload.source.toUpperCase()}.`,
      { entityType: 'LEAD', entityId: payload.leadId }
    );
  });

  // Cambio de Etapa en Deal
  eventBus.onEvent(EVENTS.DEAL_STAGE_CHANGED, async (payload: any) => {
    await bridge(EVENTS.DEAL_STAGE_CHANGED, payload, 'Ventas',
      `📈 **Actualización de Deal**: El trato #${payload.dealId.slice(-4)} ha pasado a la etapa **${payload.newStage}** (Valor: ${payload.valor}).`,
      { entityType: 'DEAL', entityId: payload.dealId }
    );
  });

  // --- FINANZAS ---

  // Factura Generada
  eventBus.onEvent(EVENTS.INVOICE_CREATED, async (payload: InvoiceCreatedEvent) => {
    await bridge(EVENTS.INVOICE_CREATED, payload, 'Finanzas',
      `📄 **Factura Creada**: Se ha generado la factura ${payload.numero} por un total de **${payload.monto} ${payload.moneda}**.`,
      { entityType: 'INVOICE', entityId: payload.invoiceId }
    );
  });

  // Pago Recibido
  eventBus.onEvent(EVENTS.PAYMENT_RECEIVED, async (payload: PaymentReceivedEvent) => {
    await bridge(EVENTS.PAYMENT_RECEIVED, payload, 'Finanzas',
      `💰 **Pago Confirmado**: Recibido abono de **${payload.monto || (payload as any).amount} ${payload.moneda || (payload as any).currency}**.`,
      { entityType: 'PAYMENT', entityId: payload.paymentId }
    );
  });

  // --- OPERACIONES / AGENDA ---

  // Nueva Cita
  eventBus.onEvent(EVENTS.BOOKING_CREATED, async (payload: BookingCreatedEvent) => {
    await bridge(EVENTS.BOOKING_CREATED, payload, 'Operaciones',
      `📅 **Nueva Cita**: ${payload.titulo} programada para el ${new Date(payload.fechaHora).toLocaleString()}.`,
      { entityType: 'BOOKING', entityId: payload.bookingId }
    );
  });

  // Tarea Completada
  eventBus.onEvent(EVENTS.TASK_COMPLETED, async (payload: TaskCompletedEvent) => {
    await bridge(EVENTS.TASK_COMPLETED, payload, 'Operaciones',
      `✅ **Tarea Completada**: ${payload.titulo || 'Sin título'}.`,
      { entityType: 'TASK', entityId: payload.taskId }
    );
  });

  // --- ERRORES / ALERTAS ---
  
  eventBus.onEvent(EVENTS.WORKFLOW_FAILED, async (payload: any) => {
    await bridge(EVENTS.WORKFLOW_FAILED, payload, 'General',
      `⚠️ **Fallo en Automatización**: El flujo "${payload.workflowName || payload.workflowId}" ha fallado. Error: ${payload.error}`,
      { entityType: 'WORKFLOW', entityId: payload.workflowId }
    );
  });
}
