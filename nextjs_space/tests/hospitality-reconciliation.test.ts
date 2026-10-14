import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
const mockDispatch = vi.fn();

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

// El push posterior a un barrido con cambios entra por import dinámico, como en
// el resto del producto (evita el ciclo con `reservations`).
vi.mock('../lib/hospitality/sync', () => ({
  dispatchConnectivityPush: (...a: any[]) => mockDispatch(...a),
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

/**
 * El reloj del barrido, fijo.
 *
 * Estas pruebas tienen dos decisiones que dependen del DÍA —la ventana que se
 * le pide al proveedor y si una estancia ya terminada entra al ERP— y sin un
 * reloj fijo la suite cambiaría de resultado sola al pasar las semanas (la
 * estancia de `FETCH_ITEM_BOOK` termina el 18 sep 2026: entra mientras no hayan
 * pasado 30 días de eso).
 */
const HOY = new Date(2026, 9, 9, 12, 0, 0);

describe('runReconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(HOY);
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
    mockDispatch.mockResolvedValue({ ok: true, pushCount: 4, errores: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('guarda la lista concreta de ausentes en el log y en el resumen (para el panel de admin)', async () => {
    mockFindManyReservations.mockResolvedValue([
      {
        id: 'r-active',
        channel: 'Booking.com',
        externalBookingId: 'BK-888',
        estado: 'confirmed',
        checkIn: new Date('2026-09-20T15:00:00Z'),
        checkOut: new Date('2026-09-24T11:00:00Z'),
        occupancyAdults: 2,
        occupancyChildren: 1,
        unit: { nombre: 'Suite Ática' },
      },
    ]);
    mockFetch.mockResolvedValue({ ok: true, reservas: [] });
    const result = await runReconciliation({ tenantId: 't1' });

    // En el resumen devuelto a la API...
    expect(result.detalle?.[0]?.ausentes).toEqual([
      {
        reservationId: 'r-active',
        externalBookingId: 'BK-888',
        channel: 'Booking.com',
        estado: 'confirmed',
        checkIn: '2026-09-20',
        checkOut: '2026-09-24',
        unidad: 'Suite Ática',
        huespedes: 3,
      },
    ]);
    // ...y en el log de auditoría, que es de donde lee el panel de admin.
    expect(mockCreateSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responseBody: expect.objectContaining({
            divergencias: 1,
            ausentes: [expect.objectContaining({ externalBookingId: 'BK-888', huespedes: 3 })],
          }),
        }),
      })
    );
  });

  it('la ausente cancelada en la misma corrida (cancelarAusentes) no queda como divergencia pendiente', async () => {
    mockFindManyReservations.mockResolvedValue([
      { id: 'r-active', channel: 'Booking.com', externalBookingId: 'BK-888', estado: 'confirmed' },
    ]);
    mockFetch.mockResolvedValue({ ok: true, reservas: [] });
    mockProcessCancel.mockResolvedValue({ ok: true, status: 'cancelada', reservationId: 'r-active' });

    const result = await runReconciliation({ tenantId: 't1', cancelarAusentes: true });
    expect(result.canceladas).toBe(1);
    expect(result.detalle?.[0]?.ausentes).toBeUndefined();
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

  it('audita el fallo de fetch en HospitalitySyncLog (§30)', async () => {
    mockFetch.mockResolvedValue({ ok: false, error: 'HTTP 500', httpStatus: 500, duracionMs: 10 });
    await runReconciliation({ tenantId: 't1' });
    expect(mockCreateSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'reconciliacion',
          operacion: 'reconciliacion',
          estado: 'error',
          httpStatus: 500,
          errorMensaje: 'HTTP 500',
        }),
      })
    );
  });

  it('escribe un log de auditoría por propiedad con el resumen', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [FETCH_ITEM_BOOK] });
    await runReconciliation({ tenantId: 't1' });
    expect(mockCreateSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'reconciliacion',
          operacion: 'reconciliacion',
          responseBody: expect.objectContaining({ creadas: 1, reservasDevueltas: 1 })
        }),
      })
    );
  });

  it('pide las reservas HECHAS en el horizonte de venta, no solo las de hoy', async () => {
    // El proveedor filtra por fecha de RESERVA: con «hoy → +30» una reserva
    // hecha ayer no se ve nunca, y con 30 días atrás se pierde para siempre
    // cualquier reserva viva hecha hace meses (lib/hospitality/ventana-reservas.ts).
    mockFetch.mockResolvedValue({ ok: true, reservas: [] });
    await runReconciliation({ tenantId: 't1' });
    expect(mockFetch).toHaveBeenCalledWith('HOTEL-1', '2024-10-09', '2026-11-08', 't1');
  });

  it('diasAtras ensancha el barrido hacia atrás sin mover el final', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [] });
    await runReconciliation({ tenantId: 't1', diasAtras: 90 });
    expect(mockFetch).toHaveBeenCalledWith('HOTEL-1', '2026-07-11', '2026-11-08', 't1');
  });

  // ── La ventana profunda no puede volcar la historia del hotel al ERP ─────

  it('una reserva VIVA hecha hace meses entra al ERP (su push se perdió y nadie la iba a recuperar)', async () => {
    // Caso real: booking.com 5151446790, reservada el 10 abr 2026 para una
    // estancia del 30 jul al 3 ago 2027. Con el barrido de 30 días atrás, esa
    // reserva era invisible para siempre y las noches seguían abiertas aquí.
    const vieja = {
      ...FETCH_ITEM_BOOK,
      bookingId: 'AB-VIEJA',
      bookedOn: '2026-04-10 13:57:19',
      checkin: '2027-07-30',
      checkout: '2027-08-03',
    };
    mockFetch.mockResolvedValue({ ok: true, reservas: [vieja] });

    const result = await runReconciliation({ tenantId: 't1' });

    expect(result.creadas).toBe(1);
    expect(result.historicas).toBe(0);
    expect(mockProcessBook).toHaveBeenCalledWith('t1', 'p1', null, expect.objectContaining({ bookingId: 'AB-VIEJA' }));
  });

  it('una estancia terminada hace meses NO se importa: se cuenta como histórica', async () => {
    const historica = {
      ...FETCH_ITEM_BOOK,
      bookingId: 'AB-HISTORICA',
      bookedOn: '2026-03-01 09:00:00',
      checkin: '2026-04-01',
      checkout: '2026-04-05',
    };
    mockFetch.mockResolvedValue({ ok: true, reservas: [historica] });

    const result = await runReconciliation({ tenantId: 't1' });

    expect(result.creadas).toBe(0);
    expect(result.historicas).toBe(1);
    expect(result.divergencias).toBe(0);
    expect(mockProcessBook).not.toHaveBeenCalled();
    // No hay nada que empujar: no tocó ni una noche.
    expect(mockDispatch).not.toHaveBeenCalled();
    // Lo que se dejó fuera se ve en el log (no desaparece en silencio).
    expect(mockCreateSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responseBody: expect.objectContaining({ reservasDevueltas: 1, historicas: 1, creadas: 0 }),
        }),
      })
    );
  });

  it('la cancelación repetida de una reserva ya cancelada no es un cambio (ni dispara push)', async () => {
    // Medido en producción: el barrido contaba «canceladas: 1» en CADA pasada
    // por la misma cancelación vieja y con ello empujaba inventario y tarifas
    // completos al canal, dos veces al día, sin nada que empujar.
    mockProcessCancel.mockResolvedValue({ ok: true, status: 'duplicado', reservationId: 'r1' });
    mockFetch.mockResolvedValue({
      ok: true,
      reservas: [{ action: 'cancel', hotelCode: 'HOTEL-1', channel: 'Booking.com', bookingId: 'AB-OLD', checkout: '2027-01-06' }],
    });

    const result = await runReconciliation({ tenantId: 't1' });

    expect(result.canceladas).toBe(0);
    expect(result.sinCambios).toBe(1);
    expect(result.divergencias).toBe(0);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('una cancelación de algo que no tenemos y cuya estancia ya terminó no es una divergencia', async () => {
    mockProcessCancel.mockResolvedValue({ ok: false, status: 'no_encontrada' });
    mockFetch.mockResolvedValue({
      ok: true,
      reservas: [{ action: 'cancel', hotelCode: 'HOTEL-1', channel: 'Booking.com', bookingId: 'AB-DESCONOCIDA', checkout: '2026-04-05' }],
    });

    const result = await runReconciliation({ tenantId: 't1' });

    expect(result.historicas).toBe(1);
    expect(result.divergencias).toBe(0);
  });

  it('una cancelación de algo que no tenemos y que aún importa SÍ se registra como divergencia', async () => {
    mockProcessCancel.mockResolvedValue({ ok: false, status: 'no_encontrada' });
    mockFetch.mockResolvedValue({
      ok: true,
      reservas: [{ action: 'cancel', hotelCode: 'HOTEL-1', channel: 'Booking.com', bookingId: 'AB-DESCONOCIDA', checkout: '2027-01-19' }],
    });

    const result = await runReconciliation({ tenantId: 't1' });

    expect(result.divergencias).toBe(1);
    expect(result.historicas).toBe(0);
  });

  it('sin cambios no empuja nada al canal', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [] });
    await runReconciliation({ tenantId: 't1' });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('al recuperar una reserva empuja la disponibilidad (la unidad vendida aquí no puede quedar abierta allí)', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [FETCH_ITEM_BOOK] });
    const result = await runReconciliation({ tenantId: 't1' });

    expect(mockDispatch).toHaveBeenCalledWith('t1', 'p1', 'reconciliacion');
    expect(result.detalle?.[0].push).toEqual({ ok: true, pushCount: 4, errores: 0 });
    expect(mockCreateSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responseBody: expect.objectContaining({ creadas: 1, push: { ok: true, pushCount: 4, errores: 0 } }),
        }),
      })
    );
  });

  it('un push que falla queda en el resumen con su error, sin romper el barrido', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [FETCH_ITEM_BOOK] });
    mockDispatch.mockRejectedValue(new Error('caído'));

    const result = await runReconciliation({ tenantId: 't1' });

    expect(result.ok).toBe(true);
    expect(result.detalle?.[0].push).toEqual({ ok: false, pushCount: 0, errores: 1 });
  });

  it('cuenta lo que el proveedor devuelve sin forma de contrato (no desaparece)', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [{ channel: 'Airbnb' }] });
    const result = await runReconciliation({ tenantId: 't1' });
    expect(result.totalFetch).toBe(1);
    expect(mockCreateSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responseBody: expect.objectContaining({
            reservasDevueltas: 1,
            sinForma: 1,
            creadas: 0,
          }),
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