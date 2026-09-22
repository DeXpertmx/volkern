// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guardia de la emisión de la penalización por no-show.
 *
 * Reglas que protege:
 * 1. El cargo es una **línea de la reserva** (`hospitality_reservation_items`),
 *    no una entidad nueva ni un cambio de estado: el no-show sigue sin producir
 *    ocupación (regla 7) y la emisión NO toca la reserva.
 * 2. **Idempotente**: reintentar no duplica el cargo ni la factura.
 * 3. Solo se emite sobre un `no_show` y solo si el hotel cobra el canal.
 * 4. La **factura legal la emite el ERP** (`InvoicingService`), no hospitality
 *    (regla 4: nada de un segundo sistema financiero), y sin receptor fiscal no
 *    se factura.
 * 5. Un fallo al emitir nunca rompe el flujo (el inventario manda).
 */

const mocks = vi.hoisted(() => ({
  hospitalityReservation: { findFirst: vi.fn(), update: vi.fn() },
  hospitalityReservationItem: { create: vi.fn(), update: vi.fn() },
  createInvoice: vi.fn(),
  logAuditAction: vi.fn(),
  dispatchConnectivityPush: vi.fn(),
  authenticateRequest: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityReservationItem: mocks.hospitalityReservationItem,
  },
}));
vi.mock('@/lib/invoicing-service', () => ({
  InvoicingService: { createInvoice: (...a: unknown[]) => mocks.createInvoice(...a) },
}));
vi.mock('@/lib/permissions', () => ({
  logAuditAction: (...a: unknown[]) => mocks.logAuditAction(...a),
}));
vi.mock('@/lib/hospitality/sync', () => ({
  dispatchConnectivityPush: (...a: unknown[]) => mocks.dispatchConnectivityPush(...a),
}));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: (...a: unknown[]) => mocks.authenticateRequest(...a),
}));

import {
  aplicarPenalizacionNoShow,
  facturarPenalizacionNoShow,
  TIPO_LINEA_PENALIZACION,
} from '@/lib/hospitality/penalizaciones';

const auth = { valid: true, tenant: { id: 'tenant_a' }, user: { id: 'user_a' } };

/** Reserva no-show de 5 noches por 700, vendida por el propio hotel. */
const reservaNoShow = (overrides: Record<string, unknown> = {}) => ({
  id: 'res_a',
  estado: 'no_show',
  channel: 'Directa',
  checkIn: new Date('2026-09-10T15:00:00'),
  checkOut: new Date('2026-09-15T11:00:00'),
  amountAfterTax: 700,
  currency: 'EUR',
  contactId: 'contact_a',
  propertyId: 'prop_a',
  unitId: 'unit_a',
  externalBookingId: 'BK-1',
  property: { politicaNoShow: 'primera_noche' },
  items: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hospitalityReservation.findFirst.mockResolvedValue(reservaNoShow());
  mocks.hospitalityReservationItem.create.mockImplementation(async ({ data }: any) => ({
    id: 'item_penal',
    ...data,
  }));
  mocks.hospitalityReservationItem.update.mockResolvedValue({ id: 'item_penal' });
  mocks.createInvoice.mockResolvedValue({ id: 'inv_1', numero: 'MOCK-1', monto: 140, moneda: 'EUR' });
  mocks.hospitalityReservation.update.mockResolvedValue({});
  mocks.logAuditAction.mockResolvedValue(undefined);
  mocks.dispatchConnectivityPush.mockResolvedValue(undefined);
  mocks.authenticateRequest.mockResolvedValue(auth);
});

