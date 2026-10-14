// @vitest-environment node

/**
 * Guardia del aviso temprano del push perdido
 * (`lib/hospitality/reservas-faltantes.ts`): reservas VIVAS que el proveedor
 * reporta y el ERP no tiene.
 *
 * Dos cosas se comprueban aquí, y la segunda importa tanto como la primera:
 *
 *  1. Que la comparación es la MISMA del barrido —misma ventana, misma puerta
 *     de forma, misma regla de estancia importable, mismo vínculo—, para que el
 *     número que enseña el panel sea el que el barrido crearía ahora mismo.
 *  2. Que el sondeo NO PUEDE escribir: el mock de Prisma solo tiene lecturas
 *     (una escritura lanzaría), no se importa ningún `process*` ni el push, y
 *     una guardia de fuente lo deja fijado para que no se pierda por descuido.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { detectarReservasFaltantes } from '../lib/hospitality/reservas-faltantes';

const mockFindProperties = vi.fn();
const mockFindReservationsExistentes = vi.fn();
const mockFetch = vi.fn();
const mockResolveMapping = vi.fn();

// Solo lecturas: si el módulo intentara crear, actualizar o borrar, `prisma.…`
// sería `undefined` y la prueba fallaría con un TypeError (no en silencio).
vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityProperty: { findMany: (...a: unknown[]) => mockFindProperties(...a) },
    hospitalityReservation: { findMany: (...a: unknown[]) => mockFindReservationsExistentes(...a) },
  },
}));

vi.mock('@/lib/hospitality/connectivity', () => ({
  fetchReservations: (...a: unknown[]) => mockFetch(...a),
}));

vi.mock('@/lib/hospitality/reservations', () => ({
  resolveMapping: (...a: unknown[]) => mockResolveMapping(...a),
}));

const PROPIEDAD = {
  id: 'p1',
  tenantId: 't1',
  nombre: 'Villa Mar Azul',
  mappings: [{ externalPropertyId: 'HOTEL-1' }],
};

const ITEM_VIVA = {
  action: 'book',
  hotelCode: 'HOTEL-1',
  channel: 'Booking.com',
  bookingId: '6713291480',
  cmBookingId: 'CM-6713291480',
  // Reservada en agosto de 2026 para julio de 2027: el caso real que el barrido
  // solo recupera mirando 730 días atrás (ver ventana-reservas.ts).
  bookedOn: '2026-08-18 12:00:00',
  checkin: '2027-07-07',
  checkout: '2027-07-10',
  segment: 'OTA',
  amount: { amountAfterTax: 7500, currency: 'MXN' },
  rooms: [
    {
      roomCode: 'MAR-302',
      rateplanCode: 'RP-1',
      guestName: 'Ana Torres',
      occupancy: { adults: 2, children: 1 },
    },
  ],
};

/** Reloj fijo: la ventana y la regla de estancia importable dependen del día. */
const HOY = new Date(2026, 9, 9, 12, 0, 0);

