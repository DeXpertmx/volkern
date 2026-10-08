// @vitest-environment node
//
// Aviso al operador por cuentas de Hospitality con la puesta en marcha parada.
//
// Lo que se vigila: que salga un solo correo (no uno por cliente), que no se
// repita el mismo aviso cada día, que no se envíe nada cuando no hay nada que
// contar, que los días se cuenten desde la última señal de Hospitality —y no
// desde el alta del cliente— y que la ejecución quede en el panel de estado con
// el mismo id/etiqueta/cadencia que registra el scheduler.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  scan: vi.fn(),
  real: undefined as unknown as (...args: unknown[]) => Promise<unknown>,
}));

const mocks = vi.hoisted(() => ({
  tenant: { findMany: vi.fn() },
  role: { findMany: vi.fn() },
  hospitalityProperty: { findMany: vi.fn() },
  tenantFeature: { findMany: vi.fn() },
  hospitalitySyncLog: { findFirst: vi.fn(), create: vi.fn() },
  avisarOperador: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: mocks,
  default: mocks,
}));

vi.mock('@/lib/notifications/aviso-operador', () => ({
  avisarOperador: mocks.avisarOperador,
  hayCanalExterno: () => true,
  appriseDeOperador: () => undefined,
}));

vi.mock('@/lib/cron/hospitality-puesta-en-marcha-avisos', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../lib/cron/hospitality-puesta-en-marcha-avisos')
  >();
  h.real = actual.runHospitalityPuestaEnMarchaAvisosScan as never;
  return {
    ...actual,
    runHospitalityPuestaEnMarchaAvisosScan: (...args: unknown[]) => h.scan(...args),
  };
});

import {
  DIAS_ESPERA_POR_DEFECTO,
  JOB_ID_PUESTA_EN_MARCHA_AVISOS,
  JOB_LABEL_PUESTA_EN_MARCHA_AVISOS,
  JOB_SCHEDULE_PUESTA_EN_MARCHA_AVISOS,
  TIPO_AVISO_PUESTA_EN_MARCHA,
  construirAviso,
  decidirAviso,
  diasSinAvanzar,
  type CuentaAvisada,
  type HospitalityPuestaEnMarchaAvisosResult,
} from '@/lib/cron/hospitality-puesta-en-marcha-avisos';
import type { PuestaEnMarchaFila } from '@/lib/provisioning/hospitality-alta';
import { GET } from '@/app/api/cron/hospitality-puesta-en-marcha-avisos/route';
import { getCronStatus } from '@/lib/cron/cron-status';
import { ROLES_HOSPITALITY, permisosDeRol } from '@/lib/hospitality/roles';

const RAIZ = path.resolve(__dirname, '..');
const URL_CRON = 'http://localhost:3098/api/cron/hospitality-puesta-en-marcha-avisos';

const AHORA = new Date('2026-10-08T09:20:00.000Z');
const dia = 24 * 60 * 60 * 1000;
const fecha = (haceDias: number) => new Date(AHORA.getTime() - haceDias * dia);

const A = { id: 'tenant_a', nombre: 'Hotel Volcán' };
const B = { id: 'tenant_b', nombre: 'Casa del Mar' };

function tenantFila(t: { id: string; nombre: string }, altaHaceDias = 30) {
  return { ...t, plan: 'profesional', fechaCreacion: fecha(altaHaceDias) };
}

function propiedadDe(tenantId: string, haceDias: number, unidades = 1) {
  return {
    tenantId,
    id: `prop_${tenantId}`,
    nombre: 'Loft',
    ciudad: null,
    pais: null,
    estado: 'activa',
    fechaCreacion: fecha(haceDias),
    _count: { units: unidades },
  };
}

function rolDe(tenantId: string, nombre: string, haceDias: number) {
  const def = ROLES_HOSPITALITY.find((r) => r.nombre === nombre)!;
  return {
    tenantId,
    nombre,
    permisos: permisosDeRol(def.id),
    fechaCreacion: fecha(haceDias),
  };
}

function salidaAviso(overrides: Record<string, unknown> = {}) {
  return {
    consola: true as const,
    apprise: 'sin_configurar' as const,
    resend: 'enviado' as const,
    errores: [],
    ...overrides,
  };
}

/**
 * El barrido real (el mock solo sustituye la función para la ruta, así que aquí
 * se llama a la de verdad, con la base simulada).
 */
async function correr(): Promise<HospitalityPuestaEnMarchaAvisosResult> {
  return (await h.real(AHORA)) as HospitalityPuestaEnMarchaAvisosResult;
}

