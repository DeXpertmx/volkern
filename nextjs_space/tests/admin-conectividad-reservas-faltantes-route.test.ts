// @vitest-environment node

/**
 * Guardia de `GET /api/admin/conectividad/reservas-faltantes`.
 *
 * Es la superficie que convierte un push perdido en algo accionable ANTES del
 * barrido del día siguiente: el panel la llama al abrirse y enseña las reservas
 * vivas que el canal tiene vendidas y el ERP no conoce. Lo que se fija:
 *  - solo Superadmin (sondea todos los tenants y devuelve datos de reservas);
 *  - se responde SIEMPRE 200 con el resumen en el body, porque un fallo del
 *    proveedor es parte de la respuesta (`errores`) y el proxy reemplazaría un
 *    5xx por «error code: 502», perdiendo la causa;
 *  - la ruta no escribe nada ni deja traza de acción sensible: es un sondeo;
 *  - un fallo de red del proveedor (o de la base) NO se convierte en «no falta
 *    nada»: sin resumen, la ruta no inventa una lista vacía.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  detectarReservasFaltantes: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/hospitality/reservas-faltantes', () => ({
  detectarReservasFaltantes: (...a: unknown[]) => mocks.detectarReservasFaltantes(...a),
}));

const { getServerSession } = await import('next-auth');
const { GET } = await import('@/app/api/admin/conectividad/reservas-faltantes/route');

const RESUMEN = {
  ok: true,
  propiedades: 1,
  propiedadesNoSondeadas: 0,
  totalFetch: 3,
  faltantes: 1,
  historicas: 0,
  sinForma: 0,
  cancelaciones: 0,
  sinVinculo: 0,
  ajenas: 0,
  comprobadoEn: '2026-10-14T10:00:00.000Z',
  errores: [],
  lista: [
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
      huespedes: 2,
    },
  ],
};

describe('GET /api/admin/conectividad/reservas-faltantes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as any).mockResolvedValue({ user: { id: 'u1' } });
    mocks.user.findUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Superadmin' } });
    mocks.detectarReservasFaltantes.mockResolvedValue(RESUMEN);
  });

  it('sin sesión → 401 y no se sondea nada', async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.detectarReservasFaltantes).not.toHaveBeenCalled();
  });

  it('rol distinto de Superadmin → 403 y no se sondea nada', async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Admin' } });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.detectarReservasFaltantes).not.toHaveBeenCalled();
  });

  it('publica el resumen del sondeo con la reserva concreta que falta', async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.faltantes).toBe(1);
    expect(data.lista[0]).toEqual(
      expect.objectContaining({
        channel: 'Booking.com',
        externalBookingId: '6713291480',
        noches: 3,
        hotelCode: 'HOTEL-1',
      })
    );
  });

  it('un fallo del proveedor viaja en el body con HTTP 200 (el proxy no puede borrar la causa)', async () => {
    mocks.detectarReservasFaltantes.mockResolvedValue({
      ...RESUMEN,
      ok: false,
      faltantes: 0,
      lista: [],
      errores: ['[Villa Mar Azul] HTTP 503'],
    });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.errores).toEqual(['[Villa Mar Azul] HTTP 503']);
    // Y no se inventa una lista vacía que se pueda leer como «no falta nada».
    expect(data.lista).toEqual([]);
  });

  it('si el sondeo revienta → 500 y ni rastro de la casa (sin filtrar el error crudo)', async () => {
    mocks.detectarReservasFaltantes.mockRejectedValue(new Error('boom'));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(data)).not.toContain('boom');
  });
});
