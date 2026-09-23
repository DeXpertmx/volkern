// @vitest-environment node
//
// El tablón de «Movimiento de mañana» del dashboard de hospitality: las
// llegadas y salidas del día SIGUIENTE, con huésped/unidad/propiedad, para
// preparar asignaciones y limpiezas. Lo que se vigila: la ventana de un día
// local vive en el módulo de calendario (UNA definición de «día» para el
// planning, el CSV, el filtro de hoy y este tablón), la sección es auxiliar
// (su fallo no tumba el dashboard) y la página no calcula nada.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  hospitalityUnit: { findMany: vi.fn() },
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityReservation: { findMany: vi.fn() },
  hospitalityCleaningTask: { groupBy: vi.fn() },
  hospitalityMaintenanceTask: { groupBy: vi.fn() },
  hospitalityGuestRegistryCommunication: { findMany: vi.fn() },
  hospitalityCheckinPregunta: { findMany: vi.fn() },
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
import { ventanaDeDiaLocal } from '@/lib/hospitality/calendar';
import { estadosSinMovimiento } from '@/lib/hospitality/estados';

const auth = { valid: true, tenant: { id: 'tenant_a' }, user: { id: 'user_a', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue(auth);
  mocks.hospitalityUnit.findMany.mockResolvedValue([]);
  mocks.hospitalityProperty.findMany.mockResolvedValue([]);
  mocks.hospitalityCleaningTask.groupBy.mockResolvedValue([]);
  mocks.hospitalityMaintenanceTask.groupBy.mockResolvedValue([]);
  mocks.hospitalityReservation.findMany.mockResolvedValue([]);
  mocks.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([]);
  mocks.hospitalityCheckinPregunta.findMany.mockResolvedValue([]);
  mocks.auditLog.count.mockResolvedValue(0);
});

const request = () => new Request('http://test.local/api/hospitality/dashboard');

