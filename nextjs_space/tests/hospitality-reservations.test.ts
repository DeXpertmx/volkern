import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  connectivityMapping: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  hospitalityReservation: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  hospitalityUnit: {
    findMany: vi.fn(),
  },
  hospitalitySyncLog: {
    create: vi.fn(),
  },
  contact: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  hospitalityWebhookEvent: {
    create: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  aplicarPenalizacionNoShow: vi.fn(),
  user: {
    findMany: vi.fn(),
  },
  tenant: {
    findUnique: vi.fn(),
  },
  testConnectivityConnection: vi.fn(),
  sendPushNotification: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    connectivityMapping: hoisted.connectivityMapping,
    hospitalityReservation: hoisted.hospitalityReservation,
    hospitalityUnit: hoisted.hospitalityUnit,
    hospitalitySyncLog: hoisted.hospitalitySyncLog,
    contact: hoisted.contact,
    hospitalityWebhookEvent: hoisted.hospitalityWebhookEvent,
    auditLog: hoisted.auditLog,
    user: hoisted.user,
    tenant: hoisted.tenant,
  },
}));

vi.mock('@/lib/hospitality/connectivity', () => ({
  testConnectivityConnection: hoisted.testConnectivityConnection,
}));

// El aviso al operador se importa dinámicamente desde el webhook.
vi.mock('@/lib/services/push-notification', () => ({
  sendPushNotification: hoisted.sendPushNotification,
}));

// El emisor de la penalización (regla 8) lo importa dinámicamente processNoShow.
vi.mock('@/lib/hospitality/penalizaciones', () => ({
  aplicarPenalizacionNoShow: hoisted.aplicarPenalizacionNoShow,
}));

import {
  processReservationWebhook,
  processBook,
  processCancel,
  registrarReservaPartida,
  externalIdDeParte,
  payloadDeHabitacion,
  type WebhookReservationPayload,
} from '@/lib/hospitality/reservations';

const TENANT_A = 'tenant_a';
const TENANT_B = 'tenant_b';
const PROPERTY_A = 'prop_a';
const UNIT_A = 'unit_a';

function mappingActivo(
  tenantId: string,
  propertyId: string,
  unitId: string | null,
  unitCode: string | null = 'suite',
  rateplanCode: string | null = null,
  id = 'map_1'
) {
  return {
    id,
    tenantId,
    externalPropertyId: 'hotel-123',
    externalUnitCode: unitCode,
    externalRatePlanCode: rateplanCode,
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
  hoisted.connectivityMapping.findMany.mockResolvedValue([mappingActivo(TENANT_A, PROPERTY_A, UNIT_A)]);
  hoisted.hospitalityReservation.create.mockResolvedValue(reservationFila());
  hoisted.hospitalityReservation.update.mockResolvedValue(reservationFila());
  hoisted.hospitalityWebhookEvent.create.mockResolvedValue({ id: 'evt_1' });
  hoisted.hospitalitySyncLog.create.mockResolvedValue({ id: 'sync_1' });
  // La vinculación automática consulta primero si el hotel es de otra cuenta.
  hoisted.connectivityMapping.findFirst.mockResolvedValue(null);
  // Los destinatarios del aviso se eligen por CAPACIDAD (§27), no por el
  // nombre del rol: cada candidato llega con su rol y lo filtra la misma regla
  // que autoriza en el servidor.
  hoisted.user.findMany.mockResolvedValue([
    { id: 'u_admin', role: { id: 'role-admin', nombre: 'Anfitrión', permisos: { all: true } } },
  ]);
  hoisted.sendPushNotification.mockResolvedValue({ success: true });
  hoisted.auditLog.create.mockResolvedValue({ id: 'audit_1' });
  // Divisa del hotel: es el respaldo cuando el canal no manda la suya.
  hoisted.tenant.findUnique.mockResolvedValue({ moneda: 'EUR' });
});

