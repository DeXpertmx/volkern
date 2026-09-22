// @vitest-environment node
//
// Filtro de «llegadas hoy / salidas hoy» en reservas (el flujo diario de
// recepción): la función compartida aplicarMovimientoRecepcion (la usa el
// listado y la exportación CSV por la MISMA whereDeFiltrosReservas), su
// composición con los demás filtros, el ámbito por tenant y la guardia de la
// pantalla. Lo que se vigila: la ventana es el DÍA LOCAL del servidor (la
// misma regla del planning y del CSV) y la cancelada —que carece de
// movimiento— no puede colarse en ninguno de los dos chips.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hospitalityReservation: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  hospitalityGuestRegistryCommunication: { findMany: vi.fn() },
  hospitalityCheckinPregunta: { findMany: vi.fn() },
  hospitalityProperty: { findMany: vi.fn() },
  authenticateRequest: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityGuestRegistryCommunication: mocks.hospitalityGuestRegistryCommunication,
    hospitalityCheckinPregunta: mocks.hospitalityCheckinPregunta,
    hospitalityProperty: mocks.hospitalityProperty,
  },
}));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/permissions', () => ({ logAuditAction: vi.fn() }));
vi.mock('@/lib/hospitality/sync', () => ({ dispatchConnectivityPush: vi.fn() }));
vi.mock('@/lib/hospitality/availability', () => ({ unitOccupiedOnDay: vi.fn() }));
vi.mock('@/lib/hospitality/registro-viajeros-service', () => ({
  partesDeViajerosPorReserva: vi.fn().mockResolvedValue(new Map()),
  parteDeViajerosDeReserva: vi.fn(),
  registraPartePendiente: vi.fn(),
  enviaParteSiCorresponde: vi.fn(),
}));

import { GET } from '@/app/api/hospitality/reservations/route';
import { whereDeFiltrosReservas, aplicarMovimientoRecepcion } from '@/app/api/hospitality/reservations/route';
import { estadosSinMovimiento } from '@/lib/hospitality/estados';

const auth = { valid: true, tenant: { id: 'tenant_a' }, user: { id: 'user_a' } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue(auth);
  mocks.hospitalityReservation.findMany.mockResolvedValue([]);
  mocks.hospitalityReservation.count.mockResolvedValue(0);
  mocks.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([]);
  mocks.hospitalityCheckinPregunta.findMany.mockResolvedValue([]);
});

const get = (qs: string) => GET(new Request(`http://test.local/api/hospitality/reservations?${qs}`));