describe('Emisión del cargo por no-show', () => {
  it('emite una línea de penalización con el importe de la política de la propiedad', async () => {
    const r = await aplicarPenalizacionNoShow('tenant_a', 'res_a');

    expect(r.ok).toBe(true);
    expect(r.emitida).toBe(true);
    expect(r.importe).toBe(140);
    expect(r.moneda).toBe('EUR');
    expect(r.nochesPenalizadas).toBe(1);
    expect(r.politica).toBe('primera_noche');

    const { data } = mocks.hospitalityReservationItem.create.mock.calls[0][0];
    expect(data.tipo).toBe(TIPO_LINEA_PENALIZACION);
    expect(data.tipo).toBe('penalizacion');
    expect(data.reservationId).toBe('res_a');
    expect(data.tenantId).toBe('tenant_a');
    expect(data.importeTotal).toBe(140);
    // cantidad 1: cantidad × unitario tiene que ser exacto al normalizar la línea.
    expect(data.cantidad).toBe(1);
    expect(data.importeUnitario).toBe(data.importeTotal);
    expect(data.concepto).toContain('no-show');
  });

  it('el cargo NO toca la reserva: el no-show sigue sin producir ocupación', async () => {
    await aplicarPenalizacionNoShow('tenant_a', 'res_a');

    // Emitir es cobrar, no ocupar: si esto cambiara, la unidad volvería a
    // bloquearse y la analítica volvería a contarla.
    expect(mocks.hospitalityReservation.update).not.toHaveBeenCalled();
  });

  it('es idempotente: si ya hay penalización no se crea otra', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(
      reservaNoShow({ items: [{ id: 'item_penal', importeTotal: 140, invoiceId: null }] })
    );

    const r = await aplicarPenalizacionNoShow('tenant_a', 'res_a');

    expect(r.emitida).toBe(false);
    expect(r.motivo).toBe('ya_emitida');
    expect(r.importe).toBe(140);
    expect(r.itemId).toBe('item_penal');
    expect(mocks.hospitalityReservationItem.create).not.toHaveBeenCalled();
  });

  it('solo emite sobre un no-show', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(reservaNoShow({ estado: 'confirmed' }));

    const r = await aplicarPenalizacionNoShow('tenant_a', 'res_a');

    expect(r.emitida).toBe(false);
    expect(r.motivo).toBe('estado_no_es_no_show');
    expect(mocks.hospitalityReservationItem.create).not.toHaveBeenCalled();
  });

  it('respeta la política «ninguna» de la propiedad', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(
      reservaNoShow({ property: { politicaNoShow: 'ninguna' } })
    );

    const r = await aplicarPenalizacionNoShow('tenant_a', 'res_a');

    expect(r.motivo).toBe('politica_ninguna');
    expect(mocks.hospitalityReservationItem.create).not.toHaveBeenCalled();
  });

  it('una reserva de canal externo no se emite (la cobra el canal)', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(reservaNoShow({ channel: 'Airbnb' }));

    const r = await aplicarPenalizacionNoShow('tenant_a', 'res_a');

    expect(r.motivo).toBe('canal_del_proveedor');
    expect(mocks.hospitalityReservationItem.create).not.toHaveBeenCalled();
  });

  it('con cobrarEnCanal se emite aunque el canal sea externo', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(
      reservaNoShow({ channel: 'Airbnb', amountAfterTax: 500, checkOut: new Date('2026-09-12T11:00:00') })
    );

    const r = await aplicarPenalizacionNoShow('tenant_a', 'res_a', { cobrarEnCanal: true });

    expect(r.emitida).toBe(true);
    expect(r.importe).toBe(250); // 500 / 2 noches
  });

  it('la política de la propiedad se puede sustituir para esta emisión', async () => {
    const r = await aplicarPenalizacionNoShow('tenant_a', 'res_a', { politica: 'estancia_completa' });

    expect(r.politica).toBe('estancia_completa');
    expect(r.importe).toBe(700);
    expect(r.nochesPenalizadas).toBe(5);
  });

  it('una reserva de otro tenant no existe para este módulo', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(null);

    const r = await aplicarPenalizacionNoShow('tenant_a', 'res_de_otro');

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('reserva_no_encontrada');
    expect(mocks.hospitalityReservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'res_de_otro', tenantId: 'tenant_a' } })
    );
  });

  it('un fallo al emitir no lanza: el no-show ya está aplicado', async () => {
    mocks.hospitalityReservationItem.create.mockRejectedValue(new Error('DB caída'));

    const r = await aplicarPenalizacionNoShow('tenant_a', 'res_a');

    expect(r.ok).toBe(false);
    expect(r.emitida).toBe(false);
    expect(r.error).toContain('DB caída');
  });
});

