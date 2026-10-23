// @vitest-environment node
//
// Alertas de códigos promocionales que no convierten.
//
// Lo que se vigila: que no se avise con muestra insuficiente, que un código
// inactivo no genere ruido, que la ventana sea la de REGISTRO (no la de la
// estancia), que el mismo aviso no se repita cada día pero sí cuando aparece un
// código nuevo, que un hotel sin destinatarios no pierda el rastro, y que la
// ejecución quede en el panel con el mismo id/etiqueta/cadencia que el
// scheduler.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  hospitalityPromoCode: { findMany: vi.fn() },
  hospitalityPromoConsulta: { findMany: vi.fn() },
  hospitalitySyncLog: { findFirst: vi.fn(), create: vi.fn() },
  tenant: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  sendPushNotification: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityPromoCode: mocks.hospitalityPromoCode,
    hospitalityPromoConsulta: mocks.hospitalityPromoConsulta,
    hospitalitySyncLog: mocks.hospitalitySyncLog,
    tenant: mocks.tenant,
    user: mocks.user,
  },
}));

vi.mock('@/lib/services/push-notification', () => ({
  sendPushNotification: mocks.sendPushNotification,
}));

import {
  CONVERSION_MINIMA_PCT,
  INTERVALO_ALERTA_MS,
  MAX_CODIGOS_EN_AVISO,
  MINIMO_CONSULTAS_ALERTA,
  codigosDeMarca,
  construirAvisoPromos,
  contarConsultas,
  decidirAvisoPromos,
  desdeVentanaAlertas,
  evaluarAlertasPromocion,
  type AlertaPromocion,
  type CodigoConConsultas,
} from '@/lib/hospitality/promos-alertas';
import {
  JOB_ID_PROMOS_ALERTAS,
  JOB_LABEL_PROMOS_ALERTAS,
  JOB_SCHEDULE_PROMOS_ALERTAS,
  TIPO_AVISO_PROMOS,
  runHospitalityPromosAlertasScan,
} from '@/lib/cron/hospitality-promos-alertas';
import { GET } from '@/app/api/cron/hospitality-promos-alertas/route';
import { getCronStatus } from '@/lib/cron/cron-status';

const RAIZ = path.resolve(__dirname, '..');
const URL_CRON = 'http://localhost:3098/api/cron/hospitality-promos-alertas';
const AHORA = new Date('2026-10-19T09:30:00.000Z');
const dia = 24 * 60 * 60 * 1000;
const fecha = (haceDias: number) => new Date(AHORA.getTime() - haceDias * dia);

const A = 'tenant_a';
const B = 'tenant_b';

function consultasDe(codigo: string, total: number, convertidas = 0, tenantId = A) {
  return Array.from({ length: total }, (_, i) => ({
    tenantId,
    codigo,
    reservationId: i < convertidas ? `res_${i}` : null,
  }));
}

function fila(over: Partial<CodigoConConsultas> = {}): CodigoConConsultas {
  return {
    tenantId: A,
    codigo: 'VERANO2027',
    activo: true,
    consultas: MINIMO_CONSULTAS_ALERTA,
    consultasConvertidas: 0,
    ...over,
  };
}

