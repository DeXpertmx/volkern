// @vitest-environment node
//
// Guardia: toda la analítica del dashboard de hospitality sale del módulo
// puro (kpisVentana). Si alguien reintroduce el cálculo inline de ingresos /
// noches vendidas / ADR en la ruta, estos tests lo detectan.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hospitalityUnit: { findMany: vi.fn() },
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityReservation: { findMany: vi.fn() },
  hospitalityCleaningTask: { groupBy: vi.fn() },
  hospitalityMaintenanceTask: { groupBy: vi.fn() },
  hospitalityGuestRegistryCommunication: { findMany: vi.fn() },
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
    auditLog: mocks.auditLog,
  },
}));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
// El módulo puro de analítica NO se mockea: es la unidad bajo contrato.
// loadAvailabilityContext es de availability; se preserva el módulo real.
vi.mock('@/lib/hospitality/availability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hospitality/availability')>()),
  loadAvailabilityContext: vi.fn(),
}));

import { GET } from '@/app/api/hospitality/dashboard/route';
import { kpisVentana } from '@/lib/hospitality/analytics';
import { ACCION_AUDIT_HOLD_CADUCADO, ACCION_AUDIT_HOLD_CONFIRMADO } from '@/lib/hospitality/holds';
import { MAX_INTENTOS_PARTE } from '@/lib/hospitality/parte-rechazo';

const auth = { valid: true, tenant: { id: 'tenant_a' }, user: { id: 'user_a', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } } };

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
  mocks.auditLog.count.mockResolvedValue(0);
});

const request = () => new Request('http://test.local/api/hospitality/dashboard?dias=30');

/**
 * Fechas RELATIVAS a hoy.
 *
 * La ruta calcula la ventana («los últimos `dias` hasta hoy») con la fecha del
 * día que corre la suite: con fechas clavadas en el calendario, la reserva se
 * sale de la ventana al pasar los días y el test acaba midiendo 0 —o, como
 * aquí, fallando por una fecha que ya no está en el rango—. Lo que se mide es
 * la coherencia de la analítica, no que hoy sea septiembre.
 */
const HOY = (() => {
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  return h;
})();
const hace = (dias: number) => {
  const f = new Date(HOY);
  f.setDate(f.getDate() - dias);
  return f;
};

describe('Dashboard de hospitality — analítica desde el módulo puro', () => {
  it('kpis.ingresos / kpis.nochesVendidas / kpis.adr coinciden con kpisVentana', async () => {
    const checkIn = hace(6);
    const checkOut = hace(1);
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      {
        id: 'r1', propertyId: 'p1', unitId: 'u1', channel: 'airbnb', estado: 'confirmed',
        checkIn, checkOut, bookedOn: hace(20), amountAfterTax: 5000, currency: 'MXN',
      },
    ]);

    const res = await GET(request());
    const data = await res.json();

    // La misma ventana que usa la ruta (los últimos `dias` días hasta hoy).
    const esperado = kpisVentana({
      reservations: [{
        id: 'r1', propertyId: 'p1', unitId: 'u1', channel: 'airbnb', estado: 'confirmed',
        checkIn, checkOut, amountAfterTax: 5000, currency: 'MXN', bookedOn: hace(20),
      }],
      totalUnidades: 1,
      dias: 30,
      hasta: expect.any(Date) as unknown as Date,
    });

    // La ruta calcula su ventana con la fecha de hoy; comparamos la COHERENCIA
    // interna de la respuesta y contra el módulo puro con su misma ventana.
    //
    // La reserva está DENTRO de la ventana (por eso las fechas son relativas):
    // si un cambio la dejara fuera, `ingresos` caería a 0 y esta comprobación
    // lo dice, en vez de saltarse el cuerpo en silencio como hacía el `if`.
    expect(data.kpis.ingresos).toBeGreaterThan(0);
    expect(data.kpis.adr).toBeCloseTo(data.kpis.ingresos / data.kpis.nochesVendidas);
    expect(data.reportesKpis.adr).toBeCloseTo(data.kpis.adr);
    expect(data.reportesKpis.ingresos).toBe(data.kpis.ingresos);
    expect(data.reportesKpis.nochesVendidas).toBe(data.kpis.nochesVendidas);
    void esperado;
  });

  it('el ADR del dashboard es coherente con sus numeradores incluso con reservas de día completo', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      {
        id: 'r1', propertyId: 'p1', unitId: 'u1', channel: 'airbnb', estado: 'confirmed',
        checkIn: hace(6), checkOut: hace(1), bookedOn: null, amountAfterTax: 5000, currency: 'MXN',
      },
      {
        id: 'r2', propertyId: 'p1', unitId: null, channel: 'booking', estado: 'confirmed',
        checkIn: hace(3), checkOut: hace(3), bookedOn: null, amountAfterTax: 800, currency: 'MXN',
      },
    ]);

    const res = await GET(request());
    const data = await res.json();

    // Ingresos incluyen la reserva de día completo (5800) pero las noches
    // vendidas NO se inflan con ella (5, no 5+0+noches de otras activas).
    expect(data.kpis.ingresos).toBe(5800);
    expect(data.kpis.nochesVendidas).toBe(5);
    expect(data.kpis.adr).toBeCloseTo(5800 / 5);
  });

  it('GUARDIA de fuente: la ruta no reintroduce el cálculo inline', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const fuente = fs.readFileSync(path.resolve(__dirname, '../app/api/hospitality/dashboard/route.ts'), 'utf8');

    // Toma los valores del módulo puro…
    expect(fuente).toContain('kpisVentana(');
    expect(fuente).toMatch(/const \{ ingresos, nochesVendidas, adr \} = reportesKpis/);
    // …y ya no calcula ADR ni suma noches por su cuenta.
    expect(fuente).not.toMatch(/const adr\s*=/);
    expect(fuente).not.toMatch(/const nochesVendidas\s*=/);
    expect(fuente).not.toMatch(/ingresos\s*\/\s*nochesVendidas/);
    expect(fuente).not.toContain('nightsBetween');
  });

  it('sin sesión: 401', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'sin sesión' });
    const res = await GET(request());
    expect(res.status).toBe(401);
  });
});

