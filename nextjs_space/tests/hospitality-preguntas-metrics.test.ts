// @vitest-environment node
//
// Tasa de respuesta de las preguntas obligatorias del check-in (Reportes):
// módulo puro (lib/hospitality/preguntas-metrics.ts), su vía en la API del
// dashboard y la guardia de la página. Lo que se vigila: UNA definición de
// «pendiente» (la del recordatorio), la degradación elegante de la sección y
// que la página no interprete (lectura y aviso vienen del módulo).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hospitalityUnit: { findMany: vi.fn() },
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityReservation: { findMany: vi.fn() },
  hospitalityCleaningTask: { groupBy: vi.fn() },
  hospitalityMaintenanceTask: { groupBy: vi.fn() },
  hospitalityGuestRegistryCommunication: { findMany: vi.fn() },
  hospitalityCheckinPregunta: { findMany: vi.fn() },
  hospitalityReview: { findMany: vi.fn() },
  auditLog: { count: vi.fn() },
  authenticateRequest: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityUnit: mocks.hospitalityUnit,
    hospitalityProperty: mocks.hospitalityProperty,
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityCleaningTask: mocks.hospitalityCleaningTask,
    hospitalityMaintenanceTask: mocks.hospitalityMaintenanceTask,
    hospitalityGuestRegistryCommunication: mocks.hospitalityGuestRegistryCommunication,
    hospitalityCheckinPregunta: mocks.hospitalityCheckinPregunta,
    auditLog: mocks.auditLog,
  },
}));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/hospitality/availability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hospitality/availability')>()),
  loadAvailabilityContext: vi.fn(),
}));

import { GET } from '@/app/api/hospitality/dashboard/route';
import {
  alertaRespuestaPreguntas,
  metricasRespuestaPreguntas,
  RESPUESTA_PREGUNTAS_MINIMO_PARA_ALERTA,
  RESPUESTA_PREGUNTAS_UMBRAL_ALERTA,
} from '@/lib/hospitality/preguntas-metrics';

const auth = { valid: true, tenant: { id: 'tenant_a' }, user: { id: 'user_a' } };
const d = (y: number, m: number, day: number) => new Date(y, m, day);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue(auth);
  mocks.hospitalityUnit.findMany.mockResolvedValue([{ id: 'u1', estado: 'available', propertyId: 'p1' }]);
  mocks.hospitalityProperty.findMany.mockResolvedValue([{ id: 'p1', nombre: 'Villa' }]);
  mocks.hospitalityCleaningTask.groupBy.mockResolvedValue([]);
  mocks.hospitalityMaintenanceTask.groupBy.mockResolvedValue([]);
  mocks.hospitalityReservation.findMany.mockResolvedValue([]);
  mocks.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([]);
  mocks.hospitalityCheckinPregunta.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
  mocks.hospitalityReview.findMany.mockResolvedValue([]);
  mocks.auditLog.count.mockResolvedValue(0);
});

const request = () => new Request('http://test.local/api/hospitality/dashboard?dias=30');

