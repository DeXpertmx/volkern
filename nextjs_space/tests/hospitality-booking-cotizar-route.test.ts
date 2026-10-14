// @vitest-environment node
//
// La puerta pública que cotiza (`POST /api/public/booking/<slug>/cotizar`) es la
// que consume el paso 1 del asistente de `/reservar/<slug>`. Al unificar las dos
// páginas en una, la ruta antigua (`GET /api/public/booking/<id>`, con su test)
// se retiró: estas comprobaciones son las que hereda —y ahora sostienen— la
// puerta única:
//
//  - El precio y la disponibilidad los dice el MOTOR (Availability Engine
//    central + tarificación del plan): la ruta no suma ni compara fechas. Un
//    importe calculado aquí sería una segunda verdad sobre el dinero.
//  - Publicar es UNA lista: si la propiedad no está en `propiedadesPublicadas`
//    de la configuración, la ruta no cotiza (ni siquiera llama al motor).
//  - Sin disponibilidad no es un error del cliente: la página tiene que poder
//    explicarlo con sus palabras (200 con `motivo`, no 500).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolverPaginaPublica: vi.fn(),
  cotizarDisponibilidad: vi.fn(),
}));

vi.mock('@/lib/hospitality/booking-engine', () => ({
  resolverPaginaPublica: mocks.resolverPaginaPublica,
  cotizarDisponibilidad: mocks.cotizarDisponibilidad,
}));

import { POST } from '@/app/api/public/booking/[slug]/cotizar/route';

const config = { tenantId: 'tenant_a', requierePagoOnline: false };

const pagina = {
  ok: true as const,
  config,
  tenant: { id: 'tenant_a', nombre: 'Hotel Centro' },
  moneda: 'MXN',
  propiedades: [{ id: 'prop_a', unidades: [{ id: 'unit_a' }] }],
};

