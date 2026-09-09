import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  connectivityMapping: {
    findFirst: vi.fn(),
  },
  hospitalityReservation: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  contact: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  hospitalityWebhookEvent: {
    create: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    connectivityMapping: hoisted.connectivityMapping,
    hospitalityReservation: hoisted.hospitalityReservation,
    contact: hoisted.contact,
    hospitalityWebhookEvent: hoisted.hospitalityWebhookEvent,
  },
}));

import {
  processReservationWebhook,
  processBook,
  processModify,
  processCancel,
  type WebhookReservationPayload,
} from '@/lib/hospitality/reservations';

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const PROPERTY_A = 'prop_a';
const UNIT_A = 'unit_a';

function mappingActivo(tenantId: string, propertyId: string, unitId: string | null) {
  return {
    id: 'map_1',
    tenantId,
    externalPropertyId: 'hotel-123',
    externalUnitCode: 'suite',
    property: { id: propertyId, tenantId },
    unit: unitId ? { id: unitId } : null,
  };
}

function payload(overrides: Partial<WebhookReservationPayload> = {}): WebhookReservationPayload {
  return {
    action: 'book',
    hotelCode: 'hotel-123',
    channel: 'airbnb',
    bookingId: 'BKG-999',
    cmBookingId: 'CM-111',
    bookedOn: '2026-09-01 10:00:00',
    checkin: '2026-10-10',
    checkout: '2026-10-15',
    segment: 'OTA',
    specialRequests: 'Airport taxi required',
    pah: false,
    amount: {
      amountAfterTax: 1204,
      amountBeforeTax: 1075,
      tax: 129,
      currency: 'USD',
      commission: 215,
    },
    guest: {
      firstName: 'María',
      lastName: 'García',
      email: 'maria@example.com',
      phone: '+5215500001111',
    },
    rooms: [
      {
        roomCode: 'suite',
        rateplanCode: 'suite-ep',
        guestName: 'María García',
        occupancy: { adults: 2, children: 1 },
        prices: [
          { date: '2026-10-10', sellRate: 215 },
          { date: '2026-10-11', sellRate: 215 },
        ],
      },
    ],
    ...overrides,
  };
}

