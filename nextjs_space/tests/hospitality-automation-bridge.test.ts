import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests del bridge de eventos de Hospitality (plan maestro §22):
 *   - setupHospitalityEventBridge registra los 9 triggers
 *   - Emitir un evento de Hospitality llega al AutomationRuleEngine
 *   - Los emisores construyen el payload correcto y nunca lanzan
 */

const mockProcessEvent = vi.hoisted(() => vi.fn());

vi.mock('@/lib/marketing/automation/rule-engine', () => ({
  AutomationRuleEngine: { processEvent: (...a: any[]) => mockProcessEvent(...a) },
}));

import { eventBus } from '../lib/skills/event-bus';
import { EVENTS } from '../lib/types/events';
import { setupHospitalityEventBridge } from '../lib/hospitality/automation-bridge';
import {
  emitReservationCreated,
  emitReservationCheckedOut,
  emitCleaningCompleted,
  emitCheckinDue,
} from '../lib/hospitality/events';

const tick = () => new Promise((r) => setTimeout(r, 10));

describe('Hospitality Automation Bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessEvent.mockResolvedValue({ matched: 0 });
  });

  afterEach(() => {
    eventBus.removeAllListeners();
  });

  it('registra un listener por cada trigger de Hospitality', () => {
    setupHospitalityEventBridge();
    const triggers = [
      EVENTS.HOSPITALITY_RESERVATION_CREATED,
      EVENTS.HOSPITALITY_RESERVATION_MODIFIED,
      EVENTS.HOSPITALITY_RESERVATION_CANCELLED,
      EVENTS.HOSPITALITY_RESERVATION_CHECKED_IN,
      EVENTS.HOSPITALITY_RESERVATION_CHECKED_OUT,
      EVENTS.HOSPITALITY_CHECKIN_DUE,
      EVENTS.HOSPITALITY_CLEANING_COMPLETED,
      EVENTS.HOSPITALITY_MAINTENANCE_CREATED,
      EVENTS.HOSPITALITY_MAINTENANCE_COMPLETED,
    ];
    for (const t of triggers) {
      expect(eventBus.listenerCount(t)).toBe(1);
    }
  });

  it('reenvía el evento al AutomationRuleEngine con el trigger y payload', async () => {
    setupHospitalityEventBridge();

    emitReservationCreated({
      tenantId: 't1',
      reservationId: 'hres_1',
      propertyId: 'hprop_1',
      unitId: 'hunit_1',
      channel: 'Booking.com',
      checkIn: new Date('2026-11-01T00:00:00Z'),
      checkOut: new Date('2026-11-05T00:00:00Z'),
      guestData: { nombre: 'John Smith' },
    });

    await tick();

    expect(mockProcessEvent).toHaveBeenCalledTimes(1);
    const [trigger, payload] = mockProcessEvent.mock.calls[0];
    expect(trigger).toBe(EVENTS.HOSPITALITY_RESERVATION_CREATED);
    expect(payload).toMatchObject({
      tenantId: 't1',
      reservationId: 'hres_1',
      channel: 'Booking.com',
      source: 'webhook',
    });
    expect(payload.checkIn).toBe('2026-11-01T00:00:00.000Z');
  });

  it('un fallo del engine no propaga la excepción al emisor', async () => {
    setupHospitalityEventBridge();
    mockProcessEvent.mockRejectedValueOnce(new Error('redis caído'));

    expect(() =>
      emitReservationCheckedOut({ tenantId: 't1', reservationId: 'hres_2' })
    ).not.toThrow();

    await tick();
    expect(mockProcessEvent).toHaveBeenCalledTimes(1);
  });

  it('emite cleaning_completed y checkin_due con sus triggers', async () => {
    setupHospitalityEventBridge();

    emitCleaningCompleted({ tenantId: 't1', taskId: 'task1', unitId: 'hunit_1', unitNombre: 'Suite Océano' });
    emitCheckinDue({ tenantId: 't1', reservationId: 'hres_3', checkIn: new Date('2026-11-01T00:00:00Z') });
    await tick();

    const triggers = mockProcessEvent.mock.calls.map((c) => c[0]);
    expect(triggers).toContain(EVENTS.HOSPITALITY_CLEANING_COMPLETED);
    expect(triggers).toContain(EVENTS.HOSPITALITY_CHECKIN_DUE);
  });
});