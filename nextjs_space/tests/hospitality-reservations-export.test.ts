// @vitest-environment node
//
// GET /api/hospitality/reservations/export — el CSV de la lista del día.
// Lo que se vigila: la MISMA autenticación y los MISMOS filtros que la lista
// JSON (la recepción exporta exactamente lo que ve en pantalla), una columna
// por pregunta del hotel con las respuestas de cada reserva, 404 razonado con
// 0 reservas, y degradación elegante si la consulta de preguntas falla.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const prisma = vi.hoisted(() => ({
  hospitalityReservation: { findMany: vi.fn() },
  hospitalityCheckinPregunta: { findMany: vi.fn() },
}));
const mockAuth = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: (...a: unknown[]) => mockAuth(...a),
}));
vi.mock('@/lib/hospitality/registro-viajeros-service', () => ({
  partesDeViajerosPorReserva: vi.fn().mockResolvedValue(new Map()),
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/hospitality/reservations/export/route';

const AUTH_OK = { valid: true, tenant: { id: 't1' }, user: { id: 'u1', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } } };

function peticion(query = '') {
  return new NextRequest(`http://localhost/api/hospitality/reservations/export${query}`);
}

const RESERVA = {
  id: 'r1',
  estado: 'confirmed',
  externalBookingId: 'BE-2026-001',
  channel: 'Directa',
  amountAfterTax: 3000,
  currency: 'MXN',
  checkIn: new Date('2026-10-01T15:00:00Z'),
  checkOut: new Date('2026-10-03T11:00:00Z'),
  guestData: { firstName: 'Ana', lastName: 'Ruiz', email: 'ana@ensayo.test', phone: '+34 666' },
  respuestasCheckin: { p1: 'Night (after 19:00)' },
  unit: { id: 'u1', nombre: 'Suite 1', codigo: 'S1' },
  property: { id: 'p1', nombre: 'Hotel Volcán' },
  contact: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(AUTH_OK);
  prisma.hospitalityCheckinPregunta.findMany.mockResolvedValue([
    { id: 'p1', es: 'Hora estimada de llegada' },
  ]);
});

describe('GET /api/hospitality/reservations/export', () => {
  it('autenticación inválida → 401 (la misma puerta que la lista)', async () => {
    mockAuth.mockResolvedValue({ valid: false, error: 'no auth' });
    const res = await GET(peticion());
    expect(res.status).toBe(401);
  });

  it('responde text/csv con BOM, cabeceras legibles y una columna por pregunta', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([RESERVA]);

    const res = await GET(peticion());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="reservas-');

    // El BOM se comprueba en BYTES: `res.text()` lo recorta (TextDecoder con
    // ignoreBOM=false lo elimina al decodificar), pero lo que Excel recibe por
    // el cable son los bytes EF BB BF — y eso es lo que tiene que estar ahí.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    const lineas = csv.slice(1).split('\r\n').filter(Boolean);
    expect(lineas[0]).toContain('Huésped');
    expect(lineas[0]).toContain('Teléfono');
    expect(lineas[0]).toContain('Hora estimada de llegada');
    expect(lineas[1]).toContain('BE-2026-001');
    expect(lineas[1]).toContain('Ana Ruiz');
    expect(lineas[1]).toContain('Night (after 19:00)');
  });

  it('usa los MISMOS filtros que la lista JSON (q, estado, from, to viajan al where)', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([]);

    await GET(peticion('?estado=confirmed&canal=Directa&from=2026-10-01&to=2026-10-11&q=ana'));
    const where = prisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.estado).toBe('confirmed');
    expect(where.channel).toMatchObject({ contains: 'Directa' });
    expect(where.checkOut).toMatchObject({ gte: new Date('2026-10-01') });
    expect(where.checkIn).toMatchObject({ lt: new Date('2026-10-11') });
    expect(where.OR).toBeDefined();
  });

  it('el where SIEMPRE lleva el tenant: sin filtros, solo salen reservas del hotel que pide', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([]);

    await GET(peticion());
    const where = prisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 't1' });
  });

  it('sin reservas responde 404 razonado, no un CSV vacío que confunde', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([]);
    const res = await GET(peticion());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('No hay reservas');
  });

  it('si la consulta de preguntas falla, el CSV sale con las columnas fijas (degradación elegante)', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([RESERVA]);
    prisma.hospitalityCheckinPregunta.findMany.mockRejectedValue(new Error('bd caída'));

    const res = await GET(peticion());
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain('Huésped');
    expect(csv).not.toContain('Hora estimada de llegada');
    // Y la respuesta guardada no desaparece del mundo: solo no tiene columna hoy.
    expect(csv).not.toContain('Night (after 19:00)');
  });
});
