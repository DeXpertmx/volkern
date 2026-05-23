import { describe, it, expect } from 'vitest';
import { EVENTS } from '@/lib/types/events';

describe('EVENTS', () => {
  it('debe ser un objeto', () => {
    expect(typeof EVENTS).toBe('object');
    expect(EVENTS).not.toBeNull();
  });

  it('debe tener eventos de Contactos', () => {
    expect(EVENTS.CONTACT_CREATED).toBe('contact_created');
    expect(EVENTS.CONTACT_UPDATED).toBe('contact_updated');
    expect(EVENTS.CONTACT_DELETED).toBe('contact_deleted');
  });

  it('debe tener eventos de Leads', () => {
    expect(EVENTS.LEAD_CREATED).toBe('lead_created');
    expect(EVENTS.LEAD_UPDATED).toBe('lead_updated');
    expect(EVENTS.LEAD_CONVERTED).toBe('lead_converted');
    expect(EVENTS.LEAD_QUALIFIED).toBe('lead_qualified');
  });

  it('debe tener eventos de Conversaciones', () => {
    expect(EVENTS.CONVERSATION_CREATED).toBe('conversation_created');
    expect(EVENTS.CONVERSATION_CLOSED).toBe('conversation_closed');
    expect(EVENTS.MESSAGE_SENT).toBe('message_sent');
    expect(EVENTS.MESSAGE_RECEIVED).toBe('message_received');
  });

  it('debe tener eventos de Citas/Bookings', () => {
    expect(EVENTS.BOOKING_CREATED).toBe('booking_created');
    expect(EVENTS.BOOKING_CONFIRMED).toBe('booking_confirmed');
    expect(EVENTS.BOOKING_CANCELLED).toBe('booking_cancelled');
    expect(EVENTS.BOOKING_COMPLETED).toBe('booking_completed');
  });

  it('debe tener eventos de Deals', () => {
    expect(EVENTS.DEAL_CREATED).toBe('deal_created');
    expect(EVENTS.DEAL_UPDATED).toBe('deal_updated');
    expect(EVENTS.DEAL_STAGE_CHANGED).toBe('deal_stage_changed');
    expect(EVENTS.DEAL_WON).toBe('deal_won');
    expect(EVENTS.DEAL_LOST).toBe('deal_lost');
  });

  it('debe tener eventos de Pagos e Invoicing', () => {
    expect(EVENTS.PAYMENT_RECEIVED).toBe('payment_received');
    expect(EVENTS.PAYMENT_FAILED).toBe('payment_failed');
    expect(EVENTS.INVOICE_CREATED).toBe('invoice_created');
  });

  it('debe tener eventos de Workflows/n8n', () => {
    expect(EVENTS.WORKFLOW_EXECUTED).toBe('workflow_executed');
    expect(EVENTS.WORKFLOW_FAILED).toBe('workflow_failed');
  });

  it('debe tener eventos de Inventario', () => {
    expect(EVENTS.INVENTORY_LOW_STOCK).toBe('inventory_low_stock');
    expect(EVENTS.INVENTORY_OUT_OF_STOCK).toBe('inventory_out_of_stock');
    expect(EVENTS.INVENTORY_RESTOCKED).toBe('inventory_restocked');
  });

  it('debe tener eventos de Producción', () => {
    expect(EVENTS.PRODUCTION_ORDER_CREATED).toBe('production_order_created');
    expect(EVENTS.PRODUCTION_ORDER_STARTED).toBe('production_order_started');
    expect(EVENTS.PRODUCTION_ORDER_COMPLETED).toBe('production_order_completed');
    expect(EVENTS.PRODUCTION_ORDER_CANCELLED).toBe('production_order_cancelled');
  });

  it('debe tener eventos de Soporte', () => {
    expect(EVENTS.SUPPORT_TICKET_CREATED).toBe('support_ticket_created');
    expect(EVENTS.SUPPORT_TICKET_ASSIGNED).toBe('support_ticket_assigned');
    expect(EVENTS.SUPPORT_TICKET_RESOLVED).toBe('support_ticket_resolved');
    expect(EVENTS.SUPPORT_SLA_WARNING).toBe('support_sla_warning');
    expect(EVENTS.SUPPORT_SLA_BREACHED).toBe('support_sla_breached');
  });

  it('debe tener eventos de Marketing', () => {
    expect(EVENTS.CAMPAIGN_STARTED).toBe('campaign_started');
    expect(EVENTS.EMAIL_OPENED).toBe('email_opened');
    expect(EVENTS.EMAIL_CLICKED).toBe('email_clicked');
    expect(EVENTS.EMAIL_BOUNCED).toBe('email_bounced');
  });

  it('debe tener eventos de RRHH', () => {
    expect(EVENTS.EMPLOYEE_CREATED).toBe('employee_created');
    expect(EVENTS.EMPLOYEE_TERMINATED).toBe('employee_terminated');
    expect(EVENTS.EVALUATION_COMPLETED).toBe('evaluation_completed');
    expect(EVENTS.TRAINING_COMPLETED).toBe('training_completed');
  });

  it('debe tener eventos de Finanzas', () => {
    expect(EVENTS.INVOICE_DUE).toBe('invoice_due');
    expect(EVENTS.INVOICE_OVERDUE).toBe('invoice_overdue');
    expect(EVENTS.EXPENSE_SUBMITTED).toBe('expense_submitted');
    expect(EVENTS.PAYROLL_GENERATED).toBe('payroll_generated');
  });

  it('debe tener eventos de Calidad', () => {
    expect(EVENTS.INSPECTION_COMPLETED).toBe('inspection_completed');
    expect(EVENTS.NON_CONFORMITY_CREATED).toBe('non_conformity_created');
  });

  it('debe tener eventos de Proyectos', () => {
    expect(EVENTS.MILESTONE_REACHED).toBe('milestone_reached');
    expect(EVENTS.PROJECT_STARTED).toBe('project_started');
    expect(EVENTS.PROJECT_COMPLETED).toBe('project_completed');
  });

  it('debe tener eventos genéricos', () => {
    expect(EVENTS.RESOURCE_CREATED).toBe('resource_created');
    expect(EVENTS.RESOURCE_UPDATED).toBe('resource_updated');
    expect(EVENTS.RESOURCE_DELETED).toBe('resource_deleted');
  });

  it('todos los valores deben ser únicos', () => {
    const values = Object.values(EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('todas las claves deben ser UPPER_SNAKE_CASE', () => {
    const keys = Object.keys(EVENTS);
    for (const key of keys) {
      expect(key).toMatch(/^[A-Z][A-Z_]+$/);
    }
  });

  it('todos los valores deben ser snake_case', () => {
    const values = Object.values(EVENTS);
    for (const value of values) {
      expect(value).toMatch(/^[a-z][a-z0-9_]+$/);
    }
  });
});