function filaBase(overrides: Partial<PuestaEnMarchaFila> = {}): PuestaEnMarchaFila {
  return {
    tenantId: A.id,
    tenant: A.nombre,
    plan: 'profesional',
    desde: fecha(30).toISOString(),
    senal: fecha(5).toISOString(),
    moduloApagado: false,
    roles: { catalogo: 5, alDia: 0, pendientes: ['Anfitrión'] },
    propiedades: { total: 1, unidades: 1, primera: { id: 'prop_a', nombre: 'Loft' } },
    enlaceWizard: '/dashboard/hospitality/onboarding?propertyId=prop_a',
    faltantes: ['5 de 5 roles por preparar: Anfitrión'],
    listo: false,
    ...overrides,
  };
}

function cuenta(motivo: 'parada' | 'modulo_apagado', overrides: Partial<PuestaEnMarchaFila> = {}): CuentaAvisada {
  return { fila: filaBase(overrides), motivo, diasParada: 5 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenant.findMany.mockResolvedValue([]);
  mocks.role.findMany.mockResolvedValue([]);
  mocks.hospitalityProperty.findMany.mockResolvedValue([]);
  mocks.tenantFeature.findMany.mockResolvedValue([]);
  mocks.hospitalitySyncLog.findFirst.mockResolvedValue(null);
  mocks.hospitalitySyncLog.create.mockResolvedValue({});
  mocks.avisarOperador.mockResolvedValue(salidaAviso());
  h.scan.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('diasSinAvanzar', () => {
  it('cuenta días completos y nunca devuelve negativo', () => {
    expect(diasSinAvanzar(fecha(5), AHORA)).toBe(5);
    expect(diasSinAvanzar(new Date(AHORA.getTime() + dia), AHORA)).toBe(0);
    expect(diasSinAvanzar('no es una fecha', AHORA)).toBe(0);
  });
});

describe('decidirAviso', () => {
  const base = { listo: false, moduloApagado: false, diasParada: 5, ultimoAviso: null, ahora: AHORA };

  it('lo que ya está listo no genera aviso, por muchos días que tenga', () => {
    expect(decidirAviso({ ...base, listo: true, diasParada: 40 }).motivo).toBe('listo');
  });

  it('una cuenta parada más días de los permitidos avisa', () => {
    expect(decidirAviso(base)).toEqual({ avisar: true, motivo: 'parada' });
  });

  it('recién parada todavía no: el aviso no es un cronómetro de minutos', () => {
    expect(decidirAviso({ ...base, diasParada: DIAS_ESPERA_POR_DEFECTO - 1 })).toEqual({
      avisar: false,
      motivo: 'aun_es_pronto',
    });
  });

  it('el mismo cliente no se repite antes del intervalo', () => {
    const ultimoAviso = new Date(AHORA.getTime() - 1 * dia);
    expect(decidirAviso({ ...base, ultimoAviso })).toEqual({
      avisar: false,
      motivo: 'aviso_reciente',
    });
  });

  it('pasado el intervalo vuelve a avisar aunque siga parada', () => {
    const ultimoAviso = new Date(AHORA.getTime() - 4 * dia);
    expect(decidirAviso({ ...base, ultimoAviso }).avisar).toBe(true);
  });

  it('el módulo apagado con datos dentro es una avería: avisa sin esperar días', () => {
    expect(
      decidirAviso({ ...base, moduloApagado: true, diasParada: 0 })
    ).toEqual({ avisar: true, motivo: 'modulo_apagado' });
  });

  it('pero tampoco repite la avería todos los días', () => {
    const ultimoAviso = new Date(AHORA.getTime() - 1 * dia);
    expect(decidirAviso({ ...base, moduloApagado: true, diasParada: 0, ultimoAviso }).avisar).toBe(
      false
    );
  });
});

describe('construirAviso', () => {
  it('separa las dos clases y cuenta lo que falta de cada una', () => {
    const { title, body } = construirAviso(
      [cuenta('parada')],
      [cuenta('modulo_apagado', { tenantId: B.id, tenant: B.nombre })],
      AHORA
    );

    expect(title).toBe('Hospitality: 2 cuenta(s) esperan al operador');
    expect(body).toContain('PARADAS (1)');
    expect(body).toContain('Hotel Volcán: 5 día(s) sin avanzar');
    expect(body).toContain('Falta: 5 de 5 roles por preparar: Anfitrión');
    expect(body).toContain('MÓDULO APAGADO CON DATOS DENTRO (1)');
    expect(body).toContain('Casa del Mar: el módulo está APAGADO');
    expect(body).toContain('/admin/hospitality');
  });

  it('no deja crecer el correo sin límite: detalla 20 y cuenta el resto', () => {
    const paradas = Array.from({ length: 21 }, (_, i) =>
      cuenta('parada', { tenantId: `t${i}`, tenant: `Cliente ${i}` })
    );

    const { body } = construirAviso(paradas, [], AHORA);

    expect(body).toContain('Cliente 19');
    expect(body).not.toContain('Cliente 20:');
    expect(body).toContain('… y 1 más.');
  });
});

describe('runHospitalityPuestaEnMarchaAvisosScan', () => {
  it('sin clientes de Hospitality no avisa y no deja ni una marca', async () => {
    const res = await correr();

    expect(res.success).toBe(true);
    expect(res.avisados).toBe(0);
    expect(res.message).toContain('Sin cuentas de Hospitality a medias');
    expect(mocks.avisarOperador).not.toHaveBeenCalled();
    expect(mocks.hospitalitySyncLog.create).not.toHaveBeenCalled();
  });

  it('una cuenta parada produce UN aviso con su marca y sus avisos para el panel', async () => {
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A)]);
    mocks.hospitalityProperty.findMany.mockResolvedValue([propiedadDe(A.id, 5, 2)]);

    const res = await correr();

    expect(mocks.avisarOperador).toHaveBeenCalledTimes(1);
    const aviso = mocks.avisarOperador.mock.calls[0][0];
    expect(aviso.title).toContain('1 cuenta(s)');
    expect(aviso.body).toContain('Hotel Volcán: 5 día(s) sin avanzar');

    expect(res.avisados).toBe(1);
    expect(res.paradas).toBe(1);
    expect(res.avisos[0]).toContain('Hotel Volcán');
    expect(mocks.hospitalitySyncLog.create).toHaveBeenCalledTimes(1);
    const marca = mocks.hospitalitySyncLog.create.mock.calls[0][0].data;
    expect(marca.tenantId).toBe(A.id);
    expect(marca.tipo).toBe(TIPO_AVISO_PUESTA_EN_MARCHA);
    expect(marca.operacion).toBe('manual');
    expect(marca.estado).toBe('exito');
  });

  it('los días se cuentan desde la última señal, no desde el alta del cliente', async () => {
    // Cliente de hace 200 días al que se le encendió Hospitality hace 1 día:
    // su señal es de ayer, así que todavía no toca avisar.
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A, 200)]);
    mocks.hospitalityProperty.findMany.mockResolvedValue([propiedadDe(A.id, 1)]);

    const res = await correr();

    expect(mocks.avisarOperador).not.toHaveBeenCalled();
    expect(res.aunEspronto).toBe(1);
    expect(res.avisos).toEqual([]);
  });

  it('una cuenta al día no entra en el aviso', async () => {
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A)]);
    mocks.role.findMany.mockResolvedValue(
      ROLES_HOSPITALITY.map((r) => rolDe(A.id, r.nombre, 40))
    );
    mocks.hospitalityProperty.findMany.mockResolvedValue([propiedadDe(A.id, 40)]);

    const res = await correr();

    expect(res.message).toContain('al día');
    expect(mocks.avisarOperador).not.toHaveBeenCalled();
  });

  it('un aviso reciente silencia al mismo cliente sin enviar nada', async () => {
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A)]);
    mocks.hospitalityProperty.findMany.mockResolvedValue([propiedadDe(A.id, 5)]);
    mocks.hospitalitySyncLog.findFirst.mockResolvedValue({ fechaCreacion: fecha(1) });

    const res = await correr();

    expect(res.enEspera).toBe(1);
    expect(res.avisados).toBe(0);
    expect(mocks.avisarOperador).not.toHaveBeenCalled();
    expect(mocks.hospitalitySyncLog.create).not.toHaveBeenCalled();
  });

  it('el módulo apagado con datos dentro avisa aunque acabe de pasar', async () => {
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A)]);
    mocks.hospitalityProperty.findMany.mockResolvedValue([propiedadDe(A.id, 0, 4)]);
    mocks.tenantFeature.findMany.mockResolvedValue([{ tenantId: A.id, habilitado: false }]);

    const res = await correr();

    expect(res.avisados).toBe(1);
    expect(res.avisos[0]).toContain('módulo apagado');
    const aviso = mocks.avisarOperador.mock.calls[0][0];
    expect(aviso.body).toContain('MÓDULO APAGADO CON DATOS DENTRO (1)');
  });

  it('un cliente que falla no silencia a los demás', async () => {
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A), tenantFila(B)]);
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      propiedadDe(A.id, 5),
      propiedadDe(B.id, 6),
    ]);
    mocks.hospitalitySyncLog.findFirst.mockImplementation(async ({ where }: { where: { tenantId: string } }) => {
      if (where.tenantId === A.id) throw new Error('base caída');
      return null;
    });

    const res = await correr();

    expect(res.avisados).toBe(1);
    expect(res.errores[0]).toContain(A.id);
    expect(mocks.avisarOperador).toHaveBeenCalledTimes(1);
    expect(mocks.avisarOperador.mock.calls[0][0].body).toContain(B.nombre);
  });

  it('si el aviso no sale por ningún canal, lo dice y lo deja en el panel', async () => {
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A)]);
    mocks.hospitalityProperty.findMany.mockResolvedValue([propiedadDe(A.id, 5)]);
    mocks.avisarOperador.mockResolvedValue(
      salidaAviso({ resend: 'sin_configurar', apprise: 'sin_configurar' })
    );

    const res = await correr();

    expect(res.avisos.some((a) => a.includes('no salió por ningún canal'))).toBe(true);
    // La marca queda como pendiente: el aviso se intentó y no llegó a nadie.
    expect(mocks.hospitalitySyncLog.create.mock.calls[0][0].data.estado).toBe('pendiente');
  });

  it('si el listado falla, lo dice y no inventa cuentas', async () => {
    mocks.tenant.findMany.mockRejectedValue(new Error('sin conexión'));

    const res = await correr();

    expect(res.success).toBe(false);
    expect(res.error).toContain('sin conexión');
    expect(mocks.avisarOperador).not.toHaveBeenCalled();
  });
});