describe('detectarReservasFaltantes — reservas vivas del canal ausentes del ERP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(HOY);
    mockFindProperties.mockResolvedValue([PROPIEDAD]);
    mockFindReservationsExistentes.mockResolvedValue([]);
    mockFetch.mockResolvedValue({ ok: true, reservas: [], duracionMs: 12 });
    mockResolveMapping.mockResolvedValue({
      property: { id: 'p1', tenantId: 't1' },
      unit: { id: 'u1', nombre: 'Suite Ática' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lista una reserva viva que el proveedor reporta y el ERP no tiene', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [ITEM_VIVA], duracionMs: 12 });

    const resumen = await detectarReservasFaltantes({ tenantId: 't1' });

    expect(resumen.ok).toBe(true);
    expect(resumen.errores).toEqual([]);
    expect(resumen.faltantes).toBe(1);
    expect(resumen.totalFetch).toBe(1);
    expect(resumen.lista).toEqual([
      {
        propertyId: 'p1',
        propertyNombre: 'Villa Mar Azul',
        hotelCode: 'HOTEL-1',
        channel: 'Booking.com',
        externalBookingId: '6713291480',
        huesped: 'Ana Torres',
        checkIn: '2027-07-07',
        checkOut: '2027-07-10',
        noches: 3,
        bookedOn: '2026-08-18',
        unidad: 'Suite Ática',
        huespedes: 3,
      },
    ]);
  });

  it('no lista una reserva que ya está en el ERP (misma clave única: tenant + canal + bookingId)', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [ITEM_VIVA], duracionMs: 12 });
    mockFindReservationsExistentes.mockResolvedValue([
      { channel: 'Booking.com', externalBookingId: '6713291480' },
    ]);

    const resumen = await detectarReservasFaltantes({ tenantId: 't1' });

    expect(resumen.faltantes).toBe(0);
    expect(resumen.lista).toEqual([]);
    // La búsqueda de existencia va por el tenant de la PROPIEDAD, nunca por un
    // identificador que venga de fuera.
    expect(mockFindReservationsExistentes).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1' }),
      })
    );
  });

  it('no confunde un bookingId igual de OTRO canal con la misma reserva', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [ITEM_VIVA], duracionMs: 12 });
    mockFindReservationsExistentes.mockResolvedValue([
      { channel: 'Airbnb', externalBookingId: '6713291480' },
    ]);

    const resumen = await detectarReservasFaltantes({ tenantId: 't1' });

    expect(resumen.faltantes).toBe(1);
  });

  it('pide la misma ventana que el barrido: fechas de RESERVA en el horizonte de venta', async () => {
    await detectarReservasFaltantes({ tenantId: 't1' });

    expect(mockFetch).toHaveBeenCalledWith('HOTEL-1', '2024-10-09', '2026-11-08', 't1');
  });

  it('una estancia terminada hace meses no es una faltante (misma regla que el barrido)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      reservas: [{ ...ITEM_VIVA, bookingId: 'VIEJA', checkin: '2026-03-01', checkout: '2026-03-05' }],
      duracionMs: 12,
    });

    const resumen = await detectarReservasFaltantes({ tenantId: 't1' });

    expect(resumen.faltantes).toBe(0);
    expect(resumen.historicas).toBe(1);
    // Ni siquiera se mira si existe: se descarta antes de tocar la base.
    expect(mockFindReservationsExistentes).not.toHaveBeenCalled();
  });

  it('una cancelación reportada no es una reserva viva (la aplica el barrido)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      reservas: [{ action: 'cancel', hotelCode: 'HOTEL-1', channel: 'Booking.com', bookingId: 'C1' }],
      duracionMs: 12,
    });

    const resumen = await detectarReservasFaltantes({ tenantId: 't1' });

    expect(resumen.cancelaciones).toBe(1);
    expect(resumen.faltantes).toBe(0);
  });

  it('cuenta los items sin la forma del contrato en vez de tragárselos', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [{ channel: 'Airbnb' }], duracionMs: 12 });

    const resumen = await detectarReservasFaltantes({ tenantId: 't1' });

    expect(resumen.sinForma).toBe(1);
    expect(resumen.totalFetch).toBe(1);
    expect(resumen.faltantes).toBe(0);
  });

  it('una reserva sin vínculo de unidad se cuenta pero NO se lista (traerla necesita vincularla)', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [ITEM_VIVA], duracionMs: 12 });
    mockResolveMapping.mockResolvedValue(null);

    const resumen = await detectarReservasFaltantes({ tenantId: 't1' });

    expect(resumen.sinVinculo).toBe(1);
    expect(resumen.faltantes).toBe(0);
    expect(resumen.lista).toEqual([]);
  });

  it('un item cuyo vínculo apunta a otra propiedad no se le achaca a esta', async () => {
    mockFetch.mockResolvedValue({ ok: true, reservas: [ITEM_VIVA], duracionMs: 12 });
    mockResolveMapping.mockResolvedValue({
      property: { id: 'p-OTRA', tenantId: 't1' },
      unit: null,
    });

    const resumen = await detectarReservasFaltantes({ tenantId: 't1' });

    expect(resumen.ajenas).toBe(1);
    expect(resumen.faltantes).toBe(0);
  });

  it('un fallo del proveedor en una propiedad no deja el aviso en blanco', async () => {
    mockFindProperties.mockResolvedValue([
      PROPIEDAD,
      { id: 'p2', tenantId: 't1', nombre: 'Casa del Lago', mappings: [{ externalPropertyId: 'HOTEL-2' }] },
    ]);
    mockFetch.mockImplementation(async (hotelCode: string) =>
      hotelCode === 'HOTEL-1'
        ? { ok: false, error: 'HTTP 503', httpStatus: 503, duracionMs: 30 }
        : {
            ok: true,
            reservas: [{ ...ITEM_VIVA, hotelCode: 'HOTEL-2', bookingId: 'BK-2' }],
            duracionMs: 30,
          }
    );
    mockResolveMapping.mockImplementation(async (payload: { hotelCode: string }) => ({
      property: { id: payload.hotelCode === 'HOTEL-2' ? 'p2' : 'p1', tenantId: 't1' },
      unit: null,
    }));

    const resumen = await detectarReservasFaltantes({ tenantId: 't1' });

    expect(resumen.ok).toBe(false);
    expect(resumen.errores).toEqual(['[Villa Mar Azul] HTTP 503']);
    // La otra propiedad sí se comprobó: la lista sale igual.
    expect(resumen.faltantes).toBe(1);
    expect(resumen.propiedades).toBe(2);
  });

  it('acota cuántas propiedades sondea y lo dice, en vez de callarse las que faltan', async () => {
    mockFindProperties.mockResolvedValue([
      { id: 'p1', tenantId: 't1', nombre: 'A', mappings: [{ externalPropertyId: 'H1' }] },
      { id: 'p2', tenantId: 't1', nombre: 'B', mappings: [{ externalPropertyId: 'H2' }] },
      { id: 'p3', tenantId: 't1', nombre: 'C', mappings: [{ externalPropertyId: 'H3' }] },
    ]);

    const resumen = await detectarReservasFaltantes({ tenantId: 't1', maxPropiedades: 2 });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(resumen.propiedades).toBe(2);
    expect(resumen.propiedadesNoSondeadas).toBe(1);
  });

  it('el contador es el número real aunque el listado vaya recortado', async () => {
    const muchas = Array.from({ length: 51 }, (_, i) => ({ ...ITEM_VIVA, bookingId: `B-${i}` }));
    mockFetch.mockResolvedValue({ ok: true, reservas: muchas, duracionMs: 12 });

    const resumen = await detectarReservasFaltantes({ tenantId: 't1' });

    expect(resumen.faltantes).toBe(51);
    expect(resumen.lista).toHaveLength(50);
  });

  it('solo sondea propiedades con vínculo activo y respeta el tenant que se le pasa', async () => {
    await detectarReservasFaltantes({ tenantId: 't2' });

    expect(mockFindProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't2',
          mappings: { some: { provider: 'channel_connectivity', estado: 'activo' } },
        }),
      })
    );
  });

  it('sin tenant sondea todos los tenants con vínculo (panel de plataforma)', async () => {
    await detectarReservasFaltantes();

    const where = (mockFindProperties.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.tenantId).toBeUndefined();
    expect(where.mappings).toBeDefined();
    // El fetch va con el tenant de CADA propiedad (credenciales por hotel).
    expect(mockFetch).toHaveBeenCalledWith('HOTEL-1', expect.any(String), expect.any(String), 't1');
  });

  it('marca cuándo se preguntó: esto es en vivo, no un log', async () => {
    const resumen = await detectarReservasFaltantes({ tenantId: 't1' });

    expect(resumen.comprobadoEn).toBe(new Date(HOY).toISOString());
  });

  // ── El aviso no puede escribir: propiedad estructural, no convención ──────
  it('el módulo no importa ni llama a nada que escriba (ni reservas, ni logs, ni push)', () => {
    const fuente = fs.readFileSync(
      path.resolve(__dirname, '..', 'lib/hospitality/reservas-faltantes.ts'),
      'utf8'
    );
    // Lo que se audita es el CÓDIGO: la cabecera del módulo NOMBRA las
    // funciones que no usa (para explicar por qué no las usa), y eso no es una
    // llamada. Una guardia que no distinguiera comentarios obligaría a no
    // documentar el invariante, que es justo lo contrario de lo que se quiere.
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    for (const prohibido of [
      'processBook',
      'processModify',
      'processCancel',
      'dispatchConnectivityPush',
      'updateConnectivityStatus',
      'hospitalitySyncLog',
      '.create(',
      '.update(',
      '.delete(',
      '.upsert(',
    ]) {
      expect(codigo, `el aviso no puede tocar ${prohibido}`).not.toContain(prohibido);
    }
    // Y lo que sí comparte con el barrido, para que no haya dos verdades.
    expect(codigo).toContain('normalizePayload');
    expect(fuente).toContain('estanciaImportable');
    expect(fuente).toContain('ventanaFetchReservas');
    expect(fuente).toContain('resolveMapping');
  });

  it('la ruta que lo expone es de solo lectura (un GET, sin efectos)', () => {
    const fuente = fs.readFileSync(
      path.resolve(__dirname, '..', 'app/api/admin/conectividad/reservas-faltantes/route.ts'),
      'utf8'
    );

    expect(fuente).toContain('export async function GET');
    expect(fuente).not.toContain('export async function POST');
    expect(fuente).not.toContain('logAuditAction');
    expect(fuente).not.toContain('notifyDeveloperSensitiveAction');
  });
});
