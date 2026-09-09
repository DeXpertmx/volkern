import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runReconciliation } from '../lib/hospitality/reconciliation';

// Mocks
const mockFindProperties = vi.fn();
const mockFindReservation = vi.fn();
const mockFindManyReservations = vi.fn();
const mockFetch = vi.fn();
const mockProcessBook = vi.fn();
const mockProcessModify = vi.fn();
const mockProcessCancel = vi.fn();
const mockResolveMapping = vi.fn();
const mockCreateSyncLog = vi.fn();
const mockUpdateStatus = vi.fn();

vi.mock('../lib/db', () => ({
  prisma: {
    hospitalityProperty: {
      findMany: (...a: any[]) => mockFindProperties(...a),
    },
    hospitalityReservation: {
      findUnique: (...a: any[]) => mockFindReservation(...a),
      findMany: (...a: any[]) => mockFindManyReservations(...a),
    },
    hospitalitySyncLog: {
      create: (...a: any[]) => mockCreateSyncLog(...a),
    },
  },
}));

vi.mock('../lib/hospitality/connectivity', () => ({
  fetchReservations: (...a: any[]) => mockFetch(...a),
  updateConnectivityStatus: (...a: any[]) => mockUpdateStatus(...a),
}));

vi.mock('../lib/hospitality/reservations', () => ({
  processBook: (...a: any[]) => mockProcessBook(...a),
  processModify: (...a: any[]) => mockProcessModify(...a),
  processCancel: (...a: any[]) => mockProcessCancel(...a),
  resolveMapping: (...a: any[]) => mockResolveMapping(...a),
}));

const PROPERTY = {
  id: 'p1',
  tenantId: 't1',
  nombre: 'Villa Mar Azul',
  mappings: [{ externalPropertyId: 'HOTEL-1' }],
};

const FETCH_ITEM_BOOK = {
  action: 'book',
  hotelCode: 'HOTEL-1',
  channel: 'Airbnb',
  bookingId: 'AB-NEW',
  cmBookingId: 'CM-NEW',
  bookedOn: '2026-09-01 10:00:00',
  checkin: '2026-09-15',
  checkout: '2026-09-18',
  segment: 'OTA',
  specialRequests: null,
  pah: false,
  amount: { amountAfterTax: 5000, amountBeforeTax: 4500, tax: 500, currency: 'MXN', commission: 150, tcs: null, tds: null },
  guest: { firstName: 'Ana', lastName: 'Torres', email: 'ana@example.com', phone: null },
  rooms: [{ roomCode: 'MAR-302', rateplanCode: 'RP-1', guestName: 'Ana Torres', occupancy: { adults: 2, children: 0 }, prices: [{ date: '2026-09-15', sellRate: 2500 }] }],
};

const EXISTING_RESERVATION = {
  id: 'r1',
  estado: 'confirmed',
  payload: {
    action: 'book',
    hotelCode: 'HOTEL-1',
    channel: 'Airbnb',
    bookingId: 'AB-OLD',
    cmBookingId: null,
    checkin: '2026-09-10',
    checkout: '2026-09-12',
    segment: 'OTA',
    specialRequests: null,
    pah: false,
    amount: { amountAfterTax: 4000, amountBeforeTax: 3600, tax: 400, currency: 'MXN', commission: 120, tcs: null, tds: null },
    rooms: [{ roomCode: 'MAR-302', rateplanCode: 'RP-1', guestName: 'Juan', occupancy: { adults: 2, children: 0 }, prices: [] }],
  },
};

