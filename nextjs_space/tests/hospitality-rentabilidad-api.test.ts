import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * GET /api/hospitality/rentabilidad — MI CARTERA del propietario.
 *
 * El contrato de la API del informe de rentabilidad operativa:
 * - Sesión obligatoria y permiso `hospitality_finanzas.ver` (exportar exige
 *   además `hospitality_finanzas.exportar`).
 * - Aislamiento multi-tenant en la lectura de reservas Y en la de gastos ERP.
 * - Lectura pura: un informe no escribe nada.
 * - La respuesta lleva los tres niveles (bruto → neto → rentabilidad operativa
 *   real), el desglose por categorías y la nota terminológica del informe.
 */

const mocks = vi.hoisted(() => ({
  hospitalityReservation: { findMany: vi.fn() },
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityUnit: { findMany: vi.fn() },
  expense: { findMany: vi.fn() },
  authenticateRequest: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityProperty: mocks.hospitalityProperty,
    hospitalityUnit: mocks.hospitalityUnit,
    expense: mocks.expense,
  },
}));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));

import { GET as rentabilidadGET } from '@/app/api/hospitality/rentabilidad/route';

const authAdmin = {
  valid: true,
  tenant: { id: 'tenant_a', moneda: 'EUR' },
  user: { id: 'user_a', role: { id: 'role_admin', nombre: 'Admin', permisos: { all: true } } },
};

const authSinPermiso = {
  valid: true,
  tenant: { id: 'tenant_a', moneda: 'EUR' },
  user: { id: 'user_a', role: { id: 'role_x', nombre: 'Limitado', permisos: {} } },
};

const request = (url = 'http://test.local/api/hospitality/rentabilidad') => new Request(url);

/** Fila del select del cargador compartido (`money-query.cargarDatosFinancieros`). */
const reservaFila = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  propertyId: 'p1',
  unitId: 'u1',
  channel: 'Airbnb',
  estado: 'confirmed',
  checkIn: new Date('2026-10-10T15:00:00'),
  checkOut: new Date('2026-10-15T11:00:00'),
  bookedOn: null,
  amountAfterTax: 660,
  currency: 'EUR',
  commission: 99,
  guestData: { firstName: 'María', lastName: 'García' },
  unit: { nombre: 'APT 1' },
  property: { nombre: 'Apartamento Centro' },
  contact: null,
  items: [],
  payments: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue(authAdmin);
  mocks.hospitalityReservation.findMany.mockResolvedValue([reservaFila()]);
  mocks.hospitalityProperty.findMany.mockResolvedValue([{ id: 'p1', nombre: 'Apartamento Centro' }]);
  mocks.hospitalityUnit.findMany.mockResolvedValue([{ id: 'u1', propertyId: 'p1', estado: 'available' }]);
  mocks.expense.findMany.mockResolvedValue([]);
});

describe('GET /api/hospitality/rentabilidad', () => {
  it('exige sesión válida', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'No autorizado' });
    const res = await rentabilidadGET(request() as any);
    expect(res.status).toBe(401);
  });

  it('exige el permiso de ver finanzas (403 con el permiso exacto)', async () => {
    mocks.authenticateRequest.mockResolvedValue(authSinPermiso);
    const res = await rentabilidadGET(request() as any);
    expect(res.status).toBe(403);
    expect((await res.json()).permisoRequerido).toBe('hospitality_finanzas.ver');
  });

  it('aísla por tenant en reservas Y en gastos del ERP', async () => {
    await rentabilidadGET(request() as any);

    const whereReservas = mocks.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(whereReservas.tenantId).toBe('tenant_a');

    const whereGastos = mocks.expense.findMany.mock.calls[0][0].where;
    expect(whereGastos.tenantId).toBe('tenant_a');
    // Los gastos solo entran por la reserva: enlace ERP de FASE 3.B.
    expect(whereGastos.hospitalityReservationId).toEqual({ in: ['r1'] });
  });

  it('no escribe nada al leer: es un informe', async () => {
    await rentabilidadGET(request() as any);
    expect(mocks.expense.create).toBeUndefined();
    expect(mocks.hospitalityReservation.create).toBeUndefined();
  });

  it('devuelve los tres niveles con la nota terminológica del informe', async () => {
    mocks.expense.findMany.mockResolvedValue([
      { hospitalityReservationId: 'r1', description: 'Limpieza externa', amount: 45, category: 'limpieza' },
      { hospitalityReservationId: 'r1', description: 'Avería termostato', amount: 80, category: 'mantenimiento' },
    ]);

    const res = await rentabilidadGET(request() as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.moneda).toBe('EUR');
    expect(data.monedaInforme).toBe('EUR');

    const fila = data.propiedades[0];
    expect(fila.nombre).toBe('Apartamento Centro');
    // Nivel 1: bruto desde el importe externo de la OTA (sin líneas).
    expect(fila.ingresos).toBe(660);
    // Nivel 2: neto (660 - 99 de comisión OTA).
    expect(fila.ingresosNetos).toBe(561);
    // Nivel 3: neto - costes operativos del ERP.
    expect(fila.costesOperativos).toBe(125);
    expect(fila.rentabilidadOperativaReal).toBe(436);
    expect(fila.gastos).toBe(224);
    expect(fila.margenPct).toBe(66.06);

    // El desglose de la propiedad arranca por comisiones de canales.
    expect(fila.categorias[0].categoria).toBe('comisiones');

    expect(data.total.rentabilidadOperativaReal).toBe(436);
    expect(data.desgloseCostes.some((c: any) => c.categoria === 'comisiones' && c.importe === 99)).toBe(true);
    expect(data.desgloseCostes.some((c: any) => c.categoria === 'limpieza' && c.importe === 45)).toBe(true);

    // La nomenclatura viaja con el informe: la UI no la improvisa.
    expect(data.notaTerminologica).toContain('Rentabilidad operativa real');
  });

  it('sin gastos del ERP el informe sigue cuadrando: nivel 3 = neto', async () => {
    const res = await rentabilidadGET(request() as any);
    const data = await res.json();
    const fila = data.propiedades[0];
    expect(fila.costesOperativos).toBe(0);
    expect(fila.rentabilidadOperativaReal).toBe(fila.ingresosNetos);
  });

  it('exporta CSV con la capacidad de exportar y las columnas de los tres niveles', async () => {
    const res = await rentabilidadGET(request('http://test.local/api/hospitality/rentabilidad?formato=csv') as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const cuerpo = await res.text();
    expect(cuerpo).toContain('rentabilidad_operativa_real');
    expect(cuerpo).toContain('margen_pct');
  });

  it('exportar CSV exige permiso propio, no basta con ver', async () => {
    mocks.authenticateRequest.mockResolvedValue({
      ...authSinPermiso,
      user: { ...authSinPermiso.user, role: { ...authSinPermiso.user.role, permisos: { hospitality_finanzas: { ver: true } } } },
    });
    const res = await rentabilidadGET(request('http://test.local/api/hospitality/rentabilidad?formato=csv') as any);
    expect(res.status).toBe(403);
    expect((await res.json()).permisoRequerido).toBe('hospitality_finanzas.exportar');
  });
});