function alerta(over: Partial<AlertaPromocion> = {}): AlertaPromocion {
  return {
    tenantId: A,
    codigo: 'VERANO2027',
    consultas: MINIMO_CONSULTAS_ALERTA,
    consultasConvertidas: 0,
    consultasSinReserva: MINIMO_CONSULTAS_ALERTA,
    conversionPct: 0,
    motivo: 'sin_conversion',
    mensaje: `Nadie reservó tras aplicarlo en ${MINIMO_CONSULTAS_ALERTA} consultas.`,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hospitalityPromoCode.findMany.mockResolvedValue([]);
  mocks.hospitalityPromoConsulta.findMany.mockResolvedValue([]);
  mocks.hospitalitySyncLog.findFirst.mockResolvedValue(null);
  mocks.hospitalitySyncLog.create.mockResolvedValue({});
  mocks.tenant.findMany.mockResolvedValue([{ id: A, nombre: 'Hotel Volcán' }, { id: B, nombre: 'Casa del Mar' }]);
  mocks.user.findMany.mockResolvedValue([
    { id: 'user_a', role: { nombre: 'Anfitrión', permisos: { all: true } } },
  ]);
  mocks.sendPushNotification.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('contarConsultas', () => {
  it('cruza el catálogo con las consultas y cuenta las conversiones', () => {
    const filas = contarConsultas(
      [{ tenantId: A, codigo: 'verano2027', activo: true }],
      consultasDe('VERANO2027', 3, 1)
    );

    expect(filas).toEqual([
      { tenantId: A, codigo: 'VERANO2027', activo: true, consultas: 3, consultasConvertidas: 1 },
    ]);
  });

  it('separa cuentas y no inventa filas para códigos que ya no están en el catálogo', () => {
    const filas = contarConsultas(
      [
        { tenantId: A, codigo: 'VERANO2027', activo: true },
        { tenantId: B, codigo: 'VERANO2027', activo: false },
      ],
      [
        ...consultasDe('VERANO2027', 2, 0, A),
        ...consultasDe('VERANO2027', 4, 2, B),
        ...consultasDe('BORRADO2026', 9, 0, A),
      ]
    );

    expect(filas).toHaveLength(2);
    expect(filas.find((f) => f.tenantId === A)?.consultas).toBe(2);
    expect(filas.find((f) => f.tenantId === B)?.consultas).toBe(4);
  });

  it('un texto que no puede ser un código no suma a nadie', () => {
    const filas = contarConsultas(
      [{ tenantId: A, codigo: 'VERANO2027', activo: true }],
      [{ tenantId: A, codigo: 'AB', reservationId: null }]
    );
    expect(filas[0].consultas).toBe(0);
  });
});

describe('evaluarAlertasPromocion', () => {
  it('con menos muestra no avisa, ni siquiera con cero conversiones', () => {
    expect(evaluarAlertasPromocion([fila({ consultas: MINIMO_CONSULTAS_ALERTA - 1 })])).toEqual([]);
  });

  it('cero conversiones con muestra suficiente es «sin_conversion»', () => {
    const [alerta] = evaluarAlertasPromocion([fila({ consultas: 34 })]);
    expect(alerta.motivo).toBe('sin_conversion');
    expect(alerta.conversionPct).toBe(0);
    expect(alerta.consultasSinReserva).toBe(34);
    expect(alerta.mensaje).toBe('Nadie reservó tras aplicarlo en 34 consultas.');
  });

  it('una conversión perdida entre muchas es «conversion_baja», con el porcentaje', () => {
    const [alerta] = evaluarAlertasPromocion([fila({ consultas: 40, consultasConvertidas: 1 })]);
    expect(alerta.motivo).toBe('conversion_baja');
    expect(alerta.conversionPct).toBe(2.5);
    expect(alerta.mensaje).toBe('Solo 1 de 40 consultas acabaron en reserva (2.5 %).');
  });

  it('justo en el umbral no se avisa: el aviso es para lo que claramente no funciona', () => {
    // 20 consultas y 1 reserva = 5 %.
    expect(
      evaluarAlertasPromocion([fila({ consultas: 20, consultasConvertidas: 1 })])
    ).toEqual([]);
    expect(CONVERSION_MINIMA_PCT).toBe(5);
  });

  it('un código inactivo no genera ruido: no hay nada que apagar', () => {
    expect(
      evaluarAlertasPromocion([fila({ activo: false, consultas: 500 })])
    ).toEqual([]);
  });

  it('ordena por consultas: lo que más se prueba es lo primero que hay que mirar', () => {
    const alertas = evaluarAlertasPromocion([
      fila({ codigo: 'POCO', consultas: 22 }),
      fila({ codigo: 'MUCHO', consultas: 99 }),
    ]);
    expect(alertas.map((a) => a.codigo)).toEqual(['MUCHO', 'POCO']);
  });

  it('los umbrales se pueden bajar para una cuenta concreta', () => {
    const alertas = evaluarAlertasPromocion(
      [fila({ consultas: 4, consultasConvertidas: 0 })],
      { minimoConsultas: 3, conversionMinimaPct: 10 }
    );
    expect(alertas).toHaveLength(1);
  });
});

describe('decidirAvisoPromos', () => {
  it('sin alertas no hay nada que decir', () => {
    expect(
      decidirAvisoPromos({ alertas: [], ultimoAviso: null, ahora: AHORA })
    ).toEqual({ avisar: false, motivo: 'sin_alertas' });
  });

  it('la primera vez avisa', () => {
    expect(
      decidirAvisoPromos({ alertas: [alerta()], ultimoAviso: null, ahora: AHORA })
    ).toEqual({ avisar: true, motivo: 'primer_aviso' });
  });

  it('el mismo aviso no se repite antes del intervalo', () => {
    expect(
      decidirAvisoPromos({
        alertas: [alerta()],
        ultimoAviso: fecha(1),
        codigosAvisados: ['VERANO2027'],
        ahora: AHORA,
      })
    ).toEqual({ avisar: false, motivo: 'aviso_reciente' });
  });

  it('pasado el intervalo vuelve a avisar aunque sean los mismos códigos', () => {
    expect(
      decidirAvisoPromos({
        alertas: [alerta()],
        ultimoAviso: new Date(AHORA.getTime() - INTERVALO_ALERTA_MS),
        codigosAvisados: ['VERANO2027'],
        ahora: AHORA,
      })
    ).toEqual({ avisar: true, motivo: 'intervalo' });
  });

  it('un código nuevo se avisa ya, sin esperar al intervalo', () => {
    expect(
      decidirAvisoPromos({
        alertas: [alerta(), alerta({ codigo: 'NUEVO2027', consultas: 25 })],
        ultimoAviso: fecha(1),
        codigosAvisados: ['VERANO2027'],
        ahora: AHORA,
      })
    ).toEqual({ avisar: true, motivo: 'codigo_nuevo' });
  });
});

describe('construirAvisoPromos', () => {
  it('compone el asunto, los números y la acción', () => {
    const { title, body } = construirAvisoPromos([alerta()], {
      enlace: 'https://hotel.test/dashboard/hospitality/booking-engine',
    });

    expect(title).toBe('1 código(s) promocional(es) no convierten');
    expect(body).toContain('VERANO2027: Nadie reservó tras aplicarlo en 20 consultas.');
    expect(body).toContain('https://hotel.test/dashboard/hospitality/booking-engine');
    expect(body).toContain('apágalos o reescribe su mensaje');
  });

  it('no deja crecer el cuerpo sin límite: detalla cinco y cuenta el resto', () => {
    const alertas = Array.from({ length: MAX_CODIGOS_EN_AVISO + 2 }, (_, i) =>
      alerta({ codigo: `CODIGO${i}`, consultas: 20 + i })
    );
    const { body } = construirAvisoPromos(alertas);

    expect(body).toContain(`CODIGO${MAX_CODIGOS_EN_AVISO - 1}:`);
    expect(body).not.toContain(`CODIGO${MAX_CODIGOS_EN_AVISO}:`);
    expect(body).toContain('… y 2 más.');
  });
});

describe('codigosDeMarca', () => {
  it('lee los códigos del aviso anterior tal como se guardaron', () => {
    expect(codigosDeMarca({ codigos: ['verano2027', ' OTRO '] })).toEqual([
      'VERANO2027',
      'OTRO',
    ]);
  });

  it('una marca ilegible no silencia el aviso para siempre', () => {
    expect(codigosDeMarca(null)).toEqual([]);
    expect(codigosDeMarca({ codigos: 'VERANO2027' })).toEqual([]);
  });
});

describe('desdeVentanaAlertas', () => {
  it('mira los últimos 90 días de REGISTRO, no de estancia', () => {
    expect(desdeVentanaAlertas(AHORA).toISOString()).toBe(fecha(90).toISOString());
  });
});

describe('runHospitalityPromosAlertasScan', () => {
  it('sin códigos activos no avisa y no deja marca', async () => {
    const res = await runHospitalityPromosAlertasScan(AHORA);

    expect(res.success).toBe(true);
    expect(res.message).toContain('Sin códigos promocionales activos');
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
    expect(mocks.hospitalitySyncLog.create).not.toHaveBeenCalled();
  });

  it('un código por debajo del umbral tampoco se avisa', async () => {
    mocks.hospitalityPromoCode.findMany.mockResolvedValue([
      { tenantId: A, codigo: 'VERANO2027', activo: true },
    ]);
    mocks.hospitalityPromoConsulta.findMany.mockResolvedValue(
      consultasDe('VERANO2027', 5, 0)
    );

    const res = await runHospitalityPromosAlertasScan(AHORA);

    expect(res.codigosAlertados).toBe(0);
    expect(res.message).toContain('Sin códigos que avisar');
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });

  it('lee las consultas aplicadas por fecha de registro y avisa al equipo', async () => {
    mocks.hospitalityPromoCode.findMany.mockResolvedValue([
      { tenantId: A, codigo: 'VERANO2027', activo: true },
    ]);
    mocks.hospitalityPromoConsulta.findMany.mockResolvedValue(
      consultasDe('VERANO2027', 30, 0)
    );

    const res = await runHospitalityPromosAlertasScan(AHORA);

    const args = mocks.hospitalityPromoConsulta.findMany.mock.calls[0][0];
    expect(args.where.resultado).toBe('aplicada');
    expect(args.where.fecha.gte).toEqual(fecha(90));
    expect(args.select).toEqual({ tenantId: true, codigo: true, reservationId: true });

    expect(res.tenantsAvisados).toBe(1);
    expect(res.codigosAlertados).toBe(1);
    expect(mocks.sendPushNotification).toHaveBeenCalledTimes(1);
    const push = mocks.sendPushNotification.mock.calls[0][1];
    expect(push.title).toContain('1 código(s)');
    expect(push.body).toContain('VERANO2027');
    expect(push.url).toBe('/dashboard/hospitality/booking-engine');
    expect(push.tag).toBe('promos');

    const marca = mocks.hospitalitySyncLog.create.mock.calls[0][0].data;
    expect(marca.tipo).toBe(TIPO_AVISO_PROMOS);
    expect(marca.estado).toBe('exito');
    expect(marca.responseBody.codigos).toEqual(['VERANO2027']);
    expect(marca.responseBody.destinatarios).toBe(1);
    expect(res.avisos[0]).toContain('Hotel Volcán');
  });

  it('un aviso reciente con los mismos códigos se calla', async () => {
    mocks.hospitalityPromoCode.findMany.mockResolvedValue([
      { tenantId: A, codigo: 'VERANO2027', activo: true },
    ]);
    mocks.hospitalityPromoConsulta.findMany.mockResolvedValue(
      consultasDe('VERANO2027', 30, 0)
    );
    mocks.hospitalitySyncLog.findFirst.mockResolvedValue({
      fechaCreacion: fecha(1),
      responseBody: { codigos: ['VERANO2027'] },
    });

    const res = await runHospitalityPromosAlertasScan(AHORA);

    expect(res.tenantsEnEspera).toBe(1);
    expect(res.tenantsAvisados).toBe(0);
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
    expect(mocks.hospitalitySyncLog.create).not.toHaveBeenCalled();
  });

  it('un código nuevo se avisa aunque el anterior sea de ayer', async () => {
    mocks.hospitalityPromoCode.findMany.mockResolvedValue([
      { tenantId: A, codigo: 'VERANO2027', activo: true },
      { tenantId: A, codigo: 'NUEVO2027', activo: true },
    ]);
    mocks.hospitalityPromoConsulta.findMany.mockResolvedValue([
      ...consultasDe('VERANO2027', 30, 0),
      ...consultasDe('NUEVO2027', 25, 0),
    ]);
    mocks.hospitalitySyncLog.findFirst.mockResolvedValue({
      fechaCreacion: fecha(1),
      responseBody: { codigos: ['VERANO2027'] },
    });

    const res = await runHospitalityPromosAlertasScan(AHORA);

    expect(res.tenantsAvisados).toBe(1);
    expect(mocks.hospitalitySyncLog.create.mock.calls[0][0].data.responseBody.motivo).toBe(
      'codigo_nuevo'
    );
    expect(mocks.hospitalitySyncLog.create.mock.calls[0][0].data.responseBody.codigos).toEqual([
      'VERANO2027',
      'NUEVO2027',
    ]);
  });

  it('sin destinatarios con permiso no se pierde el rastro: queda pendiente y se avisa en el panel', async () => {
    mocks.hospitalityPromoCode.findMany.mockResolvedValue([
      { tenantId: A, codigo: 'VERANO2027', activo: true },
    ]);
    mocks.hospitalityPromoConsulta.findMany.mockResolvedValue(
      consultasDe('VERANO2027', 30, 0)
    );
    mocks.user.findMany.mockResolvedValue([
      { id: 'user_limpieza', role: { nombre: 'Limpieza', permisos: { hospitality_operaciones: { ver: true } } } },
    ]);

    const res = await runHospitalityPromosAlertasScan(AHORA);

    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
    expect(mocks.hospitalitySyncLog.create.mock.calls[0][0].data.estado).toBe('pendiente');
    expect(res.avisos.some((a) => a.includes('nadie del equipo puede editarlos'))).toBe(true);
  });

  it('un hotel que falla no silencia a los demás', async () => {
    mocks.hospitalityPromoCode.findMany.mockResolvedValue([
      { tenantId: A, codigo: 'VERANO2027', activo: true },
      { tenantId: B, codigo: 'OTRA2027', activo: true },
    ]);
    mocks.hospitalityPromoConsulta.findMany.mockResolvedValue([
      ...consultasDe('VERANO2027', 30, 0, A),
      ...consultasDe('OTRA2027', 40, 0, B),
    ]);
    mocks.hospitalitySyncLog.findFirst.mockImplementation(
      async ({ where }: { where: { tenantId: string } }) => {
        if (where.tenantId === A) throw new Error('base caída');
        return null;
      }
    );

    const res = await runHospitalityPromosAlertasScan(AHORA);

    expect(res.tenantsAvisados).toBe(1);
    expect(res.errores[0]).toContain(A);
    expect(mocks.hospitalitySyncLog.create.mock.calls[0][0].data.tenantId).toBe(B);
  });

  it('si la lectura falla, lo dice y no inventa avisos', async () => {
    mocks.hospitalityPromoCode.findMany.mockRejectedValue(new Error('sin conexión'));

    const res = await runHospitalityPromosAlertasScan(AHORA);

    expect(res.success).toBe(false);
    expect(res.error).toContain('sin conexión');
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
  });
});

describe('GET /api/cron/hospitality-promos-alertas', () => {
  function peticion(headers: Record<string, string> = {}) {
    return new NextRequest(URL_CRON, { headers });
  }

  it('una corrida en verde responde 200 y deja los avisos en el panel', async () => {
    mocks.hospitalityPromoCode.findMany.mockResolvedValue([
      { tenantId: A, codigo: 'VERANO2027', activo: true },
    ]);
    mocks.hospitalityPromoConsulta.findMany.mockResolvedValue(
      consultasDe('VERANO2027', 30, 0)
    );

    const res = await GET(peticion());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.tenantsAvisados).toBe(1);

    const panel = getCronStatus(JOB_ID_PROMOS_ALERTAS);
    expect(panel?.lastResult).toBe('success');
    expect(panel?.label).toBe(JOB_LABEL_PROMOS_ALERTAS);
    expect(panel?.schedule).toBe(JOB_SCHEDULE_PROMOS_ALERTAS);
    expect(panel?.lastAvisos.join(' ')).toContain('VERANO2027');
  });

  it('si la lectura falla responde 500 y el panel lo marca en rojo', async () => {
    mocks.hospitalityPromoCode.findMany.mockRejectedValue(new Error('sin conexión'));

    const res = await GET(peticion());
    const panel = getCronStatus(JOB_ID_PROMOS_ALERTAS);

    expect(res.status).toBe(500);
    expect(panel?.lastResult).toBe('error');
    expect(panel?.lastMessage).toBe('sin conexión');
  });

  it('en producción exige CRON_SECRET', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_SECRET', 'secreto');

    expect((await GET(peticion())).status).toBe(401);
    expect((await GET(peticion({ authorization: 'Bearer otro' }))).status).toBe(401);

    const conCabecera = await GET(peticion({ authorization: 'Bearer secreto' }));
    expect(conCabecera.status).toBe(200);
  });

  it('el scheduler registra el MISMO job, por las constantes del módulo', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'lib/cron/scheduler.ts'), 'utf8');

    expect(fuente).toContain('JOB_ID_PROMOS_ALERTAS');
    expect(fuente).toContain('JOB_LABEL_PROMOS_ALERTAS');
    expect(fuente).toContain('JOB_SCHEDULE_PROMOS_ALERTAS');
    expect(fuente).toContain('runHospitalityPromosAlertasScan');
  });
});
