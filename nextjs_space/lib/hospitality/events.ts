import { eventBus, EVENTS } from '../skills/event-bus';
import type { HospitalityReservationEvent, HospitalityCleaningEvent } from '../types/events';

/**
 * Emisores de eventos de Hospitality (plan maestro §22).
 *
 * Los eventos se publican en el EventBus en memoria; el bridge
 * (lib/hospitality/automation-bridge.ts) los reenvía al AutomationRuleEngine.
 * Nunca lanzan excepciones: un fallo al emitir se registra y no interrumpe
 * la operación que lo disparó.
 */

function buildReservationEvent(params: {
  tenantId: string;
  reservationId: string;
  propertyId?: string | null;
  unitId?: string | null;
  contactId?: string | null;
  channel?: string | null;
  externalBookingId?: string | null;
  estado?: string | null;
  checkIn?: Date | null;
  checkOut?: Date | null;
  guestData?: unknown;
  source: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}): HospitalityReservationEvent {
  return {
    tenantId: params.tenantId,
    reservationId: params.reservationId,
    propertyId: params.propertyId || undefined,
    unitId: params.unitId || undefined,
    contactId: params.contactId || undefined,
    channel: params.channel || undefined,
    externalBookingId: params.externalBookingId || undefined,
    estado: params.estado || undefined,
    checkIn: params.checkIn ? params.checkIn.toISOString() : undefined,
    checkOut: params.checkOut ? params.checkOut.toISOString() : undefined,
    guestData: (params.guestData as Record<string, unknown>) || undefined,
    timestamp: new Date(),
    source: params.source,
  };
}

export function emitReservationCreated(params: Omit<Parameters<typeof buildReservationEvent>[0], 'source'>) {
  try {
    eventBus.emitEvent(EVENTS.HOSPITALITY_RESERVATION_CREATED, buildReservationEvent({ ...params, source: 'webhook' }));
  } catch (e) {
    console.error('[Hospitality] Error emitiendo reservation_created:', e);
  }
}

export function emitReservationModified(params: Omit<Parameters<typeof buildReservationEvent>[0], 'source'>) {
  try {
    eventBus.emitEvent(EVENTS.HOSPITALITY_RESERVATION_MODIFIED, buildReservationEvent({ ...params, source: 'webhook' }));
  } catch (e) {
    console.error('[Hospitality] Error emitiendo reservation_modified:', e);
  }
}

export function emitReservationCancelled(params: Omit<Parameters<typeof buildReservationEvent>[0], 'source'>) {
  try {
    eventBus.emitEvent(EVENTS.HOSPITALITY_RESERVATION_CANCELLED, buildReservationEvent({ ...params, source: 'webhook' }));
  } catch (e) {
    console.error('[Hospitality] Error emitiendo reservation_cancelled:', e);
  }
}

export function emitReservationCheckedIn(params: Omit<Parameters<typeof buildReservationEvent>[0], 'source'>) {
  try {
    eventBus.emitEvent(EVENTS.HOSPITALITY_RESERVATION_CHECKED_IN, buildReservationEvent({ ...params, source: 'app' }));
  } catch (e) {
    console.error('[Hospitality] Error emitiendo reservation_checked_in:', e);
  }
}

export function emitReservationCheckedOut(params: Omit<Parameters<typeof buildReservationEvent>[0], 'source'>) {
  try {
    eventBus.emitEvent(EVENTS.HOSPITALITY_RESERVATION_CHECKED_OUT, buildReservationEvent({ ...params, source: 'app' }));
  } catch (e) {
    console.error('[Hospitality] Error emitiendo reservation_checked_out:', e);
  }
}

export function emitCleaningCompleted(params: {
  tenantId: string;
  taskId?: string | null;
  propertyId?: string | null;
  unitId?: string | null;
  reservationId?: string | null;
  unitNombre?: string | null;
}) {
  try {
    const payload: HospitalityCleaningEvent = {
      tenantId: params.tenantId,
      taskId: params.taskId || undefined,
      propertyId: params.propertyId || undefined,
      unitId: params.unitId || undefined,
      reservationId: params.reservationId || undefined,
      unitNombre: params.unitNombre || undefined,
      timestamp: new Date(),
      source: 'app',
    };
    eventBus.emitEvent(EVENTS.HOSPITALITY_CLEANING_COMPLETED, payload);
  } catch (e) {
    console.error('[Hospitality] Error emitiendo cleaning_completed:', e);
  }
}

export function emitCheckinDue(params: {
  tenantId: string;
  reservationId: string;
  propertyId?: string | null;
  unitId?: string | null;
  contactId?: string | null;
  channel?: string | null;
  externalBookingId?: string | null;
  checkIn?: Date | null;
  checkOut?: Date | null;
  guestData?: unknown;
}) {
  try {
    eventBus.emitEvent(EVENTS.HOSPITALITY_CHECKIN_DUE, buildReservationEvent({ ...params, source: 'automation' }));
  } catch (e) {
    console.error('[Hospitality] Error emitiendo checkin_due:', e);
  }
}