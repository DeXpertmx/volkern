import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests de las APIs de lectura del módulo Hospitality:
 *   - GET /api/hospitality/guests   (agrupación de huéspedes + historial, §20)
 *   - GET /api/hospitality/dashboard (KPIs §23: ocupación, ADR, canales, 7 días)
 *
 * Ambas deben ser LECTURA PURA (nunca crear/actualizar registros).
 */

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockAuth = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  hospitalityReservation: { findMany: vi.fn() },
  hospitalityUnit: { findMany: vi.fn() },
  // El dashboard resuelve el nombre de la propiedad para los drill-downs (§23).
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityCleaningTask: { groupBy: vi.fn() },
  hospitalityMaintenanceTask: { groupBy: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: (...a: any[]) => mockAuth(...a),
}));

import { GET as GETGuests } from '../app/api/hospitality/guests/route';
import { GET as GETDashboard } from '../app/api/hospitality/dashboard/route';

const AUTH_OK = { valid: true, tenant: { id: 't1' }, user: { id: 'u1' } };

function buildReq(url = 'https://volkern.app/api/hospitality/guests') {
  return new Request(url) as any;
}

function makeReservation(overrides: any = {}) {
  const ci = overrides.checkIn || new Date('2026-09-01T15:00:00');
  const co = overrides.checkOut || new Date('2026-09-05T11:00:00');
  return {
    id: overrides.id || 'r1',
    tenantId: 't1',
    contactId: overrides.contactId ?? null,
    channel: overrides.channel || 'Airbnb',
    externalBookingId: overrides.externalBookingId || 'BK-1',
    estado: overrides.estado || 'confirmed',
    checkIn: ci,
    checkOut: co,
    amountAfterTax: overrides.amountAfterTax ?? 5000,
    currency: 'MXN',
    specialRequests: overrides.specialRequests ?? null,
    guestData: overrides.guestData || null,
    contact: overrides.contact || null,
    property: { id: 'p1', nombre: 'Casa Mar' },
    unit: { id: 'u1', nombre: 'Suite Océano', codigo: 'SO-1' },
    ...overrides,
  };
}

describe('GET /api/hospitality/guests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
  });

  it('autenticación inválida → 401', async () => {
    mockAuth.mockResolvedValue({ valid: false, error: 'no auth' });
    const res = await GETGuests(buildReq());
    expect(res.status).toBe(401);
  });

  it('filtra por tenantId y agrupa por contacto CRM', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([
      makeReservation({ id: 'r1', contactId: 'c1', contact: { id: 'c1', nombre: 'María García', email: 'maria@x.com', telefono: '+52' } }),
      makeReservation({ id: 'r2', contactId: 'c1', contact: { id: 'c1', nombre: 'María García', email: 'maria@x.com', telefono: '+52' }, checkIn: new Date('2026-08-01T15:00:00'), checkOut: new Date('2026-08-03T11:00:00') }),
    ]);
    const res = await GETGuests(buildReq());
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.guests).toHaveLength(1); // mismo contacto → un solo huésped
    expect(d.guests[0].totalEstancias).toBe(2);
    expect(d.guests[0].totalNoches).toBe(6); // 4 + 2
    expect(d.guests[0].totalGasto).toBe(10000);
    expect(d.guests[0].contactId).toBe('c1');
    expect(d.guests[0].reservas).toHaveLength(2);
    // Verifica que se consultó SOLO el tenant del token (aislamiento)
    const where = prisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
  });

  it('agrupa por email cuando no hay contacto (guestData)', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([
      makeReservation({ id: 'r1', guestData: { firstName: 'Ana', lastName: 'Torres', email: 'ana@x.com' } }),
      makeReservation({ id: 'r2', guestData: { firstName: 'Ana', lastName: 'Torres', email: 'ana@x.com' }, checkIn: new Date('2026-07-10T15:00:00'), checkOut: new Date('2026-07-12T11:00:00') }),
    ]);
    const res = await GETGuests(buildReq());
    const d = await res.json();
    expect(d.guests).toHaveLength(1);
    expect(d.guests[0].nombre).toBe('Ana Torres');
    expect(d.guests[0].email).toBe('ana@x.com');
    expect(d.guests[0].contactId).toBeNull();
  });

  it('lee el campo nombre del guestData (formato del webhook: { nombre, email })', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([
      makeReservation({ id: 'r1', guestData: { nombre: 'María García', email: 'maria.garcia@example.com', telefono: '+52' } }),
    ]);
    const res = await GETGuests(buildReq());
    const d = await res.json();
    expect(d.guests).toHaveLength(1);
    expect(d.guests[0].nombre).toBe('María García');
    expect(d.guests[0].email).toBe('maria.garcia@example.com');
    expect(d.guests[0].telefono).toBe('+52');
  });

  it('huésped sin datos → una entrada por reserva, sin romper', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([
      makeReservation({ id: 'r1', guestData: null }),
    ]);
    const res = await GETGuests(buildReq());
    const d = await res.json();
    expect(d.guests).toHaveLength(1);
    expect(d.guests[0].nombre).toBe('Huésped sin datos');
  });

  it('busca por q en nombre/email/teléfono', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([
      makeReservation({ id: 'r1', contactId: 'c1', contact: { id: 'c1', nombre: 'María García', email: 'maria@x.com', telefono: '+52' } }),
      makeReservation({ id: 'r2', contactId: 'c2', contact: { id: 'c2', nombre: 'Juan Pérez', email: 'juan@x.com', telefono: '+53' } }),
    ]);
    const res = await GETGuests(buildReq('https://volkern.app/api/hospitality/guests?q=maria'));
    const d = await res.json();
    expect(d.guests).toHaveLength(1);
    expect(d.guests[0].nombre).toBe('María García');
  });
});

