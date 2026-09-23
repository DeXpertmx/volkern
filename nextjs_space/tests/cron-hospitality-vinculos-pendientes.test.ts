// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectivityMapping: { findMany: vi.fn() },
  hospitalitySyncLog: { findFirst: vi.fn(), create: vi.fn() },
  user: { findMany: vi.fn() },
  sendPushNotification: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/services/push-notification', () => ({
  sendPushNotification: mocks.sendPushNotification,
}));

const {
  runHospitalityVinculosPendientesScan,
  construirResumen,
  tocaAvisar,
  INTERVALO_RESUMEN_MS,
} = await import('@/lib/cron/hospitality-vinculos-pendientes');

const AHORA = new Date('2026-09-16T09:45:00.000Z');
const HACE_UN_DIA = new Date(AHORA.getTime() - 24 * 60 * 60 * 1000).toISOString();
const HACE_UNA_SEMANA = new Date(AHORA.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

/** Vínculo creado solo por el sistema, tal como lo devuelve la consulta. */
function vinculo(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 't1',
    propertyId: 'p1',
    externalPropertyId: 'sandbox-pms',
    externalUnitCode: 'penthouse',
    externalRatePlanCode: 'penthouse-ep',
    metadata: {
      origen: 'vinculacion_automatica_webhook',
      motivo: 'codigo_de_unidad',
      bookingId: 'BKG-999',
      channel: 'airbnb',
    },
    fechaCreacion: new Date(HACE_UN_DIA),
    property: { nombre: 'Villa Mar Azul' },
    unit: { id: 'unit_free', nombre: 'Penthouse' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connectivityMapping.findMany.mockResolvedValue([]);
  mocks.hospitalitySyncLog.findFirst.mockResolvedValue(null);
  mocks.hospitalitySyncLog.create.mockResolvedValue({ id: 'sync_1' });
  // El aviso va a quien puede CONFIGURAR canales (capacidad
  // `integraciones.gestionar`), no a quien se llame «Admin»: cada candidato
  // llega con su rol y la regla del servidor decide.
  mocks.user.findMany.mockResolvedValue([
    { id: 'u_admin', role: { id: 'role-admin', nombre: 'Anfitrión', permisos: { all: true } } },
  ]);
  mocks.sendPushNotification.mockResolvedValue({ success: true });
});

describe('resumen periódico de vínculos automáticos', () => {
  it('sin vínculos pendientes no avisa ni deja marca', async () => {
    const resumen = await runHospitalityVinculosPendientesScan(AHORA);

    expect(resumen.success).toBe(true);
    expect(resumen.tenantsAvisados).toBe(0);
    expect(resumen.vinculosPendientes).toBe(0);
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
    expect(mocks.hospitalitySyncLog.create).not.toHaveBeenCalled();
  });

  it('consulta solo los vínculos activos que creó el webhook', async () => {
    await runHospitalityVinculosPendientesScan(AHORA);

    const where = mocks.connectivityMapping.findMany.mock.calls[0][0].where;
    expect(where.provider).toBe('channel_connectivity');
    expect(where.estado).toBe('activo');
    expect(where.metadata).toEqual({
      path: ['origen'],
      equals: 'vinculacion_automatica_webhook',
    });
  });

  it('avisa a los administradores y deja la marca del resumen', async () => {
    mocks.connectivityMapping.findMany.mockResolvedValue([vinculo()]);

    const resumen = await runHospitalityVinculosPendientesScan(AHORA);

    expect(resumen.tenantsAvisados).toBe(1);
    expect(resumen.vinculosPendientes).toBe(1);
    expect(mocks.user.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1' });

    const [userId, aviso] = mocks.sendPushNotification.mock.calls[0];
    expect(userId).toBe('u_admin');
    expect(aviso.title).toContain('1');
    expect(aviso.body).toContain('penthouse');
    expect(aviso.body).toContain('Penthouse');
    expect(aviso.body).toContain('sin revisar');
    expect(aviso.url).toBe('/dashboard/hospitality/onboarding?propertyId=p1');

    const marca = mocks.hospitalitySyncLog.create.mock.calls[0][0].data;
    expect(marca).toMatchObject({
      tenantId: 't1',
      propertyId: 'p1',
      tipo: 'resumen_vinculos_automaticos',
      estado: 'exito',
    });
    expect(marca.responseBody.motivo).toBe('primer_resumen');
    expect(marca.responseBody.vinculos).toBe(1);
  });

  it('no repite el resumen si el anterior es reciente y no hay vínculos nuevos', async () => {
    mocks.connectivityMapping.findMany.mockResolvedValue([vinculo()]);
    mocks.hospitalitySyncLog.findFirst.mockResolvedValue({
      fechaCreacion: new Date(AHORA.getTime() - 24 * 60 * 60 * 1000),
    });

    const resumen = await runHospitalityVinculosPendientesScan(AHORA);

    expect(resumen.tenantsAvisados).toBe(0);
    expect(resumen.tenantsEnEspera).toBe(1);
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
    expect(mocks.hospitalitySyncLog.create).not.toHaveBeenCalled();
  });

  it('vuelve a avisar cuando aparece un vínculo nuevo', async () => {
    mocks.connectivityMapping.findMany.mockResolvedValue([
      // El vínculo es posterior al último resumen (hace 3 horas).
      vinculo({ fechaCreacion: new Date(AHORA.getTime() - 60 * 60 * 1000) }),
    ]);
    mocks.hospitalitySyncLog.findFirst.mockResolvedValue({
      fechaCreacion: new Date(AHORA.getTime() - 3 * 60 * 60 * 1000),
    });

    const resumen = await runHospitalityVinculosPendientesScan(AHORA);

    expect(resumen.tenantsAvisados).toBe(1);
    expect(mocks.hospitalitySyncLog.create.mock.calls[0][0].data.responseBody.motivo).toBe(
      'vinculos_nuevos'
    );
  });

  it('vuelve a avisar pasado el intervalo mínimo', async () => {
    mocks.connectivityMapping.findMany.mockResolvedValue([
      vinculo({ fechaCreacion: new Date(HACE_UNA_SEMANA) }),
    ]);
    mocks.hospitalitySyncLog.findFirst.mockResolvedValue({
      fechaCreacion: new Date(AHORA.getTime() - INTERVALO_RESUMEN_MS - 1000),
    });

    const resumen = await runHospitalityVinculosPendientesScan(AHORA);

    expect(resumen.tenantsAvisados).toBe(1);
    expect(mocks.hospitalitySyncLog.create.mock.calls[0][0].data.responseBody.motivo).toBe('intervalo');
  });

  it('agrupa por tenant y avisa a cada uno por separado', async () => {
    mocks.connectivityMapping.findMany.mockResolvedValue([
      vinculo(),
      vinculo({ tenantId: 't2', propertyId: 'p2', externalUnitCode: 'cabanas', property: { nombre: 'Casa Centro' } }),
    ]);

    const resumen = await runHospitalityVinculosPendientesScan(AHORA);

    expect(resumen.tenantsConPendientes).toBe(2);
    expect(resumen.tenantsAvisados).toBe(2);
    expect(mocks.hospitalitySyncLog.create).toHaveBeenCalledTimes(2);
  });

  it('sin administradores a los que avisar, deja la marca en pendiente', async () => {
    mocks.connectivityMapping.findMany.mockResolvedValue([vinculo()]);
    mocks.user.findMany.mockResolvedValue([]);

    const resumen = await runHospitalityVinculosPendientesScan(AHORA);

    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
    expect(resumen.tenantsAvisados).toBe(0);
    // La marca se escribe igual: el resumen se intentó, no se queda en bucle.
    expect(mocks.hospitalitySyncLog.create.mock.calls[0][0].data.estado).toBe('pendiente');
  });

  it('un tenant que falla no impide avisar a los demás', async () => {
    mocks.connectivityMapping.findMany.mockResolvedValue([
      vinculo({ tenantId: 't1' }),
      vinculo({ tenantId: 't2', propertyId: 'p2' }),
    ]);
    mocks.hospitalitySyncLog.findFirst
      .mockRejectedValueOnce(new Error('db caída'))
      .mockResolvedValue(null);

    const resumen = await runHospitalityVinculosPendientesScan(AHORA);

    expect(resumen.success).toBe(false);
    expect(resumen.errores[0]).toContain('db caída');
    expect(resumen.tenantsAvisados).toBe(1);
  });

  it('cuando todos los pendientes son de una propiedad enlaza a ella', async () => {
    mocks.connectivityMapping.findMany.mockResolvedValue([
      vinculo(),
      vinculo({ externalUnitCode: 'cabanas', unit: { id: 'u2', nombre: 'Cabañas' } }),
      vinculo({
        tenantId: 't1',
        propertyId: 'p2',
        externalUnitCode: 'estudio',
        property: { nombre: 'Casa Centro' },
      }),
    ]);

    const resumen = await runHospitalityVinculosPendientesScan(AHORA);

    expect(resumen.tenantsAvisados).toBe(1);
    expect(mocks.sendPushNotification.mock.calls[0][1].url).toBe('/dashboard/hospitality/onboarding');
  });
});

describe('construirResumen', () => {
  it('detalla hasta cinco vínculos y cuenta el resto', () => {
    const pendientes = Array.from({ length: 7 }, (_, i) => ({
      tenantId: 't1',
      propertyId: 'p1',
      property: 'Villa Mar Azul',
      hotelCode: 'sandbox-pms',
      roomCode: `room-${i}`,
      rateplanCode: null,
      unitId: `u${i}`,
      unit: `Unidad ${i}`,
      motivo: 'codigo_de_unidad',
      creadoEn: HACE_UN_DIA,
      bookingId: null,
      channel: null,
    }));

    const texto = construirResumen(pendientes, AHORA);

    expect(texto).toContain('Hay 7 vínculo(s)');
    expect(texto).toContain('room-0');
    expect(texto).not.toContain('room-5');
    expect(texto).toContain('y 2 más');
    expect(texto).toContain('para darlos por revisados');
  });
});

describe('tocaAvisar', () => {
  const pendiente = {
    tenantId: 't1',
    propertyId: 'p1',
    property: 'Villa',
    hotelCode: 'hotel',
    roomCode: 'room',
    rateplanCode: null,
    unitId: 'u1',
    unit: 'Uno',
    motivo: null,
    creadoEn: HACE_UN_DIA,
    bookingId: null,
    channel: null,
  };

  it('nunca avisa sin pendientes', () => {
    expect(tocaAvisar([], null, AHORA)).toEqual({ avisar: false, motivo: 'sin_pendientes' });
  });

  it('avisa en el primer resumen', () => {
    expect(tocaAvisar([pendiente], null, AHORA).motivo).toBe('primer_resumen');
  });

  it('avisa al vencer el intervalo, aunque no haya vínculos nuevos', () => {
    const viejo = { ...pendiente, creadoEn: HACE_UNA_SEMANA };
    const resumenVencido = new Date(AHORA.getTime() - INTERVALO_RESUMEN_MS);
    expect(tocaAvisar([viejo], resumenVencido, AHORA)).toEqual({ avisar: true, motivo: 'intervalo' });
  });

  it('se adelanta si hay vínculos posteriores al último resumen', () => {
    const reciente = new Date(AHORA.getTime() - 60 * 60 * 1000);
    const nuevo = { ...pendiente, creadoEn: new Date(AHORA.getTime() - 30 * 60 * 1000).toISOString() };
    expect(tocaAvisar([nuevo], reciente, AHORA)).toEqual({
      avisar: true,
      motivo: 'vinculos_nuevos',
    });
  });

  it('espera si el resumen es reciente y nada cambió', () => {
    const reciente = new Date(AHORA.getTime() - 60 * 60 * 1000);
    expect(tocaAvisar([pendiente], reciente, AHORA)).toEqual({
      avisar: false,
      motivo: 'resumen_reciente',
    });
  });
});