// ─── La unidad de «día» del módulo ────────────────────────────────────────────
describe('ventanaDeDiaLocal (módulo de calendario)', () => {
  it('cubre el día local completo: de medianoche a medianoche siguiente', () => {
    const { inicio, fin } = ventanaDeDiaLocal(new Date(2026, 8, 22, 17, 45));
    expect(inicio).toEqual(new Date(2026, 8, 22, 0, 0, 0, 0));
    expect(fin).toEqual(new Date(2026, 8, 23, 0, 0, 0, 0));
    expect(fin.getTime() - inicio.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('a las 23:59 el día todavía no terminó (la ventana no se trunca por la hora)', () => {
    const { inicio, fin } = ventanaDeDiaLocal(new Date(2026, 8, 22, 23, 59));
    expect(inicio).toEqual(new Date(2026, 8, 22, 0, 0, 0, 0));
    expect(fin).toEqual(new Date(2026, 8, 23, 0, 0, 0, 0));
  });
});

// ─── El tablón en la API ──────────────────────────────────────────────────────
describe('Dashboard — movimiento de mañana', () => {
  it('trae llegadas y salidas de mañana con huésped, unidad y propiedad', async () => {
    // La primera findMany de reservas del GET es la del período; las dos
    // siguientes (en orden de Promise.all) son las del tablón.
    mocks.hospitalityReservation.findMany
      .mockResolvedValueOnce([]) // reservas del período
      .mockResolvedValueOnce([
        {
          id: 'r1',
          guestData: { firstName: 'Ana', lastName: 'Ruiz' },
          externalBookingId: 'BK-1',
          unit: { nombre: 'Suite Volcán' },
          property: { nombre: 'Hotel Volcán' },
        },
      ]) // llegadas de mañana
      .mockResolvedValueOnce([
        {
          id: 'r2',
          guestData: { firstName: 'Beto' },
          externalBookingId: 'BK-2',
          unit: { nombre: 'Loft Bosque' },
          property: { nombre: 'Hotel Volcán' },
        },
      ]); // salidas de mañana

    const data = await (await GET(request())).json();

    expect(data.movimientoManana).toEqual({
      llegadas: [{ id: 'r1', huesped: 'Ana Ruiz', unidad: 'Suite Volcán', propiedad: 'Hotel Volcán' }],
      salidas: [{ id: 'r2', huesped: 'Beto', unidad: 'Loft Bosque', propiedad: 'Hotel Volcán' }],
    });
  });

  it('las dos consultas apuntan al MISMO día local de mañana y excluyen lo sin movimiento', async () => {
    await GET(request());

    const llamadas = mocks.hospitalityReservation.findMany.mock.calls;
    // El `gte` distingue la ventana de un día del tablón de la consulta del
    // período (que filtra checkIn solo con `lt`).
    const llegada = llamadas.find((c) => c[0].where.checkIn?.gte)?.[0];
    const salida = llamadas.find((c) => c[0].where.checkOut?.gte)?.[0];
    expect(llegada).toBeDefined();
    expect(salida).toBeDefined();

    const { inicio, fin } = ventanaDeDiaLocal(new Date(Date.now() + 24 * 60 * 60 * 1000));
    // Compara sobre la fecha (los Date nuevos del mock pueden diferir en ms).
    expect(new Date(llegada.where.checkIn.gte).getDate()).toBe(inicio.getDate());
    expect(new Date(llegada.where.checkIn.lt).getDate()).toBe(fin.getDate());
    expect(new Date(salida.where.checkOut.gte).getDate()).toBe(inicio.getDate());
    expect(new Date(salida.where.checkOut.lt).getDate()).toBe(fin.getDate());

    for (const w of [llegada.where, salida.where]) {
      expect(w.tenantId).toBe('tenant_a');
      expect(w.estado).toMatchObject({ notIn: estadosSinMovimiento() });
    }
  });

  it('un huésped sin nombre en guestData no sale como fila vacía', async () => {
    mocks.hospitalityReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'r1', guestData: null, externalBookingId: 'BK-9', unit: { nombre: 'U' }, property: { nombre: 'P' } },
      ])
      .mockResolvedValueOnce([]);

    const data = await (await GET(request())).json();
    expect(data.movimientoManana.llegadas[0].huesped).toBe('Huésped');
  });

  it('si la consulta del tablón falla, el dashboard sigue en pie sin él (auxiliar)', async () => {
    mocks.hospitalityReservation.findMany
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('BD caída'));

    const res = await GET(request());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.movimientoManana).toBeNull();
    // El resto del dashboard no se toca.
    expect(data.reportesKpis).toBeDefined();
    expect(data.holds).toBeDefined();
  });

  it('la consulta del tablón respeta el tope de 50 filas por columna', async () => {
    await GET(request());
    const llamadas = mocks.hospitalityReservation.findMany.mock.calls;
    for (const c of llamadas) {
      if (c[0].where.checkIn?.gte || c[0].where.checkOut?.gte) {
        expect(c[0].take).toBe(50);
      }
    }
  });

  it('sin sesión: 401', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'sin sesión' });
    const res = await GET(request());
    expect(res.status).toBe(401);
  });
});

// ─── La página ────────────────────────────────────────────────────────────────
describe('Página del dashboard — guardia del tablón', () => {
  it('pinta el tablón con las dos columnas y el estado vacío, sin calcular nada', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const fuente = fs.readFileSync(
      path.resolve(__dirname, '../app/dashboard/hospitality/dashboard/page.tsx'),
      'utf8'
    );

    expect(fuente).toContain('Movimiento de mañana');
    expect(fuente).toContain('Llegadas (');
    expect(fuente).toContain('Salidas (');
    // El estado vacío es honesto (un tablón vacío también es información).
    expect(fuente).toContain('Sin movimientos para mañana');
    // Los datos vienen de la API; la página no reconstruye el movimiento.
    expect(fuente).toContain('movimientoManana');
    expect(fuente).not.toMatch(/const movimientoManana\s*=/);
    // El propósito, escrito donde el equipo lo lee.
    expect(fuente).toContain('asignar unidades y planificar limpiezas');
  });
});