describe('GET /api/hospitality/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
    prisma.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'u1', estado: 'available', propertyId: 'p1' },
      { id: 'u2', estado: 'occupied', propertyId: 'p1' },
    ]);
    prisma.hospitalityProperty.findMany.mockResolvedValue([{ id: 'p1', nombre: 'Casa Mar' }]);
    prisma.hospitalityCleaningTask.groupBy.mockResolvedValue([{ estado: 'pending', _count: { _all: 2 } }]);
    prisma.hospitalityMaintenanceTask.groupBy.mockResolvedValue([{ estado: 'abierta', _count: { _all: 1 } }]);
  });

  it('autenticación inválida → 401', async () => {
    mockAuth.mockResolvedValue({ valid: false, error: 'no auth' });
    const res = await GETDashboard(buildReq('https://volkern.app/api/hospitality/dashboard'));
    expect(res.status).toBe(401);
  });

  it('calcula KPIs: ocupación hoy, ingresos, ADR y mix de canales', async () => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    prisma.hospitalityReservation.findMany.mockResolvedValue([
      // Reserva activa que cubre hoy (ocupada)
      makeReservation({ id: 'r1', unitId: 'u2', channel: 'Airbnb', checkIn: new Date(hoy.getTime() - 86_400_000), checkOut: new Date(hoy.getTime() + 86_400_000), amountAfterTax: 3000 }),
      // Reserva futura (no ocupa hoy, sí cuenta en ingresos)
      makeReservation({ id: 'r2', unitId: 'u1', channel: 'Booking.com', checkIn: new Date(hoy.getTime() + 5 * 86_400_000), checkOut: new Date(hoy.getTime() + 8 * 86_400_000), amountAfterTax: 6000 }),
      // Cancelada (no cuenta)
      makeReservation({ id: 'r3', unitId: 'u1', channel: 'Airbnb', estado: 'cancelled', checkIn: new Date(hoy.getTime() + 86_400_000), checkOut: new Date(hoy.getTime() + 3 * 86_400_000), amountAfterTax: 9999 }),
    ]);
    const res = await GETDashboard(buildReq('https://volkern.app/api/hospitality/dashboard'));
    expect(res.status).toBe(200);
    const d = await res.json();

    expect(d.kpis.totalUnidades).toBe(2);
    expect(d.kpis.ocupadasHoy).toBe(1);
    expect(d.kpis.ocupacionHoy).toBeCloseTo(0.5);
    expect(d.kpis.cancelaciones).toBe(1);
    expect(d.kpis.reservasActivas).toBe(2);
    expect(d.kpis.ingresos).toBe(9000); // 3000 + 6000 (sin la cancelada)
    expect(d.kpis.nochesVendidas).toBe(5); // 2 + 3
    expect(d.kpis.adr).toBeCloseTo(1800); // 9000 / 5

    // Mix de canales: 1 Airbnb + 1 Booking.com (sin la cancelada)
    expect(d.mixCanales).toHaveLength(2);
    const airbnb = d.mixCanales.find((c: any) => c.canal === 'Airbnb');
    expect(airbnb.reservas).toBe(1);
    expect(airbnb.ingresos).toBe(3000);

    // Próximos 7 días: el día 5 tiene 1 ocupada (r2)
    const dia5 = d.proximos7[5];
    expect(dia5.ocupadas).toBe(1);
    expect(dia5.total).toBe(2);

    // Operaciones
    expect(d.operaciones.limpieza.pending).toBe(2);
    expect(d.operaciones.mantenimiento.abierta).toBe(1);
  });

  it('sin reservas ni unidades → KPIs en cero, ADR null (no inventa métricas)', async () => {
    prisma.hospitalityUnit.findMany.mockResolvedValue([]);
    prisma.hospitalityReservation.findMany.mockResolvedValue([]);
    const res = await GETDashboard(buildReq('https://volkern.app/api/hospitality/dashboard'));
    const d = await res.json();
    expect(d.kpis.totalUnidades).toBe(0);
    expect(d.kpis.ocupacionHoy).toBe(0);
    expect(d.kpis.ingresos).toBe(0);
    expect(d.kpis.adr).toBeNull();
    expect(d.proximos7).toHaveLength(7);
  });

  it('aislamiento: consulta solo el tenant del token', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([]);
    await GETDashboard(buildReq('https://volkern.app/api/hospitality/dashboard'));
    const whereRes = prisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(whereRes.tenantId).toBe('t1');
    const whereUnits = prisma.hospitalityUnit.findMany.mock.calls[0][0].where;
    expect(whereUnits.tenantId).toBe('t1');
  });
});