function reservationFila(overrides: Record<string, unknown> = {}) {
  return {
    id: 'res_1',
    tenantId: TENANT_A,
    propertyId: PROPERTY_A,
    unitId: UNIT_A,
    contactId: null,
    channel: 'airbnb',
    externalBookingId: 'BKG-999',
    cmBookingId: 'CM-111',
    action: 'book',
    estado: 'confirmed',
    checkIn: new Date('2026-10-10'),
    checkOut: new Date('2026-10-15'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.connectivityMapping.findFirst.mockResolvedValue(mappingActivo(TENANT_A, PROPERTY_A, UNIT_A));
  hoisted.hospitalityReservation.create.mockResolvedValue(reservationFila());
  hoisted.hospitalityReservation.update.mockResolvedValue(reservationFila());
  hoisted.hospitalityWebhookEvent.create.mockResolvedValue({ id: 'evt_1' });
});

describe('Hospitality — Reservation Engine (webhook)', () => {
  it('book crea la reserva y el huésped, y registra el evento bruto', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
    hoisted.contact.findFirst.mockResolvedValue(null);
    hoisted.contact.create.mockResolvedValue({ id: 'contact_1' });

    const result = await processReservationWebhook(payload());

    expect(result.ok).toBe(true);
    expect(result.status).toBe('creada');

    // El create recibe los datos normalizados del contrato
    const created = hoisted.hospitalityReservation.create.mock.calls[0][0].data;
    expect(created.channel).toBe('airbnb');
    expect(created.externalBookingId).toBe('BKG-999');
    expect(created.checkIn.toISOString().slice(0, 10)).toBe('2026-10-10');
    expect(created.checkOut.toISOString().slice(0, 10)).toBe('2026-10-15');
    expect(created.specialRequests).toBe('Airport taxi required');
    expect(created.amountAfterTax).toBe(1204);
    expect(created.currency).toBe('USD');
    expect(created.occupancyAdults).toBe(2);
    expect(created.occupancyChildren).toBe(1);

    // El huésped se crea en el CRM
    const guestData = hoisted.contact.create.mock.calls[0][0].data;
    expect(guestData.tenantId).toBe(TENANT_A);
    expect(guestData.email).toBe('maria@example.com');

    // Evento bruto registrado
    expect(hoisted.hospitalityWebhookEvent.create).toHaveBeenCalled();
    const eventData = hoisted.hospitalityWebhookEvent.create.mock.calls[0][0].data;
    expect(eventData.estado).toBe('procesado');
    expect(eventData.bookingId).toBe('BKG-999');
  });

  it('book duplicado (mismo bookingId) NO crea una segunda reserva', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(reservationFila());

    const result = await processReservationWebhook(payload());

    expect(result.ok).toBe(true);
    expect(result.status).toBe('duplicado');
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
    expect(hoisted.contact.create).not.toHaveBeenCalled();
    // El evento se registra como duplicado
    expect(hoisted.hospitalityWebhookEvent.create).toHaveBeenCalled();
    expect(hoisted.hospitalityWebhookEvent.create.mock.calls[0][0].data.estado).toBe('duplicado');
  });

  it('modify REEMPLAZA el estado completo (no mezcla) y conserva el estado operado', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(
      reservationFila({ estado: 'confirmed', specialRequests: 'OLD REQUEST' })
    );

    const result = await processReservationWebhook(
      payload({
        action: 'modify',
        checkin: '2026-11-01',
        checkout: '2026-11-05',
        specialRequests: 'NEW REQUEST',
      })
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('actualizada');

    const updated = hoisted.hospitalityReservation.update.mock.calls[0][0].data;
    expect(updated.checkIn.toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(updated.checkOut.toISOString().slice(0, 10)).toBe('2026-11-05');
    expect(updated.specialRequests).toBe('NEW REQUEST');
    // El payload completo nuevo reemplaza (incluye action modify)
    expect(updated.action).toBe('modify');
  });

  it('modify de una reserva checked_in conserva su estado operativo', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(
      reservationFila({ estado: 'checked_in' })
    );

    await processReservationWebhook(payload({ action: 'modify' }));

    const updated = hoisted.hospitalityReservation.update.mock.calls[0][0].data;
    expect(updated.estado).toBe('checked_in');
  });

  it('cancel localiza por bookingId, cambia estado y conserva historial', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(reservationFila());

    const result = await processReservationWebhook(payload({ action: 'cancel' }));

    expect(result.ok).toBe(true);
    expect(result.status).toBe('cancelada');
    const updated = hoisted.hospitalityReservation.update.mock.calls[0][0].data;
    expect(updated.estado).toBe('cancelled');
    expect(updated.action).toBe('cancel');
    // No borra la fila
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
  });

  it('cancel de reserva inexistente responde no_encontrada', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);

    const result = await processReservationWebhook(payload({ action: 'cancel' }));

    expect(result.ok).toBe(false);
    expect(result.status).toBe('no_encontrada');
  });

  it('huésped sin email ni teléfono: la reserva se crea igual (datos opcionales)', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);

    const result = await processReservationWebhook(
      payload({
        guest: {
          firstName: null,
          lastName: null,
          email: null,
          phone: null,
        },
        rooms: [{ roomCode: 'suite', guestName: null, occupancy: { adults: 1, children: 0 }, prices: [] }],
      })
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('creada');
    // No se crea contacto (no hay datos), pero la reserva sí
    expect(hoisted.contact.create).not.toHaveBeenCalled();
    expect(hoisted.hospitalityReservation.create).toHaveBeenCalled();
  });

  it('sin mapping activo para el hotelCode → error, sin crear nada', async () => {
    hoisted.connectivityMapping.findFirst.mockResolvedValue(null);

    const result = await processReservationWebhook(payload());

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
    // El evento bruto registra el error (no se pierde para diagnóstico)
    expect(hoisted.hospitalityWebhookEvent.create).toHaveBeenCalled();
  });

  it('aísla por tenant: un mismo bookingId de tenant B no choca con tenant A', async () => {
    // Este test valida que la búsqueda de idempotencia filtra por tenantId+channel
    hoisted.connectivityMapping.findFirst.mockResolvedValue(
      mappingActivo(TENANT_B, 'prop_b', null)
    );
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);

    const result = await processReservationWebhook(payload());

    expect(result.ok).toBe(true);
    // La clave de idempotencia usada en la búsqueda es del tenant B
    const where = hoisted.hospitalityReservation.findUnique.mock.calls[0][0].where
      .tenantId_channel_externalBookingId;
    expect(where.tenantId).toBe(TENANT_B);
    expect(where.channel).toBe('airbnb');
    expect(where.externalBookingId).toBe('BKG-999');
  });

  it('procesa directamente con processBook/processCancel (helpers exportados)', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
    hoisted.contact.findFirst.mockResolvedValue(null);
    hoisted.contact.create.mockResolvedValue({ id: 'c1' });

    const r1 = await processBook(TENANT_A, PROPERTY_A, UNIT_A, payload());
    expect(r1.status).toBe('creada');

    hoisted.hospitalityReservation.findUnique.mockResolvedValue(reservationFila());
    const r2 = await processCancel(TENANT_A, payload({ action: 'cancel' }));
    expect(r2.status).toBe('cancelada');
  });
});