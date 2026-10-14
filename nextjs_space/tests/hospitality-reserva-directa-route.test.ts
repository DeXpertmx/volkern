// @vitest-environment node
//
// La ruta pública que reserva (`POST /api/public/booking/<slug>/reservar`) es el
// único camino de escritura del flujo directo. Lo que se fija aquí:
//
//  - La ruta NO interpreta los extras ni el documento: los pasa al motor, que es
//    quien resuelve el precio del catálogo y valida el registro de viajeros (una
//    segunda verdad sobre el dinero o sobre el parte es justo lo que se quitó).
//  - El importe del cobro lo dice el motor (anticipo acordado o el total, que ya
//    incluye los extras); la ruta no vuelve a cotizar.
//  - La respuesta lleva el enlace de check-in del huésped.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolverPaginaPublica: vi.fn(),
  crearReservaDirecta: vi.fn(),
  estadoDeCobroDelTenant: vi.fn(),
  crearSesionDePago: vi.fn(),
}));

vi.mock('@/lib/hospitality/booking-engine', () => ({
  resolverPaginaPublica: mocks.resolverPaginaPublica,
  crearReservaDirecta: mocks.crearReservaDirecta,
}));
vi.mock('@/lib/hospitality/booking-payments', () => ({
  estadoDeCobroDelTenant: mocks.estadoDeCobroDelTenant,
  crearSesionDePago: mocks.crearSesionDePago,
}));

import { POST } from '@/app/api/public/booking/[slug]/reservar/route';

const config = {
  tenantId: 'tenant_a',
  requierePagoOnline: false,
  anticipoPorcentaje: 0,
  tarifaLimpieza: null,
};

const pagina = {
  ok: true as const,
  config,
  tenant: { id: 'tenant_a', nombre: 'Hotel Centro' },
  moneda: 'MXN',
  propiedades: [{ id: 'prop_a', unidades: [{ id: 'unit_a' }] }],
};

function request(cuerpo: Record<string, unknown>) {
  return new Request('http://test.local/api/public/booking/mi-hotel/reservar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
}

const ctx = { params: Promise.resolve({ slug: 'mi-hotel' }) };

const cuerpoBase = {
  propertyId: 'prop_a',
  unitId: 'unit_a',
  checkIn: '2027-03-01',
  checkOut: '2027-03-04',
  adultos: 2,
  ninos: 0,
  solicitudId: 'solicitud-de-prueba-1234',
  nombre: 'Ana',
  email: 'ana@example.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolverPaginaPublica.mockResolvedValue(pagina);
  mocks.estadoDeCobroDelTenant.mockResolvedValue({ disponible: false });
  mocks.crearReservaDirecta.mockResolvedValue({
    ok: true,
    reservaId: 'res_a',
    referencia: 'WEB-ABC',
    estado: 'confirmed',
    total: 3500,
    moneda: 'MXN',
    noches: 3,
    anticipo: 0,
    totalExtras: 500,
    checkinUrl: 'https://app.test/checkin/tok?lang=es',
    yaExistia: false,
  });
});

describe('POST /reservar — el formulario público pasa al motor sin interpretar', () => {
  it('manda los extras y el documento tal cual y devuelve el enlace de check-in', async () => {
    const res = await POST(
      request({
        ...cuerpoBase,
        extras: [{ extraId: 'extra_desayuno', cantidad: 2 }],
        documento: { tipoDocumento: 'dni', numeroDocumento: '12345678Z' },
      }),
      ctx
    );
    expect(res.status).toBe(201);

    const entrada = mocks.crearReservaDirecta.mock.calls[0][0];
    expect(entrada.extras).toEqual([{ extraId: 'extra_desayuno', cantidad: 2 }]);
    expect(entrada.huesped.documento).toEqual({
      tipoDocumento: 'dni',
      numeroDocumento: '12345678Z',
    });
    expect(entrada.solicitudId).toBe('solicitud-de-prueba-1234');

    const datos = await res.json();
    expect(datos.checkinUrl).toBe('https://app.test/checkin/tok?lang=es');
    expect(datos.totalExtras).toBe(500);
  });

  it('sin extras ni documento no se inventa nada', async () => {
    await POST(request(cuerpoBase), ctx);
    const entrada = mocks.crearReservaDirecta.mock.calls[0][0];
    expect(entrada.extras).toBeUndefined();
    expect(entrada.huesped.documento).toBeNull();
  });

  it('con cobro online abre la sesión por el importe del motor (que ya incluye extras)', async () => {
    mocks.resolverPaginaPublica.mockResolvedValue({
      ...pagina,
      config: { ...config, requierePagoOnline: true },
    });
    mocks.estadoDeCobroDelTenant.mockResolvedValue({ disponible: true });
    mocks.crearSesionDePago.mockResolvedValue({ ok: true, sesion: { url: 'https://pay.test/x' } });

    const res = await POST(request(cuerpoBase), ctx);
    expect(mocks.crearSesionDePago).toHaveBeenCalledWith(
      expect.objectContaining({ importe: 3500, moneda: 'MXN' })
    );
    expect((await res.json()).pagoUrl).toBe('https://pay.test/x');
  });

  it('sin disponibilidad de cobro no se crea la reserva (503 antes de escribir nada)', async () => {
    mocks.resolverPaginaPublica.mockResolvedValue({
      ...pagina,
      config: { ...config, requierePagoOnline: true },
    });
    mocks.estadoDeCobroDelTenant.mockResolvedValue({ disponible: false });

    const res = await POST(request(cuerpoBase), ctx);
    expect(res.status).toBe(503);
    expect(mocks.crearReservaDirecta).not.toHaveBeenCalled();
  });
});