describe('Hospitality — divisa de la reserva entrante', () => {
  /**
   * El proveedor devuelve `amount.currency: null` en hoteles reales (medido el
   * 9-oct 2026: dos reservas de booking.com sin divisa). Antes se caía al
   * mínimo del esquema (MXN) y un hotel en euros veía sus reservas en pesos;
   * ahora el respaldo es la divisa del hotel, que quien procesa el payload sí
   * conoce. La del canal sigue ganando cuando viene.
   */
  async function crearConDivisa(divisa: string | null) {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
    hoisted.contact.findFirst.mockResolvedValue(null);
    hoisted.contact.create.mockResolvedValue({ id: 'contact_1' });

    const base = payload();
    const result = await processReservationWebhook(
      payload({ amount: { ...base.amount, currency: divisa } })
    );
    return {
      result,
      created: hoisted.hospitalityReservation.create.mock.calls[0]?.[0]?.data,
    };
  }

  it('sin divisa del canal, la reserva se guarda en la del hotel (no en el mínimo del esquema)', async () => {
    const { result, created } = await crearConDivisa(null);

    expect(result.ok).toBe(true);
    expect(created.currency).toBe('EUR');
  });

  it('la divisa del canal gana cuando viene', async () => {
    const { created } = await crearConDivisa('USD');

    expect(created.currency).toBe('USD');
  });

  it('sin divisa del canal ni moneda legible del hotel, cae al mínimo del esquema (nunca se inventa una)', async () => {
    hoisted.tenant.findUnique.mockResolvedValue(null);

    const { result, created } = await crearConDivisa(null);

    expect(result.ok).toBe(true);
    expect(created.currency).toBe('MXN');
  });

  it('si leer la moneda del hotel falla, la reserva entra igual (no se pierde por la divisa)', async () => {
    hoisted.tenant.findUnique.mockRejectedValue(new Error('BD caída'));
    const silencio = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result, created } = await crearConDivisa(null);

    silencio.mockRestore();
    expect(result.ok).toBe(true);
    expect(created.currency).toBe('MXN');
  });
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

  it('modify que confirma un hold deja la traza (origen canal) para la tasa de abandono', async () => {
    // El canal confirmó el hold: es el otro desenlace del ciclo, y sin su traza
    // la métrica de holds abandonados contaría solo los abandonos.
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(reservationFila({ estado: 'pending' }));

    await processReservationWebhook(payload({ action: 'modify' }));

    const { data } = hoisted.auditLog.create.mock.calls[0][0];
    expect(data.accion).toBe('hospitality_hold_confirmado');
    expect(data.metadata).toMatchObject({
      reservationId: 'res_1',
      propertyId: PROPERTY_A,
      channel: 'airbnb',
      origen: 'canal',
    });
  });

  it('modify de una reserva que ya estaba confirmada no escribe la traza', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(reservationFila({ estado: 'confirmed' }));

    await processReservationWebhook(payload({ action: 'modify' }));

    expect(hoisted.auditLog.create).not.toHaveBeenCalled();
  });

  it('si el hold no acaba confirmado no hay traza de rescate', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(reservationFila({ estado: 'pending' }));
    hoisted.hospitalityReservation.update.mockResolvedValue(reservationFila({ estado: 'cancelled' }));

    await processReservationWebhook(payload({ action: 'modify' }));

    expect(hoisted.auditLog.create).not.toHaveBeenCalled();
  });

  it('un fallo escribiendo la traza no tumba el webhook', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(reservationFila({ estado: 'pending' }));
    hoisted.auditLog.create.mockRejectedValue(new Error('BD caída'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await processReservationWebhook(payload({ action: 'modify' }));

    expect(result.ok).toBe(true);
    expect(result.status).toBe('actualizada');
    error.mockRestore();
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
    // Sin partes derivadas del booking (registro partido).
    hoisted.hospitalityReservation.findMany.mockResolvedValue([]);

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
    hoisted.connectivityMapping.findMany.mockResolvedValue([]);

    const result = await processReservationWebhook(payload());

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.error).toContain('Sin mapping activo');
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
    // El evento bruto registra el error (no se pierde para diagnóstico)
    expect(hoisted.hospitalityWebhookEvent.create).toHaveBeenCalled();
  });

  it('usa rooms[0].roomCode para elegir la unidad (no la primera del hotel)', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([
      mappingActivo(TENANT_A, PROPERTY_A, 'unit_suite', 'suite', null, 'map_suite'),
      mappingActivo(TENANT_A, PROPERTY_A, 'unit_exec', 'executive', null, 'map_exec'),
    ]);
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
    hoisted.contact.findFirst.mockResolvedValue(null);
    hoisted.contact.create.mockResolvedValue({ id: 'contact_1' });

    const result = await processReservationWebhook(
      payload({
        rooms: [
          {
            // Mayúsculas/espacios de la OTA no deben impedir el match.
            roomCode: '  Executive ',
            rateplanCode: 'executive-s-ep',
            guestName: 'María García',
            occupancy: { adults: 2, children: 1 },
            prices: [],
          },
        ],
      })
    );

    expect(result.status).toBe('creada');
    const created = hoisted.hospitalityReservation.create.mock.calls[0][0].data;
    expect(created.unitId).toBe('unit_exec');
  });

  it('desempata por rateplanCode cuando varios mappings fijan el mismo roomCode', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([
      mappingActivo(TENANT_A, PROPERTY_A, 'unit_ep', 'suite', 'suite-ep', 'map_ep'),
      mappingActivo(TENANT_A, PROPERTY_A, 'unit_db', 'suite', 'suite-db', 'map_db'),
    ]);
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
    hoisted.contact.findFirst.mockResolvedValue(null);
    hoisted.contact.create.mockResolvedValue({ id: 'contact_1' });

    const result = await processReservationWebhook(
      payload({
        rooms: [{ roomCode: 'suite', rateplanCode: 'suite-db', guestName: null, occupancy: { adults: 2, children: 0 }, prices: [] }],
      })
    );

    expect(result.status).toBe('creada');
    const created = hoisted.hospitalityReservation.create.mock.calls[0][0].data;
    expect(created.unitId).toBe('unit_db');
  });

  it('rateplan desconocido no bloquea: sigue resolviendo el roomCode mapeado', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([
      mappingActivo(TENANT_A, PROPERTY_A, 'unit_ep', 'suite', 'suite-ep', 'map_ep'),
      mappingActivo(TENANT_A, PROPERTY_A, 'unit_db', 'suite', 'suite-db', 'map_db'),
    ]);
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
    hoisted.contact.findFirst.mockResolvedValue(null);
    hoisted.contact.create.mockResolvedValue({ id: 'contact_1' });

    const result = await processReservationWebhook(
      payload({
        rooms: [{ roomCode: 'suite', rateplanCode: 'suite-nueva', guestName: null, occupancy: { adults: 2, children: 0 }, prices: [] }],
      })
    );

    expect(result.status).toBe('creada');
    // Fallback determinista: el mapping sin restricción de tarifa / el primero.
    const created = hoisted.hospitalityReservation.create.mock.calls[0][0].data;
    expect(['unit_ep', 'unit_db']).toContain(created.unitId);
  });

  it('roomCode sin mapping → guardia: no adivina la unidad ni crea nada', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([
      mappingActivo(TENANT_A, PROPERTY_A, 'unit_suite', 'suite', null, 'map_suite'),
      mappingActivo(TENANT_A, PROPERTY_A, 'unit_exec', 'executive', null, 'map_exec'),
    ]);

    const result = await processReservationWebhook(
      payload({
        rooms: [{ roomCode: 'penthouse', rateplanCode: 'penthouse-ep', guestName: null, occupancy: { adults: 2, children: 0 }, prices: [] }],
      })
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.error).toContain('penthouse');
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
    expect(hoisted.contact.create).not.toHaveBeenCalled();
    // El evento bruto deja la traza para corregir el mapping.
    const eventData = hoisted.hospitalityWebhookEvent.create.mock.calls[0][0].data;
    expect(eventData.estado).toBe('sin_mapping');
    expect(eventData.errorMensaje).toContain('penthouse');
  });

  it('mapping a nivel propiedad (sin externalUnitCode) sigue creando la reserva', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([
      mappingActivo(TENANT_A, PROPERTY_A, UNIT_A, null, null, 'map_prop'),
    ]);
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
    hoisted.contact.findFirst.mockResolvedValue(null);
    hoisted.contact.create.mockResolvedValue({ id: 'contact_1' });

    const result = await processReservationWebhook(
      payload({
        rooms: [{ roomCode: 'otra-habitacion', rateplanCode: null, guestName: null, occupancy: { adults: 1, children: 0 }, prices: [] }],
      })
    );

    expect(result.status).toBe('creada');
    const created = hoisted.hospitalityReservation.create.mock.calls[0][0].data;
    expect(created.unitId).toBe(UNIT_A);
  });

  it('aísla por tenant: un mismo bookingId de tenant B no choca con tenant A', async () => {
    // Este test valida que la búsqueda de idempotencia filtra por tenantId+channel
    hoisted.connectivityMapping.findMany.mockResolvedValue([
      mappingActivo(TENANT_B, 'prop_b', null)
    ]);
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

  // ── Vía entrante del no-show (regla 7 + 8) ─────────────────────────────
  // El proveedor puede reportar que el huésped no se presentó con action
  // 'no_show'. El enganche es el mismo que el PATCH del operador: marca el
  // estado y emite la penalización con el emisor ya existente.

  /** Payload válido para processReservationWebhook con action no_show. */
  function payloadNoShow(overrides: Partial<WebhookReservationPayload> = {}) {
    return payload({ action: 'no_show' as any, bookingId: 'BKG-777', ...overrides });
  }

  /** La fila que findUnique devuelve en los tests de no_show. */
  function filaNoShow(overrides: Record<string, unknown> = {}) {
    return reservationFila({
      id: 'res_noshow',
      externalBookingId: 'BKG-777',
      estado: 'confirmed',
      checkIn: new Date('2026-10-10'),
      checkOut: new Date('2026-10-12'),
      channel: 'directa',
      amountAfterTax: 1000,
      currency: 'MXN',
      ...overrides,
      property: { politicaNoShow: null },
      items: [],
      payments: [],
    });
  }

  it('no_show entrante marca el estado, emite la penalización y empuja inventario', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(filaNoShow());
    hoisted.hospitalityReservation.update.mockResolvedValue({ ...filaNoShow(), estado: 'no_show' });
    hoisted.aplicarPenalizacionNoShow.mockResolvedValue({
      ok: true, emitida: true, importe: 500, moneda: 'MXN', motivo: null, politica: 'primera_noche',
    });

    const result = await processReservationWebhook(payloadNoShow());

    expect(result.ok).toBe(true);
    expect(result.status).toBe('actualizada');
    expect(result.reservationId).toBe('res_noshow');

    // El estado se marca con action y payload del evento (igual que el PATCH).
    const updated = hoisted.hospitalityReservation.update.mock.calls[0][0];
    expect(updated.where.id).toBe('res_noshow');
    expect(updated.data.estado).toBe('no_show');
    expect(updated.data.action).toBe('no_show');

    // La penalización va por el emisor ya existente (regla 8).
    expect(hoisted.aplicarPenalizacionNoShow).toHaveBeenCalledWith(TENANT_A, 'res_noshow');

    // Evento bruto registrado como procesado.
    expect(hoisted.hospitalityWebhookEvent.create).toHaveBeenCalled();
    expect(hoisted.hospitalityWebhookEvent.create.mock.calls[0][0].data.estado).toBe('procesado');
    expect(hoisted.hospitalityWebhookEvent.create.mock.calls[0][0].data.action).toBe('no_show');
  });

  it('la penalización emitida viaja en la respuesta (importe y motivo)', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(filaNoShow());
    hoisted.hospitalityReservation.update.mockResolvedValue({ ...filaNoShow(), estado: 'no_show' });
    hoisted.aplicarPenalizacionNoShow.mockResolvedValue({
      ok: true, emitida: false, importe: 0, moneda: 'MXN', motivo: 'canal_del_proveedor', politica: 'primera_noche',
    });

    const result = await processReservationWebhook(payloadNoShow());

    expect(result.ok).toBe(true);
    expect(result.penalizacion).toEqual({ emitida: false, importe: 0, motivo: 'canal_del_proveedor' });
  });

  it('un fallo del emisor NUNCA revierte el no_show (el inventario manda)', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(filaNoShow());
    hoisted.hospitalityReservation.update.mockResolvedValue({ ...filaNoShow(), estado: 'no_show' });
    hoisted.aplicarPenalizacionNoShow.mockRejectedValue(new Error('boom'));

    const result = await processReservationWebhook(payloadNoShow());

    expect(result.ok).toBe(true);
    expect(result.status).toBe('actualizada');
    expect(result.penalizacion).toBeNull();
  });

  it('no_show repetido es idempotente: no toca una reserva ya marcada', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(filaNoShow({ estado: 'no_show' }));

    const result = await processReservationWebhook(payloadNoShow());

    expect(result.ok).toBe(true);
    expect(hoisted.hospitalityReservation.update).not.toHaveBeenCalled();
    expect(hoisted.aplicarPenalizacionNoShow).not.toHaveBeenCalled();
  });

  it('no_show de una reserva inexistente responde no_encontrada', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);

    const result = await processReservationWebhook(payloadNoShow());

    expect(result.ok).toBe(false);
    expect(result.status).toBe('no_encontrada');
    expect(hoisted.hospitalityReservation.update).not.toHaveBeenCalled();
  });

  it('no_show de una reserva cancelada no la toca (solo se marca desde una estancia en curso)', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(filaNoShow({ estado: 'cancelled' }));

    const result = await processReservationWebhook(payloadNoShow());

    expect(result.ok).toBe(true);
    expect(hoisted.hospitalityReservation.update).not.toHaveBeenCalled();
    expect(hoisted.aplicarPenalizacionNoShow).not.toHaveBeenCalled();
  });

  it('una acción distinta de book/modify/cancel/no_show sigue rechazándose (contrato de acciones)', async () => {
    const result = await processReservationWebhook(payload({ action: 'destruir' as any }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Acción no soportada');
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
    expect(hoisted.hospitalityWebhookEvent.create).not.toHaveBeenCalled();
  });
});