// ─── El módulo puro ───────────────────────────────────────────────────────────
describe('metricasRespuestaPreguntas (módulo puro)', () => {
  it('cuenta pares (reserva, pregunta) respondidos y pendientes con la regla del recordatorio', () => {
    const m = metricasRespuestaPreguntas({
      reservas: [
        { guestData: { email: 'a@x.test' }, respuestasCheckin: { p1: 'Night' } }, // 1/2
        { guestData: { email: 'b@x.test' }, respuestasCheckin: { p1: 'Night', p2: '21:00' } }, // 2/2
        { guestData: { telefono: '+34 666' } }, // 0/2
      ],
      preguntas: [{ id: 'p1' }, { id: 'p2' }],
    });
    expect(m).toMatchObject({ respuestas: 3, pendientes: 3, sinContacto: 0, tasaRespuesta: 0.5 });
  });

  it('usa EXACTAMENTE la regla del recordatorio: un valor no vacío (aunque sea «  ») ya cuenta como respondido', () => {
    // La tesis de la métrica: la misma función que decide qué nombrar el email
    // decide qué contar aquí. Si la regla cambia, cambia en los dos sitios.
    const m = metricasRespuestaPreguntas({
      reservas: [{ guestData: { email: 'a@x.test' }, respuestasCheckin: { p1: '  ' } }],
      preguntas: [{ id: 'p1' }],
    });
    expect(m).toMatchObject({ respuestas: 1, pendientes: 0, tasaRespuesta: 1 });
  });

  it('reservas sin respuestasCheckin (OTA viejas) son todo pendiente, no error', () => {
    const m = metricasRespuestaPreguntas({
      reservas: [{ guestData: { email: 'a@x.test' } }, { respuestasCheckin: null }],
      preguntas: [{ id: 'p1' }],
    });
    expect(m).toMatchObject({ respuestas: 0, pendientes: 2, tasaRespuesta: 0 });
  });

  it('cuenta como sin contacto la reserva con pendientes que no tiene email ni teléfono', () => {
    const m = metricasRespuestaPreguntas({
      reservas: [
        { guestData: {}, respuestasCheckin: {} }, // pendiente y sin contacto
        { guestData: { telefono: '  ' }, respuestasCheckin: {} }, // teléfono en blanco: tampoco sirve
        { guestData: { email: 'c@x.test' }, respuestasCheckin: { p1: 'ok' } }, // respondida
      ],
      preguntas: [{ id: 'p1' }],
    });
    expect(m.sinContacto).toBe(2);
  });

  it('sin preguntas obligatorias no hay tasa (no se inventa un 0% ni un 100%)', () => {
    const m = metricasRespuestaPreguntas({ reservas: [{ guestData: { email: 'a@x.test' } }], preguntas: [] });
    expect(m).toMatchObject({ respuestas: 0, pendientes: 0, tasaRespuesta: null });
    expect(m.lectura).toContain('Sin preguntas obligatorias');
  });

  it('la lectura nombra la plantilla cuando falta por responder, y el 100% cuando no falta', () => {
    const baja = metricasRespuestaPreguntas({
      reservas: [{ guestData: { email: 'a@x.test' }, respuestasCheckin: {} }],
      preguntas: [{ id: 'p1' }],
    });
    expect(baja.lectura).toContain('{{preguntas_pendientes}}');

    const perfecta = metricasRespuestaPreguntas({
      reservas: [{ guestData: { email: 'a@x.test' }, respuestasCheckin: { p1: 'ok' } }],
      preguntas: [{ id: 'p1' }],
    });
    expect(perfecta.lectura).toContain('haciendo su trabajo');
  });

  it('el aviso solo suena con volumen (no es ruido) y por DEBAJO del umbral', () => {
    const pendientes = [{ guestData: { email: 'a@x.test' }, respuestasCheckin: {} }];
    const enUmbral = metricasRespuestaPreguntas({
      reservas: [
        { guestData: { email: 'b@x.test' }, respuestasCheckin: { p1: 'ok' } },
        { guestData: { email: 'c@x.test' }, respuestasCheckin: {} },
      ],
      preguntas: [{ id: 'p1' }],
    });
    // Tasa 50% = umbral: sin aviso (el umbral es «por debajo»).
    expect(enUmbral.tasaRespuesta).toBe(RESPUESTA_PREGUNTAS_UMBRAL_ALERTA);
    expect(alertaRespuestaPreguntas(enUmbral)).toBeNull();

    // Debajo del umbral pero con menos pendientes que el mínimo: sin aviso.
    const pocos = metricasRespuestaPreguntas({
      reservas: [{ guestData: { email: 'a@x.test' }, respuestasCheckin: {} }],
      preguntas: [{ id: 'p1' }, { id: 'p2' }],
    });
    expect(pocos.pendientes).toBeLessThan(RESPUESTA_PREGUNTAS_MINIMO_PARA_ALERTA);
    expect(alertaRespuestaPreguntas(pocos)).toBeNull();

    // Debajo del umbral con volumen: aviso, y nombra las reservas sin contacto.
    const reservas = [...pendientes];
    while (reservas.length < RESPUESTA_PREGUNTAS_MINIMO_PARA_ALERTA) {
      reservas.push({ guestData: { email: `x${reservas.length}@x.test` }, respuestasCheckin: {} });
    }
    const mal = metricasRespuestaPreguntas({ reservas, preguntas: [{ id: 'p1' }] });
    const aviso = alertaRespuestaPreguntas(mal);
    expect(aviso).toBeTruthy();
    expect(aviso).toContain('{{preguntas_pendientes}}');

    const conSinContacto = metricasRespuestaPreguntas({
      reservas: [
        { guestData: {}, respuestasCheckin: {} },
        { guestData: { email: 'b@x.test' }, respuestasCheckin: {} },
        { guestData: { email: 'c@x.test' }, respuestasCheckin: {} },
        { guestData: { email: 'd@x.test' }, respuestasCheckin: {} },
      ],
      preguntas: [{ id: 'p1' }],
    });
    expect(alertaRespuestaPreguntas(conSinContacto)).toContain('no tienen email ni teléfono');
  });
});