describe('runReconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindProperties.mockResolvedValue([PROPERTY]);
    mockFindReservation.mockResolvedValue(null);
    mockFindManyReservations.mockResolvedValue([]);
    mockFetch.mockResolvedValue({ ok: true, reservas: [] });
    mockProcessBook.mockResolvedValue({ ok: true, status: 'creada', reservationId: 'new-1' });
    mockProcessModify.mockResolvedValue({ ok: true, status: 'actualizada', reservationId: 'r1' });
    mockProcessCancel.mockResolvedValue({ ok: true, status: 'cancelada', reservationId: 'r1' });
    mockResolveMapping.mockResolvedValue({ property: { id: 'p1', tenantId: 't1' }, unit: null });
    mockCreateSyncLog.mockResolvedValue({ id: 'log-1' });
    mockUpdateStatus.mockResolvedValue({});
  });

  it('detecta y crea una reserva faltante (book)', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [FETCH_ITEM_BOOK] });
    const result = await runReconciliation({ tenantId: 't1' });
    expect(result.creadas).toBe(1);
    expect(result.totalFetch).toBe(1);
    expect(mockProcessBook).toHaveBeenCalledWith('t1', 'p1', null, expect.objectContaining({ bookingId: 'AB-NEW' }));
    expect(mockProcessModify).not.toHaveBeenCalled();
  });

  it('no reescribe una reserva sin cambios (firma idéntica)', async () => {
    mockFindReservation.mockResolvedValue({
      id: 'r1',
      estado: 'confirmed',
      payload: {
        action: 'book',
        hotelCode: 'HOTEL-1',
        channel: 'Airbnb',
        bookingId: 'AB-NEW',
        cmBookingId: 'CM-NEW',
        bookedOn: '2026-09-01 10:00:00',
        checkin: '2026-09-15',
        checkout: '2026-09-18',
        segment: 'OTA',
        specialRequests: null,
        pah: false,
        amount: { amountAfterTax: 5000, amountBeforeTax: 4500, tax: 500, currency: 'MXN', commission: 150, tcs: null, tds: null },
        rooms: [{ roomCode: 'MAR-302', rateplanCode: 'RP-1', guestName: 'Ana Torres', occupancy: { adults: 2, children: 0 }, prices: [] }],
      },
    });
    mockFetch.mockResolvedValue({ ok: true, reservas: [FETCH_ITEM_BOOK] });
    const result = await runReconciliation({ tenantId: 't1' });
    expect(result.sinCambios).toBe(1);
    expect(result.creadas).toBe(0);
    expect(result.actualizadas).toBe(0);
    expect(mockProcessBook).not.toHaveBeenCalled();
    expect(mockProcessModify).not.toHaveBeenCalled();
  });

  it('aplica modify cuando los datos difieren (checkout cambiado)', async () => {
    const modified = {
      ...FETCH_ITEM_BOOK,
      bookingId: 'AB-OLD',
      checkout: '2026-09-20', // difiere del payload interno (2026-09-12)
    };
    mockFindReservation.mockResolvedValue(EXISTING_RESERVATION);
    mockFetch.mockResolvedValue({ ok: true, reservas: [modified] });
    const result = await runReconciliation({ tenantId: 't1' });
    expect(result.actualizadas).toBe(1);
    expect(mockProcessModify).toHaveBeenCalledWith('t1', 'p1', null, expect.objectContaining({ bookingId: 'AB-OLD', checkout: '2026-09-20' }));
  });

  it('procesa una cancelación explícita del proveedor', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      reservas: [{ action: 'cancel', hotelCode: 'HOTEL-1', channel: 'Airbnb', bookingId: 'AB-OLD' }],
    });
    const result = await runReconciliation({ tenantId: 't1' });
    expect(result.canceladas).toBe(1);
    expect(mockProcessCancel).toHaveBeenCalledWith('t1', expect.objectContaining({ action: 'cancel', bookingId: 'AB-OLD' }));
  });

  it('registra divergencia de reserva activa ausente del fetch sin cancelarla por defecto', async () => {
    mockFindManyReservations.mockResolvedValue([
      { id: 'r-active', channel: 'Booking.com', externalBookingId: 'BK-888', estado: 'confirmed' },
    ]);
    mockFetch.mockResolvedValue({ ok: true, reservas: [] });
    const result = await runReconciliation({ tenantId: 't1' });
    expect(result.divergencias).toBe(1);
    expect(result.canceladas).toBe(0);
    expect(mockProcessCancel).not.toHaveBeenCalled();
  });

  it('cancela reservas ausentes solo si cancelarAusentes=true', async () => {
    mockFindManyReservations.mockResolvedValue([
      { id: 'r-active', channel: 'Booking.com', externalBookingId: 'BK-888', estado: 'confirmed' },
    ]);
    mockFetch.mockResolvedValue({ ok: true, reservas: [] });
    mockProcessCancel.mockResolvedValue({ ok: true, status: 'cancelada', reservationId: 'r-active' });
    const result = await runReconciliation({ tenantId: 't1', cancelarAusentes: true });
    expect(result.canceladas).toBe(1);
    expect(mockProcessCancel).toHaveBeenCalled();
  });

  it('registra el fallo de fetch en el resumen y no rompe', async () => {
    mockFetch.mockResolvedValue({ ok: false, error: 'HTTP 500', httpStatus: 500, duracionMs: 10 });
    const result = await runReconciliation({ tenantId: 't1' });
    expect(result.ok).toBe(false);
    expect(result.fetchFallidos).toBe(1);
    expect(result.errores.length).toBe(1);
    expect(mockUpdateStatus).toHaveBeenCalledWith(expect.objectContaining({ estado: 'error', error: true }));
  });

  it('escribe un log de auditoría por propiedad con el resumen', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [FETCH_ITEM_BOOK] });
    await runReconciliation({ tenantId: 't1' });
    expect(mockCreateSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'reconciliacion',
          operacion: 'reconciliacion',
          responseBody: expect.objectContaining({ creadas: 1 }),
        }),
      })
    );
  });

  it('respeta aislamiento por tenant (filtra por tenantId)', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [FETCH_ITEM_BOOK] });
    await runReconciliation({ tenantId: 't2' });
    expect(mockFindProperties).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 't2' }) })
    );
  });
});