// ─── La función compartida (listado y CSV usan esta) ─────────────────────────
describe('aplicarMovimientoRecepcion / whereDeFiltrosReservas', () => {
  it('«llegadas» acota checkIn al día local del servidor', () => {
    const where: any = { tenantId: 't1' };
    aplicarMovimientoRecepcion(where, 'llegadas', new Date(2026, 8, 22, 17, 45));

    expect(where.checkIn.gte).toEqual(new Date(2026, 8, 22, 0, 0, 0, 0));
    expect(where.checkIn.lt).toEqual(new Date(2026, 8, 23, 0, 0, 0, 0));
  });

  it('«salidas» acota checkOut a la misma ventana (no toca checkIn)', () => {
    const where: any = { tenantId: 't1' };
    aplicarMovimientoRecepcion(where, 'salidas', new Date(2026, 8, 22, 5, 0));

    expect(where.checkOut.gte).toEqual(new Date(2026, 8, 22, 0, 0, 0, 0));
    expect(where.checkOut.lt).toEqual(new Date(2026, 8, 23, 0, 0, 0, 0));
    expect(where.checkIn).toBeUndefined();
  });

  it('la cancelada no aparece como llegada ni como salida (carece de movimiento)', () => {
    for (const movimiento of ['llegadas', 'salidas'] as const) {
      const where: any = { tenantId: 't1' };
      aplicarMovimientoRecepcion(where, movimiento);
      expect(where.estado).toMatchObject({ notIn: estadosSinMovimiento() });
    }
  });

  it('compone con un filtro de estado sin pisarlo (estado + chip)', () => {
    const where: any = { tenantId: 't1', estado: 'confirmed' };
    aplicarMovimientoRecepcion(where, 'llegadas');
    // El estado del operador se respeta; el notIn solo protege si falta.
    expect(where.estado).toBe('confirmed');

    const whereMulti: any = { tenantId: 't1', estado: { in: ['confirmed', 'checked_in'] } };
    aplicarMovimientoRecepcion(whereMulti, 'llegadas');
    expect(whereMulti.estado).toMatchObject({ in: ['confirmed', 'checked_in'], notIn: estadosSinMovimiento() });
  });

  it('un estado sin movimiento junto al chip se responde vacío en vez de contradecirlo', () => {
    const where: any = { tenantId: 't1', estado: 'cancelled' };
    aplicarMovimientoRecepcion(where, 'llegadas');
    expect(where.estado).toEqual({ in: [] });
  });

  it('a las 23:59 el día de mañana aún no entró en la ventana (fecha pura, no horas desde medianoche)', () => {
    const where: any = { tenantId: 't1' };
    aplicarMovimientoRecepcion(where, 'llegadas', new Date(2026, 8, 22, 23, 59));
    expect(where.checkIn.lt).toEqual(new Date(2026, 8, 23, 0, 0, 0, 0));
  });

  it('whereDeFiltrosReservas resuelve el parámetro y compone con propertyId y q', () => {
    const sp = new URLSearchParams('movimiento=llegadas&propertyId=p1&q=ana');
    const where = whereDeFiltrosReservas(sp, 'tenant_a');
    expect(where.tenantId).toBe('tenant_a');
    expect(where.propertyId).toBe('p1');
    expect(where.checkIn).toBeDefined();
    expect(where.OR).toBeDefined();
  });

  it('sin el parámetro no toca nada (los filtros existentes quedan intactos)', () => {
    const sp = new URLSearchParams('estado=confirmed&from=2026-10-01&to=2026-10-05');
    const where = whereDeFiltrosReservas(sp, 'tenant_a');
    expect(where.estado).toBe('confirmed');
    expect(where.checkOut).toMatchObject({ gte: new Date('2026-10-01') });
    expect(where.checkIn).toMatchObject({ lt: new Date('2026-10-05') });
  });

  it('un valor raro del parámetro se ignora (no rompe el listado)', () => {
    const sp = new URLSearchParams('movimiento=vuelos');
    const where = whereDeFiltrosReservas(sp, 'tenant_a');
    expect(where.checkIn).toBeUndefined();
    expect(where.checkOut).toBeUndefined();
    expect(where.estado).toBeUndefined();
  });
});

// ─── La vía real: listado y exportación CSV ──────────────────────────────────
describe('GET /api/hospitality/reservations — movimiento del día', () => {
  it('el listado consulta con la ventana de llegadas de hoy', async () => {
    await get('movimiento=llegadas');

    const where = mocks.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant_a');
    expect(where.checkIn.gte).toBeInstanceOf(Date);
    expect(where.checkIn.lt.getTime() - where.checkIn.gte.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('el resumen del día cuenta llegadas y salidas del tenant, cada una con su regla de movimiento', async () => {
    mocks.hospitalityReservation.count
      .mockResolvedValueOnce(3) // llegadas
      .mockResolvedValueOnce(2); // salidas

    const data = await (await get('estado=confirmed')).json();

    expect(data.resumenHoy).toEqual({ llegadas: 3, salidas: 2 });
    const [llamadaLlegadas, llamadaSalidas] = mocks.hospitalityReservation.count.mock.calls;
    // Las dos consultas son del tenant, con movimiento (sin canceladas)…
    expect(llamadaLlegadas[0].where.tenantId).toBe('tenant_a');
    expect(llamadaLlegadas[0].where.estado).toMatchObject({ notIn: estadosSinMovimiento() });
    expect(llamadaSalidas[0].where.estado).toMatchObject({ notIn: estadosSinMovimiento() });
    // …y cada campo en su ventana de día local (24 h exactas).
    expect(llamadaLlegadas[0].where.checkIn.lt.getTime() - llamadaLlegadas[0].where.checkIn.gte.getTime()).toBe(86_400_000);
    expect(llamadaSalidas[0].where.checkOut.lt.getTime() - llamadaSalidas[0].where.checkOut.gte.getTime()).toBe(86_400_000);
    // El resumen NO hereda los filtros de la lista (estado=confirmed no viaja).
    expect(llamadaLlegadas[0].where.estado.in).toBeUndefined();
  });

  it('si el recuento falla, el listado sigue en pie sin resumenHoy (auxiliar)', async () => {
    mocks.hospitalityReservation.count.mockRejectedValue(new Error('BD caída'));

    const res = await get('');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reservations).toEqual([]);
    expect(data.resumenHoy).toBeNull();
  });

  it('el CSV de recepción hereda el chip (misma whereDeFiltrosReservas)', async () => {
    const { GET: getExport } = await import('@/app/api/hospitality/reservations/export/route');
    await getExport(new Request('http://test.local/api/hospitality/reservations/export?movimiento=salidas'));

    const where = mocks.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.checkOut).toBeDefined();
    expect(where.estado).toMatchObject({ notIn: estadosSinMovimiento() });
  });

  it('sin sesión: 401', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'sin sesión' });
    const res = await get('movimiento=llegadas');
    expect(res.status).toBe(401);
  });
});