// ─── La vía en la API del dashboard ──────────────────────────────────────────
describe('Dashboard — tasa de respuesta de preguntas obligatorias', () => {
  const reserva = (respuestasCheckin: unknown, guestData: unknown = { email: 'a@x.test' }) => ({
    id: `r${Math.random()}`, propertyId: 'p1', unitId: 'u1', channel: 'Directa', estado: 'confirmed',
    checkIn: d(2026, 8, 1), checkOut: d(2026, 8, 3), checkOutReal: null, bookedOn: d(2026, 7, 20),
    amountAfterTax: 2000, currency: 'MXN', guestData, respuestasCheckin,
  });

  it('publica la métrica calculada sobre las reservas del período', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reserva({ p1: 'Night' }),
      reserva({}),
    ]);

    const data = await (await GET(request())).json();

    expect(data.preguntas).toMatchObject({ respuestas: 1, pendientes: 3, tasaRespuesta: 0.25 });
    expect(typeof data.preguntas.lectura).toBe('string');
  });

  it('solo entran las preguntas ACTIVAS y REQUERIDAS del tenant', async () => {
    await GET(request());

    const where = mocks.hospitalityCheckinPregunta.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 'tenant_a', activa: true, requerida: true });
  });

  it('si la consulta de preguntas falla, el dashboard sigue en pie con la sección vacía', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([reserva({ p1: 'Night' })]);
    mocks.hospitalityCheckinPregunta.findMany.mockRejectedValue(new Error('BD caída'));

    const res = await GET(request());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.preguntas.respuestas).toBe(0);
    expect(data.preguntas.tasaRespuesta).toBeNull();
    // El resto del dashboard no se toca.
    expect(data.reportesKpis).toBeDefined();
    expect(data.holds).toBeDefined();
  });

  it('el aviso viaja calculado por la ruta con el mismo módulo (la página no interpreta)', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reserva({}), reserva({}), reserva({}), reserva({ p1: 'ok' }),
    ]);

    const data = await (await GET(request())).json();

    // 1/4 = 25% < umbral 50%, con 3 pendientes ≥ mínimo: la ruta ya lo lleva.
    expect(data.preguntas.aviso).toBeTruthy();
    expect(data.preguntas.aviso).toBe(alertaRespuestaPreguntas(data.preguntas));
  });

  it('GUARDIA de fuente: la definición de «pendiente» es la del recordatorio, no una segunda', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const fuenteRuta = fs.readFileSync(
      path.resolve(__dirname, '../app/api/hospitality/dashboard/route.ts'),
      'utf8'
    );
    const fuenteModulo = fs.readFileSync(
      path.resolve(__dirname, '../lib/hospitality/preguntas-metrics.ts'),
      'utf8'
    );

    // La ruta delega en el módulo…
    expect(fuenteRuta).toContain('metricasRespuestaPreguntas(');
    // …y el módulo usa el MISMO helper que rellena {{preguntas_pendientes}}.
    expect(fuenteModulo).toContain("from './checkin-preguntas'");
    expect(fuenteModulo).toContain('requeridasPendientes(');
    // Sin re-implementaciones de la regla en la ruta.
    expect(fuenteRuta).not.toContain('requeridasPendientes');
  });
});

// ─── La página de Reportes ────────────────────────────────────────────────────
describe('Reportes — guardia de la sección de preguntas', () => {
  it('la página pinta la métrica y el aviso del módulo, sin calcular nada', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const fuente = fs.readFileSync(
      path.resolve(__dirname, '../app/dashboard/hospitality/reportes/page.tsx'),
      'utf8'
    );

    expect(fuente).toContain('Respuesta de preguntas obligatorias');
    expect(fuente).toContain('preguntas.lectura');
    expect(fuente).toContain('alertaRespuestaPreguntas');
    expect(fuente).toContain("from '@/lib/hospitality/preguntas-metrics'");
    // La página no decide cuándo la tasa es baja.
    expect(fuente).not.toMatch(/tasaRespuesta\s*[<>]\s*0?\.?\d/);
    // El CSV de operación lleva el desglose.
    expect(fuente).toContain('preguntas_tasa_pct');
  });
});