describe('Facturación de la penalización por el ERP', () => {
  const conPenalizacion = (overrides: Record<string, unknown> = {}) =>
    reservaNoShow({
      items: [{ id: 'item_penal', concepto: 'Penalización por no-show · 1 noche', importeTotal: 140, invoiceId: null }],
      ...overrides,
    });

  it('factura por el circuito del ERP y deja la traza en la línea', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(conPenalizacion());

    const r = await facturarPenalizacionNoShow('tenant_a', 'res_a');

    expect(r.ok).toBe(true);
    expect(r.facturada).toBe(true);
    expect(r.invoiceId).toBe('inv_1');
    expect(r.numero).toBe('MOCK-1');
    expect(r.importe).toBe(140);

    const opciones = mocks.createInvoice.mock.calls[0][0];
    expect(opciones.tenantId).toBe('tenant_a');
    expect(opciones.contactId).toBe('contact_a');
    // El importe del cargo ya lleva el impuesto (viene de amountAfterTax):
    // desglosarlo es del ERP, así que no se pasa taxRate.
    expect(opciones.amount).toBe(140);
    expect(opciones.items[0].taxRate).toBeUndefined();
    expect(opciones.description).toContain('no-show');

    expect(mocks.hospitalityReservationItem.update).toHaveBeenCalledWith({
      where: { id: 'item_penal' },
      data: { invoiceId: 'inv_1' },
    });
  });

  it('hospitality no crea facturas: eso es del ERP (una sola verdad financiera)', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(conPenalizacion());

    await facturarPenalizacionNoShow('tenant_a', 'res_a');

    expect(mocks.createInvoice).toHaveBeenCalledTimes(1);
    // No hay ninguna creación de factura por fuera del ERP.
    expect((mocks as any).invoice).toBeUndefined();
  });

  it('no vuelve a facturar una penalización ya facturada', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(
      conPenalizacion({ items: [{ id: 'item_penal', concepto: 'x', importeTotal: 140, invoiceId: 'inv_0' }] })
    );

    const r = await facturarPenalizacionNoShow('tenant_a', 'res_a');

    expect(r.facturada).toBe(false);
    expect(r.motivo).toBe('ya_facturada');
    expect(r.invoiceId).toBe('inv_0');
    expect(mocks.createInvoice).not.toHaveBeenCalled();
  });

  it('sin penalización emitida no hay nada que facturar', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(reservaNoShow({ items: [] }));

    const r = await facturarPenalizacionNoShow('tenant_a', 'res_a');

    expect(r.facturada).toBe(false);
    expect(r.motivo).toBe('sin_penalizacion');
    expect(mocks.createInvoice).not.toHaveBeenCalled();
  });

  it('sin receptor fiscal (huésped sin vincular al CRM) no se factura', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(conPenalizacion({ contactId: null }));

    const r = await facturarPenalizacionNoShow('tenant_a', 'res_a');

    expect(r.facturada).toBe(false);
    expect(r.motivo).toBe('sin_contacto_fiscal');
    expect(mocks.createInvoice).not.toHaveBeenCalled();
    expect(mocks.hospitalityReservationItem.update).not.toHaveBeenCalled();
  });

  it('un fallo del ERP devuelve error sin dejar la línea marcada como facturada', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(conPenalizacion());
    mocks.createInvoice.mockRejectedValue(new Error('AEAT no responde'));

    const r = await facturarPenalizacionNoShow('tenant_a', 'res_a');

    expect(r.ok).toBe(false);
    expect(r.facturada).toBe(false);
    expect(r.error).toContain('AEAT no responde');
    expect(mocks.hospitalityReservationItem.update).not.toHaveBeenCalled();
  });
});

