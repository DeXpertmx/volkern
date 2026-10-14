// @vitest-environment node

/**
 * Guardia de `GET /api/admin/conectividad/mensajes-sin-mapping`.
 *
 * Es la superficie que convierte un `hotel_id` desconocido en algo accionable:
 * si esto se rompe, un mensaje de huésped de un código sin vínculo se queda en
 * el log del contenedor y nadie sabe que hay un hotel mandando mensajes que no
 * se entregan. Lo que se fija:
 *  - solo Superadmin (vincular un código que no es de nadie es decisión de
 *    plataforma, no de un hotel);
 *  - la lista NO arrastra el mensaje del huésped (PII): código, canal, motivo,
 *    intentos y fechas;
 *  - el código dice qué existe ya en Volkern aunque el vínculo esté inactivo
 *    (reactivar el vínculo ≠ crear otro);
 *  - sin códigos no se consulta el mapping: una lista vacía no pide nada.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  connectivityMapping: { findMany: vi.fn() },
  listarIncidenciasMensajeSinMapping: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/hospitality/mensajes-service', () => ({
  listarIncidenciasMensajeSinMapping: (...a: unknown[]) =>
    mocks.listarIncidenciasMensajeSinMapping(...a),
  // La ruta solo usa el listado; el resto del servicio no debe entrar en el bundle
  // de esta guardia sin querer.
  registrarMensajeEntrante: vi.fn(),
  registrarIncidenciaMensajeSinMapping: vi.fn(),
  cerrarIncidenciasMensajeSinMapping: vi.fn(),
}));

const { getServerSession } = await import('next-auth');
const { GET } = await import('@/app/api/admin/conectividad/mensajes-sin-mapping/route');

const INCIDENCIA = {
  id: 'ev-1',
  hotelCode: '75fdbbce2e',
  canal: 'booking.com',
  bookingExterno: null,
  intentos: 40,
  primeraFecha: '2026-10-09T18:00:00.000Z',
  ultimaFecha: '2026-10-09T20:00:00.000Z',
  errorMensaje: 'Sin mapping activo para hotelCode 75fdbbce2e',
};

describe('GET /api/admin/conectividad/mensajes-sin-mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as any).mockResolvedValue({ user: { id: 'u1' } });
    mocks.user.findUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Superadmin' } });
    mocks.listarIncidenciasMensajeSinMapping.mockResolvedValue([INCIDENCIA]);
    mocks.connectivityMapping.findMany.mockResolvedValue([]);
  });

  it('sin sesión → 401 y no lista incidencias', async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.listarIncidenciasMensajeSinMapping).not.toHaveBeenCalled();
  });

  it('rol distinto de Superadmin → 403', async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Admin' } });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.listarIncidenciasMensajeSinMapping).not.toHaveBeenCalled();
  });

  it('publica el código con su canal, su motivo y sus intentos', async () => {
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.incidencias[0]).toMatchObject({
      hotelCode: '75fdbbce2e',
      canal: 'booking.com',
      intentos: 40,
      errorMensaje: 'Sin mapping activo para hotelCode 75fdbbce2e',
    });
  });

  it('no arrastra el mensaje del huésped: la incidencia es código, canal y motivo', async () => {
    const res = await GET();
    const cuerpo = JSON.stringify(await res.json());
    // Ni un campo de contenido ni los datos del huésped entran en la respuesta.
    for (const prohibido of ['contenido', 'mensaje', 'huespedNombre', 'huespedEmail', 'payload']) {
      expect(cuerpo, `la respuesta no debe llevar ${prohibido}`).not.toContain(`"${prohibido}"`);
    }
  });

  it('dice qué existe ya en Volkern para ese código, aunque el vínculo esté inactivo', async () => {
    mocks.connectivityMapping.findMany.mockResolvedValue([
      {
        externalPropertyId: '75fdbbce2e',
        estado: 'inactivo',
        tenantId: 't1',
        property: { id: 'p1', nombre: 'Ciudad Patio Cuarenta' },
      },
    ]);

    const res = await GET();
    const data = await res.json();

    // El mapping se busca solo por los códigos que aparecen en la lista.
    expect(mocks.connectivityMapping.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ externalPropertyId: { in: ['75fdbbce2e'] } }),
      })
    );
    expect(data.incidencias[0].vinculos).toEqual([
      { propertyId: 'p1', property: 'Ciudad Patio Cuarenta', tenantId: 't1', estado: 'inactivo' },
    ]);
  });

  it('sin incidencias no se consulta el mapping y los vínculos van vacíos', async () => {
    mocks.listarIncidenciasMensajeSinMapping.mockResolvedValue([]);
    const res = await GET();
    const data = await res.json();
    expect(data.total).toBe(0);
    expect(mocks.connectivityMapping.findMany).not.toHaveBeenCalled();
  });
});