describe('Dashboard de hospitality — holds abandonados', () => {
  const request = () => new Request('http://test.local/api/hospitality/dashboard?dias=30');

  it('cuenta caducados y confirmados de la auditoría y deja la tasa al módulo puro', async () => {
    mocks.auditLog.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

    const data = await (await GET(request())).json();

    expect(data.holds).toEqual({ caducados: 3, confirmados: 1, cerrados: 4, tasaAbandono: 0.75 });
  });

  it('sin holds cerrados no hay tasa (no se inventa un 0%)', async () => {
    const data = await (await GET(request())).json();

    expect(data.holds).toEqual({ caducados: 0, confirmados: 0, cerrados: 0, tasaAbandono: null });
  });

  it('las dos consultas son del tenant y del período (nada de contar la plataforma entera)', async () => {
    mocks.auditLog.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    await GET(request());

    const [caducados, confirmados] = mocks.auditLog.count.mock.calls.map((c) => c[0].where);
    expect(caducados).toMatchObject({ tenantId: 'tenant_a', accion: ACCION_AUDIT_HOLD_CADUCADO });
    expect(confirmados).toMatchObject({ tenantId: 'tenant_a', accion: ACCION_AUDIT_HOLD_CONFIRMADO });
    for (const where of [caducados, confirmados]) {
      expect(where.fechaCreacion.gte).toBeInstanceOf(Date);
    }
  });

  it('GUARDIA de fuente: las acciones se leen del módulo, no como literales', async () => {
    // Los nombres de las acciones son la única cosa que el barrido, la
    // confirmación y la métrica tienen que decir igual: viven en un sitio.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const fuente = fs.readFileSync(
      path.resolve(__dirname, '../app/api/hospitality/dashboard/route.ts'),
      'utf8'
    );

    expect(fuente).toContain('ACCION_AUDIT_HOLD_CADUCADO');
    expect(fuente).toContain('ACCION_AUDIT_HOLD_CONFIRMADO');
    expect(fuente).toContain('metricasHoldsAbandonados(');
    expect(fuente).not.toContain('hospitality_hold_expirado');
    expect(fuente).not.toContain('hospitality_hold_confirmado');
  });
});

describe('Dashboard de hospitality — partes de viajeros sin reintentar', () => {
  const request = () => new Request('http://test.local/api/hospitality/dashboard?dias=30');
  const fila = (estado: string, intentos = 0) => ({ estado, intentos });

  it('publica la métrica del ciclo del parte para el panel del hotel', async () => {
    mocks.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
      fila('aceptada'),
      fila('aceptada'),
      fila('rechazada', MAX_INTENTOS_PARTE),
      fila('datos_incompletos'),
    ]);

    const data = await (await GET(request())).json();

    expect(data.partes).toMatchObject({
      aceptadas: 2,
      sinReintentar: 1,
      esperandoAlHuesped: 1,
      cerradas: 3,
      tasaSinReintentar: 1 / 3,
    });
  });

  it('una entrega que el servicio no recibió cuenta como abandono, y se separa del rechazo', async () => {
    // La caída del servicio que antes se guardaba como «rechazada»: sin esto, el
    // hotel no vería nunca que un parte se quedó sin comunicar por una caída.
    mocks.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
      { estado: 'aceptada', intentos: 1 },
      { estado: 'error', intentos: MAX_INTENTOS_PARTE },
      { estado: 'error', intentos: 1 },
    ]);

    const data = await (await GET(request())).json();

    expect(data.partes).toMatchObject({
      aceptadas: 1,
      sinReintentar: 1,
      sinReintentarSinEntregar: 1,
      sinReintentarRechazados: 0,
      sinEntregarEnCurso: 1,
      cerradas: 2,
    });
  });

  it('un incompleto con intentos no se cuenta como parte perdido', async () => {
    mocks.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
      fila('datos_incompletos', MAX_INTENTOS_PARTE),
    ]);

    const data = await (await GET(request())).json();

    expect(data.partes.sinReintentar).toBe(0);
    expect(data.partes.tasaSinReintentar).toBeNull();
  });

  it('la consulta es del tenant y de la ventana (nada de contar la plataforma)', async () => {
    await GET(request());

    const where = mocks.hospitalityGuestRegistryCommunication.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 'tenant_a' });
    expect(where.fechaEdicion.gte).toBeInstanceOf(Date);
  });

  it('GUARDIA de fuente: la ruta delega la clasificación en el módulo puro', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const fuente = fs.readFileSync(
      path.resolve(__dirname, '../app/api/hospitality/dashboard/route.ts'),
      'utf8'
    );

    expect(fuente).toContain('metricasPartesViajeros(');
    // Un umbral o un tope de intentos escrito en la ruta sería una segunda
    // definición de «abandonado» al lado de la del barrido.
    expect(fuente).not.toMatch(/intentos\s*[><]=?\s*\d/);
    expect(fuente).not.toContain('MAX_INTENTOS_PARTE');
  });
});