describe('GET /api/cron/hospitality-puesta-en-marcha-avisos', () => {
  function peticion(headers: Record<string, string> = {}) {
    return new NextRequest(URL_CRON, { headers });
  }

  it('una corrida en verde responde 200 y se registra en el panel, con avisos', async () => {
    h.scan.mockResolvedValue({
      success: true,
      message: 'Aviso enviado por 1 cuenta(s)',
      avisados: 1,
      avisos: ['1 cuenta(s) paradas: Hotel Volcán'],
    });

    const res = await GET(peticion());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toContain('Aviso enviado');
    const panel = getCronStatus(JOB_ID_PUESTA_EN_MARCHA_AVISOS);
    expect(panel?.lastResult).toBe('success');
    expect(panel?.lastAvisos).toEqual(['1 cuenta(s) paradas: Hotel Volcán']);
    // Etiqueta y cadencia son las del módulo: el panel las pinta tal cual.
    expect(panel?.label).toBe(JOB_LABEL_PUESTA_EN_MARCHA_AVISOS);
    expect(panel?.schedule).toBe(JOB_SCHEDULE_PUESTA_EN_MARCHA_AVISOS);
  });

  it('si la lectura falla responde 500 y el panel lo marca en rojo', async () => {
    h.scan.mockResolvedValue({ success: false, error: 'sin conexión', avisos: [] });

    const res = await GET(peticion());
    const panel = getCronStatus(JOB_ID_PUESTA_EN_MARCHA_AVISOS);

    expect(res.status).toBe(500);
    expect(panel?.lastResult).toBe('error');
    expect(panel?.lastMessage).toBe('sin conexión');
  });

  it('en producción exige CRON_SECRET', async () => {
    h.scan.mockResolvedValue({ success: true, message: 'ok', avisos: [] });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_SECRET', 'secreto');

    const sinCabecera = await GET(peticion());
    expect(sinCabecera.status).toBe(401);
    // Un secreto equivocado tampoco pasa.
    const malaCabecera = await GET(peticion({ authorization: 'Bearer otro' }));
    expect(malaCabecera.status).toBe(401);
    expect(h.scan).not.toHaveBeenCalled();

    const conCabecera = await GET(peticion({ authorization: 'Bearer secreto' }));
    expect(conCabecera.status).toBe(200);
    expect(h.scan).toHaveBeenCalledTimes(1);
  });

  it('el scheduler registra el MISMO job, por las constantes del módulo', () => {
    // Si alguien renombra el job en un sitio y no en el otro, el panel de
    // /admin/hospitality dejaría de verlo: este test lo reprocha. Aquí la
    // coherencia se comprueba por las constantes (el scheduler las importa) y no
    // por literales, que es la forma más difícil de desincronizar.
    const fuente = fs.readFileSync(path.join(RAIZ, 'lib/cron/scheduler.ts'), 'utf8');

    expect(fuente).toContain('JOB_ID_PUESTA_EN_MARCHA_AVISOS');
    expect(fuente).toContain('JOB_LABEL_PUESTA_EN_MARCHA_AVISOS');
    expect(fuente).toContain('JOB_SCHEDULE_PUESTA_EN_MARCHA_AVISOS');
    // Y lo ejecuta por su función de barrido, no reimplementando nada.
    expect(fuente).toContain('runHospitalityPuestaEnMarchaAvisosScan');
  });
});
