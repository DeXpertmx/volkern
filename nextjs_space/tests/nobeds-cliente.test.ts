import { describe, it, expect, vi } from 'vitest';
import {
  crearClienteNobeds,
  ErrorNobeds,
  NOBEDS_PROVIDER_KEY,
} from '@/lib/hospitality/nobeds/cliente';

const TOKEN = 'token-de-la-propiedad-123';
const BASE = 'https://api.example.test';

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function html(cuerpo: string, status = 500): Response {
  return new Response(cuerpo, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function clienteCon(fetchImpl: typeof fetch, timeoutMs?: number) {
  return crearClienteNobeds({ token: TOKEN, baseUrl: BASE, fetchImpl, timeoutMs });
}

function espia(respuesta: () => Response) {
  const llamadas: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    llamadas.push(String(url));
    return respuesta();
  }) as typeof fetch;
  return { fetchImpl, llamadas };
}

// Payloads copiados del API real (26-oct-2026) con el token de demostración.
const STATUS_REAL = {
  hotelName: 'Hotel de Demo',
  subscriptionTill: '2026-08-28T06:56:33.5533232',
  isActive: true,
  serverTime: '2026-10-26T11:23:20.4067633Z',
  rentalsCount: 2,
  rentals: [
    {
      roomId: 2531705,
      title: 'Vista lago balcón ingreso calle',
      active: true,
      integrations: { airbnb: 'Disconnected', booking: 'Disconnected' },
    },
    {
      roomId: 2548158,
      title: 'Vista jardin doble cama',
      active: false,
      integrations: { booking: 'Connected' },
    },
  ],
};

const RENTAL_REAL = {
  active: 1,
  room_id: 2531705,
  title: 'Vista lago balcón ingreso calle',
  type: 'rent',
  subtype: 'private-room',
  stars: 5,
  guests: 2,
  children: 0,
  currencycode: null,
  checkin_time: 14,
  checkout_time: 12,
  images:
    'https://images.example/a.jpg,https://images.example/b.jpg',
  booking_room_id: '14279259',
  booking_rate_id: null,
  airbnb_listing_id: '517812456',
  agoda_room_id: null,
};

const NOCHE_REAL = {
  rid: 11522421,
  room_id: 2531705,
  date: '2026-11-01T00:00:00',
  price: 99,
  quantity: 1,
  comment: 'Availability modal SET quantity: 1\n2026-05-19 10:41-Owner => …',
  created: '2026-05-19T10:41:09',
  updated: '2026-05-19T10:41:40',
  min_stay: null,
  max_stay: 3,
  closed: null,
  coa: null,
  cod: null,
  mah: 2,
};

const RESERVA_REAL = {
  order_id: 3048188,
  hotel_id: 0,
  room_id: 2548159,
  referral: 'Agoda.com',
  referral_order_id: 'AG-6003048188',
  checkin: '2026-10-25T00:00:00',
  checkout: '2026-10-27T00:00:00',
  name: 'Demo Guest',
  email: 'demo@nobeds.com',
  phone: '+37000000000',
  country: 'LT',
  guests: 2,
  childrens: null,
  infants: null,
  nights: 2,
  price: 85,
  total: 170,
  status: 'PaidOTA',
  comment: 'demo :)',
  created: '2026-10-18T00:00:00',
  updated: '2026-10-06T23:15:08.853',
  canceled: null,
};

