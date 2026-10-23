// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El extremo a extremo del peaje del canal (ver lib/hospitality/vinculo-revision.ts):
 *
 *  1. La vinculación automática DEL WEBHOOK crea el vínculo
 *     `pendiente_revision` — ya no publica a la siguiente pasada.
 *  2. La LECTURA DE ENTRADA (`resolveMappingDetailed`) lo acepta igual que un
 *     activo: la reserva que provocó el vínculo entra igual de bien.
 *  3. Vincular desde el panel (origen manual) sigue naciendo `activo`.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    connectivityMapping: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    hospitalitySyncLog: { create: vi.fn() },
  },
  testConnectivityConnection: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/hospitality/connectivity', () => ({
  testConnectivityConnection: mocks.testConnectivityConnection,
}));

const { vincularUnidadAMapping } = await import('@/lib/hospitality/incidencias');
const { resolveMappingDetailed } = await import('@/lib/hospitality/reservations');
const { VINCULO_PENDIENTE_REVISION } = await import(
  '@/lib/hospitality/vinculo-revision'
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.connectivityMapping.findMany.mockResolvedValue([]);
  mocks.prisma.connectivityMapping.update.mockResolvedValue({ id: 'map_1' });
  mocks.prisma.connectivityMapping.upsert.mockResolvedValue({ id: 'map_1' });
  mocks.prisma.hospitalitySyncLog.create.mockResolvedValue({ id: 'log_1' });
});

describe('vincularUnidadAMapping — estado de nacimiento', () => {
  it('vínculo automático del WEBHOOK nace pendiente_revision (no publica)', async () => {
    await vincularUnidadAMapping({
      tenantId: 't1',
      propertyId: 'p1',
      hotelCode: 'sandbox-pms',
      unitId: 'u1',
      roomCode: 'penthouse',
      rateplanCode: 'penthouse-ep',
      metadata: {
        origen: 'vinculacion_automatica_webhook',
        motivo: 'codigo_de_unidad',
      },
      traza: {
        origen: 'webhook',
        motivo: 'codigo_de_unidad',
        hotelCode: 'sandbox-pms',
        roomCode: 'penthouse',
        rateplanCode: 'penthouse-ep',
        unit: 'Penthouse',
      },
    });

    const upsert = mocks.prisma.connectivityMapping.upsert.mock.calls[0][0];
    expect(upsert.create.estado).toBe(VINCULO_PENDIENTE_REVISION);
    expect(upsert.update.estado).toBe(VINCULO_PENDIENTE_REVISION);
    // La traza de la vinculación sigue quedando (auditoría sin publicar).
    expect(mocks.prisma.hospitalitySyncLog.create).toHaveBeenCalled();
  });

  it('vínculo creado por el OPERADOR sigue naciendo activo (publica)', async () => {
    await vincularUnidadAMapping({
      tenantId: 't1',
      propertyId: 'p1',
      hotelCode: 'sandbox-pms',
      unitId: 'u1',
      roomCode: 'penthouse',
      rateplanCode: null,
      metadata: { origen: 'manual', confirmadoPor: 'operador_1' },
    });

    const upsert = mocks.prisma.connectivityMapping.upsert.mock.calls[0][0];
    expect(upsert.create.estado).toBe('activo');
    expect(upsert.update.estado).toBe('activo');
  });

  it('apaga también los pendientes anteriores de la unidad (una unidad, una habitación)', async () => {
    mocks.prisma.connectivityMapping.findMany.mockResolvedValue([
      { id: 'vieux', externalPropertyId: 'sandbox-pms', externalUnitCode: 'suite' },
    ]);

    await vincularUnidadAMapping({
      tenantId: 't1',
      propertyId: 'p1',
      hotelCode: 'sandbox-pms',
      unitId: 'u1',
      roomCode: 'penthouse',
      rateplanCode: null,
      metadata: { origen: 'vinculacion_automatica_webhook' },
    });

    // La búsqueda de previos de la unidad incluye lo pendiente de revisión.
    const previosWhere = mocks.prisma.connectivityMapping.findMany.mock.calls[0][0].where;
    expect(previosWhere.estado).toEqual({ in: ['activo', 'pendiente_revision'] });
    // Y lo otro apagado.
    expect(mocks.prisma.connectivityMapping.update).toHaveBeenCalledWith({
      where: { id: 'vieux' },
      data: { estado: 'inactivo' },
    });
  });
});

describe('resolveMappingDetailed — entrada acepta lo pendiente', () => {
  const mappingPendiente = {
    externalPropertyId: 'sandbox-pms',
    externalUnitCode: 'penthouse',
    externalRatePlanCode: 'penthouse-ep',
    estado: VINCULO_PENDIENTE_REVISION,
    property: { id: 'p1', tenantId: 't1' },
    unit: { id: 'u1', nombre: 'Penthouse' },
  };

  it('un vínculo pendiente resuelve la reserva igual que uno activo', async () => {
    mocks.prisma.connectivityMapping.findMany.mockResolvedValue([mappingPendiente]);

    const res = await resolveMappingDetailed({
      action: 'book',
      hotelCode: 'sandbox-pms',
      bookingId: 'BKG-1',
      channel: 'Airbnb',
      rooms: [{ roomCode: ' Penthouse ', rateplanCode: 'penthouse-ep' }],
    } as any);

    // Lectura de ENTRADA: estados trabajables (ver vinculo-revision.ts).
    expect(mocks.prisma.connectivityMapping.findMany.mock.calls[0][0].where.estado).toEqual({
      in: ['activo', 'pendiente_revision'],
    });
    expect(res.motivo).toBe('ok');
    expect(res.mapping?.unit?.id).toBe('u1');
    expect(res.roomCode).toBe('Penthouse');
    expect(res.rateplanCode).toBe('penthouse-ep');
  });

  it('sin ningún mapping responde sin_mapping (la autovinculación es paso aparte)', async () => {
    mocks.prisma.connectivityMapping.findMany.mockResolvedValue([]);

    const res = await resolveMappingDetailed({
      action: 'book',
      hotelCode: 'sandbox-pms',
      bookingId: 'BKG-2',
      channel: 'Airbnb',
      rooms: [{ roomCode: 'no_existe' }],
    } as any);

    // Sin mappings en absoluto el motivo es sin_mapping (la guardia de
    // roomcode solo aplica cuando hay mappings que no traen ese roomCode).
    expect(res.motivo).toBe('sin_mapping');
    expect(res.mapping).toBeNull();
  });

  it('un roomCode ajeno a todos los mappings mantiene roomcode_desconocido', async () => {
    mocks.prisma.connectivityMapping.findMany.mockResolvedValue([
      { ...mappingPendiente, externalUnitCode: 'suite' },
    ]);

    const res = await resolveMappingDetailed({
      action: 'book',
      hotelCode: 'sandbox-pms',
      bookingId: 'BKG-2',
      channel: 'Airbnb',
      rooms: [{ roomCode: 'penthouse' }],
    } as any);

    expect(res.motivo).toBe('roomcode_desconocido');
    expect(res.mapping).toBeNull();
  });
});
