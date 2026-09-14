/**
 * Guardia del aviso de llegadas de mañana con el registro de viajeros a medias.
 *
 * El aviso del planning (y de la bandeja) existe para que quien recibe al huésped
 * pueda completar datos HOY. Si el endpoint deja de marcar `llegaManana` —por una
 * regla de día local que derive, por un campo que se renombre—, el aviso se apaga
 * en silencio y nadie se entera hasta que el huésped ya está en la puerta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  return {
    prisma: {
      hospitalityReservation: {
        findMany: vi.fn(),
      },
    },
    authenticateRequest: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ prisma: hoisted.prisma }));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: (...args: unknown[]) => hoisted.authenticateRequest(...args),
}));

import { GET } from '../app/api/hospitality/reservations/route';

const AUTH_OK = {
  valid: true,
  tenant: { id: 't1', moneda: 'EUR' },
  user: { id: 'u1' },
} as never;

function reservaConRegistro(checkIn: Date, registro: Record<string, unknown>) {
  return {
    id: `r_${checkIn.getTime()}`,
    propertyId: 'p1',
    unitId: 'u1',
    channel: 'Airbnb',
    estado: 'confirmed',
    checkIn,
    checkOut: new Date(checkIn.getTime() + 3 * 86_400_000),
    amountAfterTax: 500,
    currency: 'EUR',
    specialRequests: null,
    externalBookingId: 'AB-1',
    guestData: null,
    contact: null,
    unit: { id: 'u1', nombre: 'APT 1', codigo: 'A1' },
    property: { id: 'p1', nombre: 'Casa Mar' },
    travelers: [{ id: 't1' }, { id: 't2' }],
    compliance: { estadoReserva: null, estadoViajeros: null, enviadoEn: null, procesadoEn: null },
    ...registro,
  };
}

/** Medianoche local de hoy + N días (la misma regla de día que usa la API). */
function diaLocal(desplazamiento: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + desplazamiento);
  d.setHours(15, 0, 0, 0);
  return d;
}

function buildReq(url: string): any {
  return { url } as unknown as any;
}

describe('GET /api/hospitality/reservations — aviso de llegadas de mañana', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authenticateRequest.mockResolvedValue(AUTH_OK);
  });

  it('marca llegaManana para una reserva cuyo check-in es mañana con datos pendientes', async () => {
    hoisted.prisma.hospitalityReservation.findMany.mockResolvedValue([
      reservaConRegistro(diaLocal(1), {}),
    ]);

    const res = await GET(buildReq('https://volkern.app/api/hospitality/reservations'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.reservations).toHaveLength(1);
    expect(data.reservations[0].llegaManana).toBe(true);
    // El resumen del registro llega calculado por el dominio, no crudo.
    expect(data.reservations[0].registro).toEqual({
      total: 2,
      registrados: 0,
      pendientes: 2,
      estado: 'datos_pendientes',
      etiqueta: '2 viajeros · 0 registrados · 2 pendientes',
      listoParaEnviar: false,
    });
  });

  it('no marca llegaManana si el check-in es hoy o pasado mañana', async () => {
    hoisted.prisma.hospitalityReservation.findMany.mockResolvedValue([
      reservaConRegistro(diaLocal(0), {}),
      reservaConRegistro(diaLocal(2), {}),
    ]);

    const res = await GET(buildReq('https://volkern.app/api/hospitality/reservations'));
    const data = await res.json();

    expect(data.reservations[0].llegaManana).toBe(false);
    expect(data.reservations[1].llegaManana).toBe(false);
  });

  it('el aviso solo debe dispararse en llegadas: una reserva de ayer no se marca', async () => {
    hoisted.prisma.hospitalityReservation.findMany.mockResolvedValue([
      reservaConRegistro(diaLocal(-1), {}),
    ]);

    const res = await GET(buildReq('https://volkern.app/api/hospitality/reservations'));
    const data = await res.json();

    expect(data.reservations[0].llegaManana).toBe(false);
  });

  it('el resumen distingue un registro completo de uno a medias', async () => {
    // 2 viajeros completos → pendiente_envio (falta enviarlo, no faltan datos).
    hoisted.prisma.hospitalityReservation.findMany.mockResolvedValue([
      reservaConRegistro(diaLocal(1), {
        travelers: [
          // El domicilio es obligatorio desde que el parte de viajeros (PV) lo
          // exige por persona: sin él estos viajeros contarían como incompletos.
          {
            id: 'v1',
            nombre: 'María',
            apellido1: 'García',
            tipoDocumento: 'DNI',
            numeroDocumento: '12345678Z',
            soporteDocumento: 'S001',
            fechaNacimiento: new Date('1990-01-01'),
            direccion: 'Calle Falsa 123',
            codigoPostal: '41001',
          },
          {
            id: 'v2',
            nombre: 'John',
            apellido1: 'Smith',
            tipoDocumento: 'PAS',
            numeroDocumento: 'X1234567',
            fechaNacimiento: new Date('1985-05-05'),
            direccion: 'Avenida de la Constitución 5',
            codigoPostal: '41001',
          },
        ],
        compliance: {
          estadoReserva: 'enviado',
          estadoViajeros: null,
          enviadoEn: new Date(),
          procesadoEn: null,
        },
      }),
    ]);

    const res = await GET(buildReq('https://volkern.app/api/hospitality/reservations'));
    const data = await res.json();

    expect(data.reservations[0].registro.total).toBe(2);
    expect(data.reservations[0].registro.registrados).toBe(2);
    expect(data.reservations[0].registro.pendientes).toBe(0);
    // RH ya enviado + PV sin datos que recoger → lo menos avanzado manda.
    expect(data.reservations[0].registro.estado).toBe('pendiente_envio');
  });

  it('funciona sin registro ni viajeros (reserva antigua): el campo no revienta la respuesta', async () => {
    hoisted.prisma.hospitalityReservation.findMany.mockResolvedValue([
      { ...reservaConRegistro(diaLocal(1), {}), travelers: [], compliance: null },
    ]);

    const res = await GET(buildReq('https://volkern.app/api/hospitality/reservations'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.reservations[0].registro.total).toBe(0);
    // Sin viajeros declarados el parte (PV) está a medias por definición: el
    // agregado toma el estado menos avanzado, datos pendientes.
    expect(data.reservations[0].registro.estado).toBe('datos_pendientes');
  });
});