function request(cuerpo: Record<string, unknown>) {
  return new Request('http://test.local/api/public/booking/mi-hotel/cotizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
}

const ctx = { params: Promise.resolve({ slug: 'mi-hotel' }) };

const cuerpoBase = {
  propertyId: 'prop_a',
  checkIn: '2027-03-01',
  checkOut: '2027-03-04',
  adultos: 2,
  ninos: 0,
};

const unidades = [
  {
    unitId: 'unit_a',
    propertyId: 'prop_a',
    nombre: 'Suite Volcán',
    tipo: 'suite',
    capacidad: 4,
    tarifaPorNoche: 1200,
    desgloseNoches: [{ fecha: '2027-03-01', precio: 1200 }],
    cotizacion: { alojamiento: 3600, limpieza: 300, total: 3900, anticipo: 780, saldo: 3120 },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolverPaginaPublica.mockResolvedValue(pagina);
  mocks.cotizarDisponibilidad.mockResolvedValue({
    ok: true,
    noches: 3,
    moneda: 'MXN',
    unidades,
  });
});

describe('POST /cotizar — la disponibilidad y el precio los dice el motor', () => {
  it('devuelve las unidades con el desglose del servidor y el rango tal cual', async () => {
    const res = await POST(request(cuerpoBase), ctx);
    expect(res.status).toBe(200);

    const entrada = mocks.cotizarDisponibilidad.mock.calls[0][0];
    expect(entrada).toEqual(
      expect.objectContaining({
        tenantId: 'tenant_a',
        propertyId: 'prop_a',
        unitId: null,
        moneda: 'MXN',
      })
    );
    expect(entrada.checkIn.getFullYear()).toBe(2027);
    expect(entrada.checkIn.getMonth()).toBe(2);
    expect(entrada.checkIn.getDate()).toBe(1);
    expect(entrada.checkOut.getDate()).toBe(4);
    expect(entrada.adultos).toBe(2);
    expect(entrada.ninos).toBe(0);

    const datos = await res.json();
    expect(datos.ok).toBe(true);
    expect(datos.noches).toBe(3);
    expect(datos.unidades).toEqual([
      {
        unitId: 'unit_a',
        propertyId: 'prop_a',
        nombre: 'Suite Volcán',
        tipo: 'suite',
        capacidad: 4,
        tarifaPorNoche: 1200,
        desgloseNoches: [{ fecha: '2027-03-01', precio: 1200 }],
        desglose: { alojamiento: 3600, limpieza: 300, total: 3900, anticipo: 780, saldo: 3120 },
      },
    ]);
  });

  it('la propiedad que no está publicada no se cotiza: ni se llama al motor', async () => {
    const res = await POST(request({ ...cuerpoBase, propertyId: 'prop_privada' }), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Elige una de las propiedades publicadas.');
    expect(mocks.cotizarDisponibilidad).not.toHaveBeenCalled();
  });

  it('sin propertyId tampoco: la publicación es una lista, no una suposición', async () => {
    const res = await POST(request({ ...cuerpoBase, propertyId: undefined }), ctx);
    expect(res.status).toBe(404);
    expect(mocks.cotizarDisponibilidad).not.toHaveBeenCalled();
  });

  it('una página inexistente es 404 y una inactiva es 409, con su frase', async () => {
    mocks.resolverPaginaPublica.mockResolvedValue({
      ok: false,
      motivo: 'no_existe',
      mensaje: 'Esta página de reservas no existe.',
    });
    const inexistente = await POST(request(cuerpoBase), ctx);
    expect(inexistente.status).toBe(404);
    expect((await inexistente.json()).error).toBe('Esta página de reservas no existe.');

    mocks.resolverPaginaPublica.mockResolvedValue({
      ok: false,
      motivo: 'inactiva',
      mensaje: 'Las reservas online están cerradas.',
    });
    const inactiva = await POST(request(cuerpoBase), ctx);
    expect(inactiva.status).toBe(409);
    expect((await inactiva.json()).error).toBe('Las reservas online están cerradas.');
    expect(mocks.cotizarDisponibilidad).not.toHaveBeenCalled();
  });

  it('el rango inválido se rechaza antes de cotizar (salida anterior o fechas imposibles)', async () => {
    const invertido = await POST(
      request({ ...cuerpoBase, checkIn: '2027-03-04', checkOut: '2027-03-01' }),
      ctx
    );
    expect(invertido.status).toBe(400);
    expect((await invertido.json()).error).toBe('La salida tiene que ser posterior a la entrada.');

    const sinFecha = await POST(request({ ...cuerpoBase, checkIn: undefined }), ctx);
    expect(sinFecha.status).toBe(400);
    expect((await sinFecha.json()).error).toBe('Indica la fecha de entrada y la de salida.');

    const imposible = await POST(
      request({ ...cuerpoBase, checkIn: '2027-02-31', checkOut: '2027-03-04' }),
      ctx
    );
    expect(imposible.status).toBe(400);

    expect(mocks.cotizarDisponibilidad).not.toHaveBeenCalled();
  });

  it('la ocupación se acota: 0 adultos entra como 1 y los niños se cuentan aparte', async () => {
    await POST(request({ ...cuerpoBase, adultos: 0, ninos: 2 }), ctx);
    const entrada = mocks.cotizarDisponibilidad.mock.calls[0][0];
    expect(entrada.adultos).toBe(1);
    expect(entrada.ninos).toBe(2);
  });

  it('sin disponibilidad responde 200 con el motivo: la página lo explica, no es un 500', async () => {
    mocks.cotizarDisponibilidad.mockResolvedValue({
      ok: false,
      motivo: 'sin_disponibilidad',
      mensaje: 'No queda ninguna unidad libre para esas fechas.',
    });
    const res = await POST(request(cuerpoBase), ctx);
    expect(res.status).toBe(200);
    const datos = await res.json();
    expect(datos).toEqual({
      ok: false,
      motivo: 'sin_disponibilidad',
      error: 'No queda ninguna unidad libre para esas fechas.',
    });
  });

  it('si el motor revienta, la ruta no filtra el error: 500 con frase', async () => {
    mocks.cotizarDisponibilidad.mockRejectedValue(new Error('conexión perdida'));
    const res = await POST(request(cuerpoBase), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('No se pudo calcular el precio. Inténtalo de nuevo.');
  });
});