describe('PATCH de la reserva — marcar no-show emite la penalización', () => {
  it('la respuesta del cambio de estado informa del cargo emitido', async () => {
    mocks.authenticateRequest.mockResolvedValue(auth);
    mocks.hospitalityReservation.findFirst
      // 1ª llamada: la reserva que se edita (estado previo confirmado).
      .mockResolvedValueOnce({
        id: 'res_a',
        unitId: 'unit_a',
        channel: 'Directa',
        checkIn: new Date('2026-09-10T15:00:00'),
        checkOut: new Date('2026-09-15T11:00:00'),
        estado: 'confirmed',
        amountAfterTax: 700,
        currency: 'EUR',
        specialRequests: null,
      })
      // 2ª llamada: la que hace el emisor.
      .mockResolvedValueOnce(reservaNoShow());
    mocks.hospitalityReservation.update.mockResolvedValue({
      id: 'res_a',
      propertyId: 'prop_a',
      externalBookingId: 'BK-1',
      estado: 'no_show',
    });
    mocks.dispatchConnectivityPush.mockResolvedValue(undefined);

    const { PATCH } = await import('@/app/api/hospitality/reservations/[id]/route');
    const res = await PATCH(
      new Request('http://test.local/api/hospitality/reservations/res_a', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'no_show' }),
      }) as any,
      { params: { id: 'res_a' } }
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.penalizacion).toMatchObject({ emitida: true, importe: 140, moneda: 'EUR' });
    expect(mocks.hospitalityReservationItem.create).toHaveBeenCalledTimes(1);
  });

  it('los cambios que no son no-show no emiten nada', async () => {
    mocks.authenticateRequest.mockResolvedValue(auth);
    mocks.hospitalityReservation.findFirst.mockResolvedValue({
      id: 'res_a',
      unitId: 'unit_a',
      channel: 'Directa',
      checkIn: new Date('2026-09-10T15:00:00'),
      checkOut: new Date('2026-09-15T11:00:00'),
      estado: 'confirmed',
      amountAfterTax: 700,
      currency: 'EUR',
      specialRequests: null,
    });
    mocks.hospitalityReservation.update.mockResolvedValue({
      id: 'res_a',
      propertyId: 'prop_a',
      externalBookingId: 'BK-1',
      estado: 'checked_in',
    });
    mocks.dispatchConnectivityPush.mockResolvedValue(undefined);

    const { PATCH } = await import('@/app/api/hospitality/reservations/[id]/route');
    const res = await PATCH(
      new Request('http://test.local/api/hospitality/reservations/res_a', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'checked_in' }),
      }) as any,
      { params: { id: 'res_a' } }
    );
    const data = await res.json();

    expect(data.penalizacion).toBeNull();
    expect(mocks.hospitalityReservationItem.create).not.toHaveBeenCalled();
  });

  it('si el emisor falla, el no-show se aplica igual y el error no rompe la respuesta', async () => {
    mocks.authenticateRequest.mockResolvedValue(auth);
    mocks.hospitalityReservation.findFirst
      .mockResolvedValueOnce({
        id: 'res_a',
        unitId: 'unit_a',
        channel: 'Directa',
        checkIn: new Date('2026-09-10T15:00:00'),
        checkOut: new Date('2026-09-15T11:00:00'),
        estado: 'confirmed',
        amountAfterTax: 700,
        currency: 'EUR',
        specialRequests: null,
      })
      .mockRejectedValueOnce(new Error('DB caída'));
    mocks.hospitalityReservation.update.mockResolvedValue({
      id: 'res_a',
      propertyId: 'prop_a',
      externalBookingId: 'BK-1',
      estado: 'no_show',
    });
    mocks.dispatchConnectivityPush.mockResolvedValue(undefined);

    const { PATCH } = await import('@/app/api/hospitality/reservations/[id]/route');
    const res = await PATCH(
      new Request('http://test.local/api/hospitality/reservations/res_a', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'no_show' }),
      }) as any,
      { params: { id: 'res_a' } }
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reservation.estado).toBe('no_show');
    expect(data.penalizacion.ok).toBe(false);
  });
});