describe('NOBEDS — cliente HTTP', () => {
  it('su clave de proveedor es estable y sin marca visible', () => {
    expect(NOBEDS_PROVIDER_KEY).toBe('nobeds');
  });

  it('pone el token en la ruta y los parámetros con los nombres medidos', async () => {
    const { fetchImpl, llamadas } = espia(() => json([NOCHE_REAL]));
    const cliente = clienteCon(fetchImpl);

    await cliente.disponibilidad({ roomId: 2531705, desde: '2026-11-01', hasta: '2026-11-05' });

    expect(llamadas).toHaveLength(1);
    const url = new URL(llamadas[0]);
    expect(url.pathname).toBe(`/api/Availability/${TOKEN}`);
    expect(url.searchParams.get('room_id')).toBe('2531705');
    expect(url.searchParams.get('fromdate')).toBe('2026-11-01');
    expect(url.searchParams.get('todate')).toBe('2026-11-05');
  });

  it('reservas pide fromdate/todate, que filtran por check-in', async () => {
    const { fetchImpl, llamadas } = espia(() => json([RESERVA_REAL]));
    const cliente = clienteCon(fetchImpl);

    await cliente.reservas({ desde: '2026-10-20', hasta: '2026-11-05' });

    const url = new URL(llamadas[0]);
    expect(url.pathname).toBe(`/api/Bookings/${TOKEN}`);
    expect(url.searchParams.get('fromdate')).toBe('2026-10-20');
    expect(url.searchParams.get('todate')).toBe('2026-11-05');
  });

  it('normaliza Status (camelCase) sin confundir activo con el estado del canal', async () => {
    const { fetchImpl } = espia(() => json(STATUS_REAL));
    const cliente = clienteCon(fetchImpl);

    const estado = await cliente.estado();

    expect(estado.hotel).toBe('Hotel de Demo');
    expect(estado.activo).toBe(true);
    expect(estado.rentalsCount).toBe(2);
    expect(estado.rentals[0]).toEqual({
      roomId: 2531705,
      titulo: 'Vista lago balcón ingreso calle',
      activo: true,
      integraciones: { airbnb: 'Disconnected', booking: 'Disconnected' },
    });
    expect(estado.rentals[1].activo).toBe(false);
    expect(estado.rentals[1].integraciones).toEqual({ booking: 'Connected' });
  });

  it('normaliza Rentals (snake_case, active: 1) y separa los ids por canal', async () => {
    const { fetchImpl } = espia(() => json([RENTAL_REAL]));
    const cliente = clienteCon(fetchImpl);

    const [rental] = await cliente.rentals();

    expect(rental).toMatchObject({
      roomId: 2531705,
      titulo: 'Vista lago balcón ingreso calle',
      activo: true,
      tipo: 'rent',
      subtipo: 'private-room',
      estrellas: 5,
      adultos: 2,
      ninos: 0,
      horaCheckIn: 14,
      horaCheckOut: 12,
    });
    expect(rental.imagenes).toHaveLength(2);
    expect(rental.idsCanal).toEqual({
      booking_room_id: '14279259',
      airbnb_listing_id: '517812456',
    });
  });

  it('una noche con quantity 0 cuenta como cerrada aunque closed venga nulo', async () => {
    const { fetchImpl } = espia(() => json([{ ...NOCHE_REAL, quantity: 0 }]));
    const cliente = clienteCon(fetchImpl);

    const [noche] = await cliente.disponibilidad({ desde: '2026-11-01', hasta: '2026-11-02' });

    expect(noche.cerrado).toBe(true);
    expect(noche.fecha).toBe('2026-11-01');
    expect(noche.maxStay).toBe(3);
    expect(noche.antelacionMinima).toBe(2);
    expect(noche.comentario).toContain('SET quantity');
  });

  it('un estado de cobro no se convierte en estado de reserva al normalizar', async () => {
    const { fetchImpl } = espia(() => json([RESERVA_REAL]));
    const cliente = clienteCon(fetchImpl);

    const [reserva] = await cliente.reservas({ desde: '2026-10-01', hasta: '2026-10-31' });

    expect(reserva.orderId).toBe('3048188');
    expect(reserva.estadoCrudo).toBe('PaidOTA');
    expect(reserva.estado).toBeNull();
    expect(reserva.familiaEstado).toBe('cobro');
    expect(reserva.requiereRevision).toBe(true);
    expect(reserva.canal).toBe('agoda.com');
    expect(reserva.checkIn).toBe('2026-10-25');
    expect(reserva.checkOut).toBe('2026-10-27');
    expect(reserva.noches).toBe(2);
    expect(reserva.total).toBe(170);
    expect(reserva.ninos).toBe(0);
    expect(reserva.bebes).toBe(0);
  });

  it('calcula las noches si el proveedor no las manda', async () => {
    const { fetchImpl } = espia(() => json([{ ...RESERVA_REAL, nights: null }]));
    const cliente = clienteCon(fetchImpl);
    const [reserva] = await cliente.reservas({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(reserva.noches).toBe(2);
  });

  it('un 404 al leer es credencial, no «no existe»', async () => {
    const { fetchImpl } = espia(() =>
      json(
        {
          type: 'https://tools.ietf.org/html/rfc9110#section-15.5.5',
          title: 'Not Found',
          status: 404,
        },
        404
      )
    );
    const cliente = clienteCon(fetchImpl);

    await expect(cliente.estado()).rejects.toMatchObject({
      name: 'ErrorNobeds',
      tipo: 'token',
      httpStatus: 404,
    });
  });

  it('un 500 con HTML se clasifica como servidor y no se intenta parsear', async () => {
    const { fetchImpl } = espia(() =>
      html('<!DOCTYPE html><html><body>Server Error</body></html>')
    );
    const cliente = clienteCon(fetchImpl);

    let error: unknown;
    try {
      await cliente.rentals();
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ErrorNobeds);
    expect((error as ErrorNobeds).tipo).toBe('servidor');
    expect((error as ErrorNobeds).httpStatus).toBe(500);
    expect((error as ErrorNobeds).message).toContain('HTML');
  });

  it('un 400 con errors se muestra con el campo que lo rechazó', async () => {
    const { fetchImpl } = espia(() =>
      json({ errors: { fromdate: ['The fromdate field is required.'] } }, 400)
    );
    const cliente = clienteCon(fetchImpl);

    await expect(cliente.reservas({ desde: '2026-10-01', hasta: '2026-10-31' })).rejects.toMatchObject({
      tipo: 'peticion',
      httpStatus: 400,
      message: expect.stringContaining('fromdate: The fromdate field is required.'),
    });
  });

  it('un 200 que no es JSON es error de respuesta, no una lista vacía', async () => {
    const { fetchImpl } = espia(() => html('<html>hola</html>', 200));
    const cliente = clienteCon(fetchImpl);

    await expect(cliente.rentals()).rejects.toMatchObject({ tipo: 'respuesta' });
  });

  it('el tiempo agotado es «tiempo», no un error de red genérico', async () => {
    const fetchImpl = (async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }) as unknown as typeof fetch;
    const cliente = clienteCon(fetchImpl, 5);

    await expect(cliente.estado()).rejects.toMatchObject({ tipo: 'tiempo' });
  });

  it('el token nunca aparece en el mensaje ni en la URL saneada del error', async () => {
    const { fetchImpl } = espia(() => html('<html>boom</html>', 500));
    const cliente = clienteCon(fetchImpl);

    let error: ErrorNobeds | null = null;
    try {
      await cliente.estado();
    } catch (e) {
      error = e as ErrorNobeds;
    }

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain(TOKEN);
    expect(error?.urlSaneada ?? '').not.toContain(TOKEN);
    expect(error?.urlSaneada ?? '').toContain('•••');
  });

  it('rechaza fechas mal formadas sin llamar al proveedor', async () => {
    const { fetchImpl, llamadas } = espia(() => json([]));
    const cliente = clienteCon(fetchImpl);

    await expect(cliente.reservas({ desde: '01-10-2026', hasta: '2026-10-31' })).rejects.toMatchObject({
      tipo: 'peticion',
    });
    await expect(cliente.reservas({ desde: '2026-10-31', hasta: '2026-10-01' })).rejects.toMatchObject({
      tipo: 'peticion',
    });
    expect(llamadas).toHaveLength(0);
  });

  it('no se puede construir sin token', () => {
    expect(() => crearClienteNobeds({ token: '   ' })).toThrow(ErrorNobeds);
    expect(() => crearClienteNobeds({ token: '' })).toThrow(/token/i);
  });

  it('no hace ninguna escritura: el cliente solo expone lecturas', () => {
    const { fetchImpl } = espia(() => json([]));
    const cliente = clienteCon(fetchImpl);
    expect(Object.keys(cliente).sort()).toEqual([
      'disponibilidad',
      'estado',
      'rentals',
      'reservas',
    ]);
    expect(vi.isMockFunction(fetchImpl)).toBe(false);
  });
});