// ── Vinculación automática al recibir el webhook ─────────────────────────────
//
// Si la habitación del payload existe en el catálogo del proveedor y hay una
// única unidad libre que le corresponde, la reserva entra en vez de rechazarse.
// Solo se aplica cuando no hay duda y queda traza del motivo y del origen.

describe('Hospitality — vinculación automática en el webhook', () => {
  /** Vínculo con propertyId: es lo que permite saber de quién es el hotelCode. */
  function mappingConPropiedad(overrides: Record<string, unknown> = {}) {
    return { ...mappingActivo(TENANT_A, PROPERTY_A, UNIT_A), propertyId: PROPERTY_A, ...overrides };
  }

  const HABITACION_PENTHOUSE = {
    roomCode: 'penthouse',
    rateplanCode: 'penthouse-ep',
    guestName: null,
    occupancy: { adults: 2, children: 0 },
    prices: [],
  };

  /** Catálogo real del proveedor con la habitación que rechazó la reserva. */
  function catalogoCon(roomCode = 'penthouse') {
    return {
      ok: true,
      property: {
        hotel_name: 'Villa Mar Azul',
        rooms: [{ room_id: roomCode, room_name: 'Penthouse', rateplans: [{ rateplan_id: 'penthouse-ep' }] }],
      },
    };
  }

  /** Catálogo donde el proveedor publica la ocupación de la habitación. */
  function catalogoConOcupacion(rango: { min?: number | null; max?: number | null }) {
    return {
      ok: true,
      property: {
        hotel_name: 'Villa Mar Azul',
        rooms: [
          {
            room_id: 'penthouse',
            room_name: 'Penthouse',
            min_occ: rango.min ?? null,
            max_occ: rango.max ?? null,
            rateplans: [{ rateplan_id: 'penthouse-ep' }],
          },
        ],
      },
    };
  }

  function prepararReservaNueva() {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
    hoisted.contact.findFirst.mockResolvedValue(null);
    hoisted.contact.create.mockResolvedValue({ id: 'contact_1' });
  }

  it('registra la reserva si el vínculo es inequívoco y deja traza', async () => {
    const suite = mappingConPropiedad();
    const vinculoPenthouse = mappingConPropiedad({
      id: 'map_free',
      externalUnitCode: 'penthouse',
      externalRatePlanCode: 'penthouse-ep',
      unit: { id: 'unit_free' },
    });
    // Los vínculos se leen antes y después de crear el nuevo: como en la BD real.
    let mappings = [suite];
    hoisted.connectivityMapping.findMany.mockImplementation(async () => mappings);
    hoisted.connectivityMapping.upsert.mockImplementation(async () => {
      mappings = [suite, vinculoPenthouse];
      return { id: 'map_free' };
    });
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'unit_free', nombre: 'Penthouse', codigo: 'penthouse', mappings: [] },
    ]);
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoCon());
    prepararReservaNueva();

    const result = await processReservationWebhook(
      payload({ rooms: [HABITACION_PENTHOUSE] })
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('creada');
    const created = hoisted.hospitalityReservation.create.mock.calls[0][0].data;
    expect(created.unitId).toBe('unit_free');

    // El vínculo guarda POR QUÉ se creó, y el sync log de dónde salió.
    const upsert = hoisted.connectivityMapping.upsert.mock.calls[0][0];
    expect(upsert.create.externalUnitCode).toBe('penthouse');
    expect(upsert.create.externalRatePlanCode).toBe('penthouse-ep');
    expect(upsert.create.metadata).toMatchObject({
      origen: 'vinculacion_automatica_webhook',
      motivo: 'codigo_de_unidad',
      bookingId: 'BKG-999',
      channel: 'airbnb',
    });
    const syncLog = hoisted.hospitalitySyncLog.create.mock.calls[0][0].data;
    expect(syncLog).toMatchObject({
      tenantId: TENANT_A,
      propertyId: PROPERTY_A,
      tipo: 'mapping_automatico',
      operacion: 'webhook',
      estado: 'exito',
    });
    expect(syncLog.responseBody).toMatchObject({
      motivo: 'codigo_de_unidad',
      roomCode: 'penthouse',
      unit: 'Penthouse',
    });

    // La reserva se registró: su evento queda procesado, no sin_mapping.
    expect(hoisted.hospitalityWebhookEvent.create.mock.calls[0][0].data.estado).toBe('procesado');
  });

  it('avisa a los operadores del tenant de que el sistema creó el vínculo', async () => {
    const suite = mappingConPropiedad();
    const vinculo = mappingConPropiedad({
      id: 'map_free',
      externalUnitCode: 'penthouse',
      unit: { id: 'unit_free', nombre: 'Penthouse' },
    });
    let mappings = [suite];
    hoisted.connectivityMapping.findMany.mockImplementation(async () => mappings);
    hoisted.connectivityMapping.upsert.mockImplementation(async () => {
      mappings = [suite, vinculo];
      return { id: 'map_free' };
    });
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'unit_free', nombre: 'Penthouse', codigo: 'penthouse', mappings: [] },
    ]);
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoCon());
    prepararReservaNueva();

    await processReservationWebhook(payload({ rooms: [HABITACION_PENTHOUSE] }));

    // El aviso no bloquea la reserva: se envía después, así que se espera.
    await vi.waitFor(() => expect(hoisted.sendPushNotification).toHaveBeenCalledTimes(1));
    const [userId, aviso] = hoisted.sendPushNotification.mock.calls[0];
    expect(userId).toBe('u_admin');
    expect(aviso.title).toContain('automático');
    expect(aviso.body).toContain('Penthouse');
    expect(aviso.body).toContain('BKG-999');
    expect(aviso.body).toContain('el código de la unidad coincide');
    expect(aviso.body).toContain('Revisa el vínculo');
    expect(aviso.url).toBe(`/dashboard/hospitality/onboarding?propertyId=${PROPERTY_A}`);
    // Y se busca solo en la plantilla del tenant: quién decide se resuelve por
    // capacidad, no filtrando por el nombre del rol.
    expect(hoisted.user.findMany.mock.calls[0][0].where.tenantId).toBe(TENANT_A);
    expect(hoisted.user.findMany.mock.calls[0][0].select).toEqual({ id: true, role: true });
  });

  it('sin operadores a los que avisar, el vínculo se aplica igual', async () => {
    const suite = mappingConPropiedad();
    const vinculo = mappingConPropiedad({
      id: 'map_free',
      externalUnitCode: 'penthouse',
      unit: { id: 'unit_free' },
    });
    let mappings = [suite];
    hoisted.connectivityMapping.findMany.mockImplementation(async () => mappings);
    hoisted.connectivityMapping.upsert.mockImplementation(async () => {
      mappings = [suite, vinculo];
      return { id: 'map_free' };
    });
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'unit_free', nombre: 'Penthouse', codigo: 'penthouse', mappings: [] },
    ]);
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoCon());
    hoisted.user.findMany.mockResolvedValue([]);
    prepararReservaNueva();

    const result = await processReservationWebhook(payload({ rooms: [HABITACION_PENTHOUSE] }));

    expect(result.status).toBe('creada');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hoisted.sendPushNotification).not.toHaveBeenCalled();
  });

  it('no avisa cuando no se creó ningún vínculo', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([mappingConPropiedad()]);
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'u1', nombre: 'Atico', codigo: 'atico', mappings: [] },
      { id: 'u2', nombre: 'Estudio', codigo: 'estudio', mappings: [] },
    ]);
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoCon());

    await processReservationWebhook(payload({ rooms: [HABITACION_PENTHOUSE] }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hoisted.sendPushNotification).not.toHaveBeenCalled();
  });

  it('aplica por eliminación cuando solo queda una unidad libre', async () => {
    const suite = mappingConPropiedad();
    const vinculo = mappingConPropiedad({
      id: 'map_free',
      externalUnitCode: 'penthouse',
      unit: { id: 'unit_unica' },
    });
    let mappings = [suite];
    hoisted.connectivityMapping.findMany.mockImplementation(async () => mappings);
    hoisted.connectivityMapping.upsert.mockImplementation(async () => {
      mappings = [suite, vinculo];
      return { id: 'map_free' };
    });
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'unit_unica', nombre: 'Casa completa', codigo: null, mappings: [] },
    ]);
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoCon());
    prepararReservaNueva();

    const result = await processReservationWebhook(payload({ rooms: [HABITACION_PENTHOUSE] }));

    expect(result.status).toBe('creada');
    expect(hoisted.connectivityMapping.upsert.mock.calls[0][0].create.metadata.motivo).toBe(
      'unica_unidad_libre'
    );
  });

  it('vincula por la ocupación del catálogo cuando nadie coincide por código ni nombre', async () => {
    const suite = mappingConPropiedad();
    const vinculo = mappingConPropiedad({
      id: 'map_free',
      externalUnitCode: 'penthouse',
      unit: { id: 'unit_doble' },
    });
    let mappings = [suite];
    hoisted.connectivityMapping.findMany.mockImplementation(async () => mappings);
    hoisted.connectivityMapping.upsert.mockImplementation(async () => {
      mappings = [suite, vinculo];
      return { id: 'map_free' };
    });
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'unit_grande', nombre: 'Villa entera', codigo: 'VILLA', capacidad: 8, mappings: [] },
      { id: 'unit_doble', nombre: 'Doble mar', codigo: 'DBL', capacidad: 2, mappings: [] },
    ]);
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 2, max: 4 }));
    prepararReservaNueva();

    const result = await processReservationWebhook(payload({ rooms: [HABITACION_PENTHOUSE] }));

    expect(result.status).toBe('creada');
    expect(hoisted.hospitalityReservation.create.mock.calls[0][0].data.unitId).toBe('unit_doble');
    expect(hoisted.connectivityMapping.upsert.mock.calls[0][0].create.metadata.motivo).toBe(
      'ocupacion_compatible'
    );
  });

  it('desempata con los huéspedes reales de la reserva cuando el tipo no distingue', async () => {
    const suite = mappingConPropiedad();
    const vinculo = mappingConPropiedad({
      id: 'map_free',
      externalUnitCode: 'penthouse',
      unit: { id: 'unit_familiar' },
    });
    let mappings = [suite];
    hoisted.connectivityMapping.findMany.mockImplementation(async () => mappings);
    hoisted.connectivityMapping.upsert.mockImplementation(async () => {
      mappings = [suite, vinculo];
      return { id: 'map_free' };
    });
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'unit_doble', nombre: 'Doble mar', codigo: 'DBL', capacidad: 2, mappings: [] },
      { id: 'unit_familiar', nombre: 'Familiar', codigo: 'FAM', capacidad: 6, mappings: [] },
    ]);
    // El tipo de habitación publica 1-6 huéspedes: con eso encajan las dos.
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 6 }));
    prepararReservaNueva();

    const result = await processReservationWebhook(
      payload({
        rooms: [{ ...HABITACION_PENTHOUSE, occupancy: { adults: 2, children: 1 } }],
      })
    );

    expect(result.status).toBe('creada');
    expect(hoisted.hospitalityReservation.create.mock.calls[0][0].data.unitId).toBe('unit_familiar');
    expect(hoisted.connectivityMapping.upsert.mock.calls[0][0].create.metadata).toMatchObject({
      motivo: 'ocupacion_reserva',
      ocupacionReserva: 3,
    });
    expect(
      hoisted.hospitalitySyncLog.create.mock.calls[0][0].data.responseBody
    ).toMatchObject({ ocupacionReserva: 3 });
  });

  it('elige la unidad del tamaño exacto de la reserva cuando la hay', async () => {
    const suite = mappingConPropiedad();
    const vinculo = mappingConPropiedad({
      id: 'map_free',
      externalUnitCode: 'penthouse',
      unit: { id: 'unit_triple' },
    });
    let mappings = [suite];
    hoisted.connectivityMapping.findMany.mockImplementation(async () => mappings);
    hoisted.connectivityMapping.upsert.mockImplementation(async () => {
      mappings = [suite, vinculo];
      return { id: 'map_free' };
    });
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'unit_triple', nombre: 'Triple', codigo: 'TPL', capacidad: 3, mappings: [] },
      { id: 'unit_grande', nombre: 'Villa entera', codigo: 'VILLA', capacidad: 8, mappings: [] },
    ]);
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 8 }));
    prepararReservaNueva();

    const result = await processReservationWebhook(
      payload({ rooms: [{ ...HABITACION_PENTHOUSE, occupancy: { adults: 3, children: 0 } }] })
    );

    expect(result.status).toBe('creada');
    expect(hoisted.connectivityMapping.upsert.mock.calls[0][0].create.metadata.motivo).toBe(
      'capacidad_exacta'
    );
  });

  it('rechaza la reserva si ninguna unidad libre puede alojar a los huéspedes', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([mappingConPropiedad()]);
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'unit_doble', nombre: 'Doble mar', codigo: 'DBL', capacidad: 2, mappings: [] },
      { id: 'unit_triple', nombre: 'Triple', codigo: 'TPL', capacidad: 3, mappings: [] },
    ]);
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 4 }));

    const result = await processReservationWebhook(
      payload({
        rooms: [{ ...HABITACION_PENTHOUSE, occupancy: { adults: 4, children: 1 } }],
      })
    );

    expect(result.ok).toBe(false);
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
    expect(hoisted.connectivityMapping.upsert).not.toHaveBeenCalled();
    const evento = hoisted.hospitalityWebhookEvent.create.mock.calls[0][0].data;
    expect(evento.estado).toBe('sin_mapping');
    // El motivo viaja al incidente que lee el operador.
    expect(evento.errorMensaje).toContain('capacidad');
    expect(evento.errorMensaje).toContain('5 huésped(es)');
  });

  it('sin ocupación en el payload, la decisión es la de siempre', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([mappingConPropiedad()]);
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'unit_a', nombre: 'Atico', codigo: 'ATIC', capacidad: 2, mappings: [] },
      { id: 'unit_b', nombre: 'Estudio', codigo: 'EST', capacidad: 6, mappings: [] },
    ]);
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 6 }));

    const result = await processReservationWebhook(
      payload({
        rooms: [{ ...HABITACION_PENTHOUSE, occupancy: undefined }],
      })
    );

    expect(result.ok).toBe(false);
    expect(hoisted.connectivityMapping.upsert).not.toHaveBeenCalled();
    expect(hoisted.hospitalityWebhookEvent.create.mock.calls[0][0].data.errorMensaje).toContain(
      'ninguna coincide'
    );
  });

  it('rechaza la reserva si ninguna unidad libre admite la ocupación', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([mappingConPropiedad()]);
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'unit_unica', nombre: 'Casa completa', codigo: null, capacidad: 6, mappings: [] },
    ]);
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ max: 2 }));

    const result = await processReservationWebhook(payload({ rooms: [HABITACION_PENTHOUSE] }));

    expect(result.ok).toBe(false);
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
    expect(hoisted.connectivityMapping.upsert).not.toHaveBeenCalled();
    const evento = hoisted.hospitalityWebhookEvent.create.mock.calls[0][0].data;
    expect(evento.estado).toBe('sin_mapping');
    // El motivo de la negativa llega al incidente que lee el operador.
    expect(evento.errorMensaje).toContain('admite la ocupación');
  });

  it('sigue rechazando si hay varias unidades libres y ninguna coincide', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([mappingConPropiedad()]);
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'u1', nombre: 'Atico', codigo: 'atico', mappings: [] },
      { id: 'u2', nombre: 'Estudio', codigo: 'estudio', mappings: [] },
    ]);
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoCon());

    const result = await processReservationWebhook(payload({ rooms: [HABITACION_PENTHOUSE] }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain('penthouse');
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
    expect(hoisted.connectivityMapping.upsert).not.toHaveBeenCalled();
    const evento = hoisted.hospitalityWebhookEvent.create.mock.calls[0][0].data;
    expect(evento.estado).toBe('sin_mapping');
    // El evento explica por qué no se pudo resolver solo.
    expect(evento.errorMensaje).toContain('varias unidades libres');
  });

  it('no inventa el vínculo si el proveedor no responde', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([mappingConPropiedad()]);
    hoisted.testConnectivityConnection.mockResolvedValue({ ok: false, error: 'timeout' });

    const result = await processReservationWebhook(payload({ rooms: [HABITACION_PENTHOUSE] }));

    expect(result.ok).toBe(false);
    expect(hoisted.connectivityMapping.upsert).not.toHaveBeenCalled();
  });

  it('sigue rechazando si la habitación no está en el catálogo', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([mappingConPropiedad()]);
    hoisted.testConnectivityConnection.mockResolvedValue(catalogoCon('otra-habitacion'));

    const result = await processReservationWebhook(payload({ rooms: [HABITACION_PENTHOUSE] }));

    expect(result.ok).toBe(false);
    expect(hoisted.hospitalityUnit.findMany).not.toHaveBeenCalled();
    expect(hoisted.connectivityMapping.upsert).not.toHaveBeenCalled();
  });

  it('no vuelve a vincular una habitación que un operador deshizo', async () => {
    hoisted.connectivityMapping.findMany.mockImplementation(async (args: any) =>
      // La consulta de vínculos rechazados filtra por estado inactivo.
      args?.where?.estado === 'inactivo' ? [{ externalUnitCode: 'penthouse' }] : [mappingConPropiedad()]
    );

    const result = await processReservationWebhook(payload({ rooms: [HABITACION_PENTHOUSE] }));

    expect(result.ok).toBe(false);
    expect(hoisted.testConnectivityConnection).not.toHaveBeenCalled();
    expect(hoisted.connectivityMapping.upsert).not.toHaveBeenCalled();
    expect(hoisted.sendPushNotification).not.toHaveBeenCalled();
  });

  it('con HOSPITALITY_AUTO_MAPPING=off no consulta el catálogo ni vincula', async () => {
    vi.stubEnv('HOSPITALITY_AUTO_MAPPING', 'off');
    try {
      hoisted.connectivityMapping.findMany.mockResolvedValue([mappingConPropiedad()]);

      const result = await processReservationWebhook(payload({ rooms: [HABITACION_PENTHOUSE] }));

      expect(result.ok).toBe(false);
      expect(hoisted.testConnectivityConnection).not.toHaveBeenCalled();
      expect(hoisted.connectivityMapping.upsert).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('no intenta vincular si el hotelCode apunta a más de una propiedad', async () => {
    hoisted.connectivityMapping.findMany.mockResolvedValue([
      mappingConPropiedad(),
      mappingConPropiedad({ id: 'map_otra', propertyId: 'prop_otra', unit: { id: 'u_otra' } }),
    ]);

    const result = await processReservationWebhook(payload({ rooms: [HABITACION_PENTHOUSE] }));

    expect(result.ok).toBe(false);
    expect(hoisted.testConnectivityConnection).not.toHaveBeenCalled();
  });

  describe('payloads multi-habitación', () => {
    it('book con dos habitaciones se rechaza sin registrar nada, con evento claro', async () => {
      hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
      hoisted.hospitalityReservation.create.mockClear();

      const result = await processReservationWebhook(
        payload({
          rooms: [
            { roomCode: 'suite', rateplanCode: 'suite-ep' },
            { roomCode: 'executive', rateplanCode: 'exec-ep' },
          ],
        })
      );

      expect(result.ok).toBe(false);
      expect(result.status).toBe('error');
      expect(result.error).toContain('multi-habitación');
      expect(result.error).toContain('suite');
      expect(result.error).toContain('executive');
      // Nada se registra a medias: ni reserva ni contacto.
      expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
      expect(hoisted.contact.create).not.toHaveBeenCalled();
      // Y el incidente queda en la tabla del panel con el detalle.
      expect(hoisted.hospitalityWebhookEvent.create).toHaveBeenCalledTimes(1);
      const ev = hoisted.hospitalityWebhookEvent.create.mock.calls[0][0].data;
      expect(ev.estado).toBe('sin_mapping');
      expect(ev.action).toBe('book');
      expect(ev.errorMensaje).toContain('2 habitaciones');
      expect(ev.errorMensaje).toContain('suite, executive');
    });

    it('modify multi-habitación se rechaza igual que un book', async () => {
      const result = await processReservationWebhook(
        payload({
          action: 'modify',
          rooms: [
            { roomCode: 'suite', rateplanCode: 'suite-ep' },
            { roomCode: 'executive', rateplanCode: 'exec-ep' },
          ],
        })
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain('multi-habitación');
      expect(hoisted.hospitalityReservation.update).not.toHaveBeenCalled();
      expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
    });

    it('un cancel nunca se rechaza por multi-habitación: las rooms sobran', async () => {
      hoisted.hospitalityReservation.findUnique.mockResolvedValue(reservationFila());

      const result = await processReservationWebhook(
        payload({
          action: 'cancel',
          rooms: [
            { roomCode: 'suite' },
            { roomCode: 'executive' },
          ],
        })
      );

      expect(result.ok).toBe(true);
      expect(result.status).toBe('cancelada');
      // No hay evento de rechazo: el cancel se procesó normal.
      const eventos = hoisted.hospitalityWebhookEvent.create.mock.calls.map(
        (c) => c[0].data.estado
      );
      expect(eventos).toEqual(['procesado']);
    });
  });
});

describe('Hospitality — registro manual de reserva partida (multi-habitación)', () => {
  const PAYLOAD_MULTI: WebhookReservationPayload = {
    action: 'book',
    hotelCode: 'sandbox-pms',
    channel: 'airbnb',
    bookingId: 'BKG-MULTI',
    checkin: '2026-10-10',
    checkout: '2026-10-15',
    guest: { firstName: 'Ana', lastName: 'Torres', email: 'ana@example.com', phone: null },
    amount: { amountAfterTax: 6000, amountBeforeTax: 5000, tax: 1000, currency: 'MXN' },
    rooms: [
      { roomCode: 'suite', rateplanCode: 'suite-ep', occupancy: { adults: 2, children: 0 } },
      { roomCode: 'executive', rateplanCode: 'exec-ep', occupancy: { adults: 1, children: 1 } },
    ],
  } as unknown as WebhookReservationPayload;

  const UNIT_U1 = { id: 'unit_1', propertyId: PROPERTY_A, capacidad: 2 };
  const UNIT_U2 = { id: 'unit_2', propertyId: PROPERTY_A, capacidad: 4 };

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.hospitalityUnit.findMany.mockResolvedValue([UNIT_U1, UNIT_U2]);
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
    hoisted.hospitalityReservation.findMany.mockResolvedValue([]); // sin choques
    hoisted.hospitalityReservation.create.mockImplementation(async ({ data }: any) =>
      reservationFila({ externalBookingId: data.externalBookingId })
    );
  });

  it('payload de una sola habitación o sin unidades → rechazo sin escribir', async () => {
    await expect(
      registrarReservaPartida({ tenantId: TENANT_A, payload: { ...PAYLOAD_MULTI, rooms: [PAYLOAD_MULTI.rooms![0]] }, unidades: [{ indice: 0, unitId: UNIT_U1.id }] })
    ).resolves.toMatchObject({ ok: false });
    await expect(
      registrarReservaPartida({ tenantId: TENANT_A, payload: PAYLOAD_MULTI, unidades: [] })
    ).resolves.toMatchObject({ ok: false });
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
  });

  it('dos habitaciones a la misma unidad o fuera de rango → rechazo sin escribir', async () => {
    await expect(
      registrarReservaPartida({
        tenantId: TENANT_A,
        payload: PAYLOAD_MULTI,
        unidades: [
          { indice: 0, unitId: UNIT_U1.id },
          { indice: 1, unitId: UNIT_U1.id },
        ],
      })
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('misma unidad') });
    await expect(
      registrarReservaPartida({
        tenantId: TENANT_A,
        payload: PAYLOAD_MULTI,
        unidades: [{ indice: 5, unitId: UNIT_U1.id }],
      })
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('fuera de rango') });
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
  });

  it('crea una reserva por habitación con id derivado y ocupación propia', async () => {
    const result = await registrarReservaPartida({
      tenantId: TENANT_A,
      payload: PAYLOAD_MULTI,
      unidades: [
        { indice: 0, unitId: UNIT_U1.id },
        { indice: 1, unitId: UNIT_U2.id },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.habitaciones.map((h) => h.estado)).toEqual(['creada', 'creada']);
    expect(result.habitaciones.map((h) => h.externalBookingId)).toEqual(['BKG-MULTI#1', 'BKG-MULTI#2']);
    expect(result.habitaciones.map((h) => h.roomCode)).toEqual(['suite', 'executive']);
    expect(hoisted.hospitalityReservation.create).toHaveBeenCalledTimes(2);
    const primera = hoisted.hospitalityReservation.create.mock.calls[0][0].data;
    const segunda = hoisted.hospitalityReservation.create.mock.calls[1][0].data;
    expect(primera.externalBookingId).toBe('BKG-MULTI#1');
    expect(primera.occupancyAdults).toBe(2);
    expect(segunda.externalBookingId).toBe('BKG-MULTI#2');
    expect(segunda.occupancyAdults).toBe(1);
    expect(segunda.occupancyChildren).toBe(1);
    expect(segunda.unitId).toBe(UNIT_U2.id);
  });

  it('es idempotente: la parte ya registrada no se re-crea y responde duplicado', async () => {
    // La parte #1 ya existe (con su id derivado).
    hoisted.hospitalityReservation.findUnique.mockImplementation(async ({ where }: any) =>
      where.tenantId_channel_externalBookingId.externalBookingId === 'BKG-MULTI#1'
        ? reservationFila({ externalBookingId: 'BKG-MULTI#1' })
        : null
    );

    const result = await registrarReservaPartida({
      tenantId: TENANT_A,
      payload: PAYLOAD_MULTI,
      unidades: [
        { indice: 0, unitId: UNIT_U1.id },
        { indice: 1, unitId: UNIT_U2.id },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.habitaciones[0]).toMatchObject({ estado: 'duplicado', externalBookingId: 'BKG-MULTI#1' });
    expect(result.habitaciones[1]).toMatchObject({ estado: 'creada', externalBookingId: 'BKG-MULTI#2' });
    expect(hoisted.hospitalityReservation.create).toHaveBeenCalledTimes(1);
  });

  it('all-or-nothing: si una parte choca con la disponibilidad no se crea NINGUNA', async () => {
    // La primera consulta de choques (habitación 1) devuelve un choque.
    hoisted.hospitalityReservation.findMany.mockResolvedValue([
      reservationFila({ externalBookingId: 'OTRA' }),
    ]);

    const result = await registrarReservaPartida({
      tenantId: TENANT_A,
      payload: PAYLOAD_MULTI,
      unidades: [
        { indice: 0, unitId: UNIT_U1.id },
        { indice: 1, unitId: UNIT_U2.id },
      ],
    });

    expect(result.ok).toBe(false);
    if ((result as { ok: false }).ok !== false) return;
    expect((result as { error: string }).error).toContain('choca');
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
  });

  it('rechaza si los huéspedes de una parte no caben en la unidad elegida', async () => {
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { id: UNIT_U1.id, propertyId: PROPERTY_A, capacidad: 1 },
      UNIT_U2,
    ]);

    const result = await registrarReservaPartida({
      tenantId: TENANT_A,
      payload: PAYLOAD_MULTI,
      unidades: [
        { indice: 0, unitId: UNIT_U1.id },
        { indice: 1, unitId: UNIT_U2.id },
      ],
    });

    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain('2 huésped(es)');
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
  });

  it('unidades de propiedades distintas → rechazo sin escribir', async () => {
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      UNIT_U1,
      { id: UNIT_U2.id, propertyId: 'prop_OTRA', capacidad: 4 },
    ]);

    const result = await registrarReservaPartida({
      tenantId: TENANT_A,
      payload: PAYLOAD_MULTI,
      unidades: [
        { indice: 0, unitId: UNIT_U1.id },
        { indice: 1, unitId: UNIT_U2.id },
      ],
    });

    expect(result.ok).toBe(false);
    expect(hoisted.hospitalityReservation.create).not.toHaveBeenCalled();
  });

  it('el cancel del booking completo cancela todas las partes derivadas vivas', async () => {
    // No existe reserva con el bookingId global, sí las partes #1 y #2.
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
    hoisted.hospitalityReservation.findMany.mockResolvedValue([
      { id: 'res_p1', propertyId: PROPERTY_A, unitId: UNIT_U1.id, contactId: null, checkIn: new Date('2026-10-10'), checkOut: new Date('2026-10-15'), guestData: null },
      { id: 'res_p2', propertyId: PROPERTY_A, unitId: UNIT_U2.id, contactId: null, checkIn: new Date('2026-10-10'), checkOut: new Date('2026-10-15'), guestData: null },
    ]);

    const result = await processCancel(TENANT_A, {
      action: 'cancel',
      hotelCode: 'sandbox-pms',
      channel: 'airbnb',
      bookingId: 'BKG-MULTI',
    } as WebhookReservationPayload);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('cancelada');
    expect(hoisted.hospitalityReservation.updateMany).toHaveBeenCalledTimes(1);
    const llamada = hoisted.hospitalityReservation.updateMany.mock.calls[0][0];
    expect(llamada.where.id.in).toEqual(['res_p1', 'res_p2']);
    expect(llamada.data.estado).toBe('cancelled');
  });

  it('el cancel solo toca las partes de SU booking (BKG-1 no es parte de BKG-11)', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
    // Prefijo exacto: BKG-1# no matchea BKG-11#1.
    hoisted.hospitalityReservation.findMany.mockResolvedValue([]);

    const result = await processCancel(TENANT_A, {
      action: 'cancel',
      hotelCode: 'sandbox-pms',
      channel: 'airbnb',
      bookingId: 'BKG-1',
    } as WebhookReservationPayload);

    expect(result.status).toBe('no_encontrada');
    expect(hoisted.hospitalityReservation.updateMany).not.toHaveBeenCalled();
  });

  it('el cancel REPETIDO de la misma reserva no reescribe ni re-emite: es un duplicado', async () => {
    // El mismo hecho contado dos veces (reintento del proveedor, o el barrido
    // mirando otra vez el mismo rango). Antes se aplicaba de nuevo: reescribía
    // el payload, re-emitía `reservation.cancelled` —y con él las reglas de
    // automatización— y disparaba un push al canal sin nada que empujar.
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(
      reservationFila({ estado: 'cancelled', action: 'cancel' })
    );

    const result = await processCancel(TENANT_A, payload({ action: 'cancel' }));

    expect(result.ok).toBe(true);
    expect(result.status).toBe('duplicado');
    expect(hoisted.hospitalityReservation.update).not.toHaveBeenCalled();
  });

  it('el cancel repetido de un booking partido ya cancelado también es duplicado', async () => {
    hoisted.hospitalityReservation.findUnique.mockResolvedValue(null);
    hoisted.hospitalityReservation.findMany.mockResolvedValue([
      { id: 'res_p1', estado: 'cancelled', propertyId: PROPERTY_A, unitId: UNIT_U1.id, contactId: null, checkIn: new Date('2026-10-10'), checkOut: new Date('2026-10-15'), guestData: null },
    ]);

    const result = await processCancel(TENANT_A, {
      action: 'cancel',
      hotelCode: 'sandbox-pms',
      channel: 'airbnb',
      bookingId: 'BKG-MULTI',
    } as WebhookReservationPayload);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('duplicado');
    expect(hoisted.hospitalityReservation.updateMany).not.toHaveBeenCalled();
  });

  it('helpers: id derivado y sub-payload por habitación', () => {
    expect(externalIdDeParte('BKG-9', 0)).toBe('BKG-9#1');
    expect(externalIdDeParte('BKG-9', 2)).toBe('BKG-9#3');
    const sub = payloadDeHabitacion(PAYLOAD_MULTI, 1);
    expect(sub?.bookingId).toBe('BKG-MULTI#2');
    expect(sub?.rooms).toHaveLength(1);
    expect((sub?.rooms?.[0] as { roomCode?: string }).roomCode).toBe('executive');
    expect(payloadDeHabitacion(PAYLOAD_MULTI, 7)).toBeNull();
  });
});