// ─── La pantalla ─────────────────────────────────────────────────────────────
describe('Pantalla de reservas — guardia del día de recepción', () => {
  it('los chips viajan al listado Y a la URL del CSV (la recepción exporta lo que ve)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const fuente = fs.readFileSync(
      path.resolve(__dirname, '../app/dashboard/hospitality/reservas/page.tsx'),
      'utf8'
    );

    // La fila de resumen con recuento (la misma píldora enseña la carga y filtra).
    expect(fuente).toContain('llegada${');
    expect(fuente).toContain('salida${');
    // El recuento viene de la API (resumenHoy), no se calcula en el cliente.
    expect(fuente).toMatch(/setResumenHoy\(/);
    expect(fuente).not.toMatch(/const resumenHoy\s*=/);
    // Los dos chips existen…
    expect(fuente).toContain('Llegadas hoy');
    expect(fuente).toContain('Salidas hoy');
    // …el estado alimenta la URL de la API…
    expect(fuente).toContain("params.set('movimiento', fMovimiento)");
    // …y el CSV usa la MISMA cadena de filtros (no se reconstruye a mano).
    expect(fuente).toMatch(/setFiltrosCsv\(params\.toString\(\)\)/);
    // Los chips son excluyentes entre sí: activar uno desactiva el otro.
    expect(fuente).toContain("fMovimiento === 'llegadas' ? null : 'llegadas'");
    expect(fuente).toContain("fMovimiento === 'salidas' ? null : 'salidas'");
    // «Limpiar» también quita el chip.
    expect(fuente).toContain('setFMovimiento(null)');
  });

  it('las llegadas de hoy sin parte van en rojo y PRIMERO (el trabajo urgente no espera al orden cronológico)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const fuente = fs.readFileSync(
      path.resolve(__dirname, '../app/dashboard/hospitality/reservas/page.tsx'),
      'utf8'
    );

    // El predicado reutiliza las dos reglas existentes — sin segundas
    // definiciones: «hoy» es la del módulo (diaLocalIso) y «sin parte» es el
    // mismo predicado del aviso ámbar.
    expect(fuente).toContain("import { diaLocalIso } from '@/lib/hospitality/reservas-csv';");
    expect(fuente).toMatch(/function llegaHoySinParte\(r: Reservation, hoyIso: string\): boolean \{/);
    expect(fuente).toContain('diaLocalIso(r.checkIn) === hoyIso && faltaParteDeViajeros(r)');
    // La lista se ordena con el predicado (pendientes primero, sort estable).
    expect(fuente).toMatch(/reservasOrdenadas\.map\(\(r\) => \{/);
    expect(fuente).toMatch(/llegaHoySinParte\(b, hoyIso\)\) - Number\(llegaHoySinParte\(a, hoyIso\)\)/);
    // La fila urgente se tiñe entera y la nota pierde el ámbar.
    expect(fuente).toContain("urgente ? ' bg-red-50' : ''");
    expect(fuente).toContain("urgente ? 'text-red-700' : 'text-amber-700'");
    // Y la nota lo nombra: «llega hoy».
    expect(fuente).toContain("' · llega hoy'");
  });
});
