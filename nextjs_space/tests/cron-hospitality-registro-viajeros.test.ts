// @vitest-environment node
//
// Guardia del barrido `hospitality_registro_viajeros`
// (lib/cron/hospitality-registro-viajeros.ts), que cumple el plazo de 24 h del
// RD 933/2021 sin depender de nadie:
//  1. Envía el parte de las reservas cuyo servicio ya empezó y no tienen
//     comunicación aceptada (ni un no-show ni una cancelada: nunca entraron).
//  2. Consulta los lotes (el alta es asíncrona) y anula los de canceladas.
//  3. No reintenta a ciegas: espacia los reintentos y los abandona tras un
//     máximo de intentos, para no martillear el servicio del Ministerio.
//  4. Un fallo en una reserva no detiene el barrido.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const __mockPrisma = vi.hoisted(() => ({
  hospitalityMirConfig: { findMany: vi.fn(), findUnique: vi.fn() },
  hospitalityReservation: { findMany: vi.fn() },
  hospitalityGuestRegistryCommunication: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  tenant: { findMany: vi.fn() },
}));

const __mockEnviar = vi.hoisted(() => vi.fn());
const __mockConsultar = vi.hoisted(() => vi.fn());
const __mockAnular = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ prisma: __mockPrisma }));
vi.mock('@/lib/hospitality/registro-viajeros-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/hospitality/registro-viajeros-service')>();
  return {
    ...actual,
    enviarRegistroDeReserva: (...a: unknown[]) => __mockEnviar(...a),
    consultarLotesPendientes: (...a: unknown[]) => __mockConsultar(...a),
    anularComunicacion: (...a: unknown[]) => __mockAnular(...a),
  };
});

import {
  type ResultadoBarridoRegistroViajeros,
  MAX_REINTENTOS,
  avisosDelBarrido,
  resumenDelBarrido,
  runRegistroViajerosScan,
} from '../lib/cron/hospitality-registro-viajeros';
import { MAX_INTENTOS_PARTE, esperaReintentoMs } from '../lib/hospitality/parte-rechazo';
import { ESTADO_REGISTRO, VENTANA_LOTE_MS } from '../lib/hospitality/registro-viajeros-service';
import {
  ESTADOS_ACTIVOS_REGISTRO,
  TIPO_COMUNICACION,
  TIPO_OPERACION,
} from '../lib/hospitality/registro-viajeros';

/** Un resultado de barrido sin nada dentro, para probar los textos del panel. */
function resultadoVacio(): ResultadoBarridoRegistroViajeros {
  return {
    tenants: 1,
    candidatas: 0,
    enviadas: 0,
    aceptadasAlConsultar: 0,
    rechazadas: 0,
    datosIncompletos: 0,
    anuladas: 0,
    reservasEnviadas: 0,
    reservasPendienteXsd: 0,
    abandonados: 0,
    abandonadosPorTenant: [],
    errores: 0,
  };
}

describe('Barrido del registro de viajeros', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __mockPrisma.hospitalityMirConfig.findMany.mockResolvedValue([
      { tenantId: 'tenant-1', usuarioEnc: 'u', passwordEnc: 'p' },
      { tenantId: 'tenant-2', usuarioEnc: null, passwordEnc: null }, // sin credenciales: se ignora
    ]);
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([]);
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([]);
    __mockPrisma.tenant.findMany.mockResolvedValue([{ id: 'tenant-1', nombre: 'Hotel Uno' }]);
    __mockEnviar.mockResolvedValue({ estado: ESTADO_REGISTRO.enviada, errores: [] });
    __mockConsultar.mockResolvedValue({ consultados: 0, aceptadas: 0, rechazadas: 0, enProceso: 0 });
    __mockAnular.mockResolvedValue({ ok: true, estado: ESTADO_REGISTRO.anulada });
  });

  it('sin tenants con credenciales no consulta nada', async () => {
    __mockPrisma.hospitalityMirConfig.findMany.mockResolvedValue([
      { tenantId: 'tenant-2', usuarioEnc: null, passwordEnc: null },
    ]);

    const resultado = await runRegistroViajerosScan(new Date('2026-09-20T12:00:00Z'));

    expect(resultado.tenants).toBe(0);
    expect(resultado.candidatas).toBe(0);
    expect(__mockPrisma.hospitalityReservation.findMany).not.toHaveBeenCalled();
    expect(__mockEnviar).not.toHaveBeenCalled();
  });

  it('solo comunica entradas reales y dentro de la ventana', async () => {
    await runRegistroViajerosScan(new Date('2026-09-20T12:00:00Z'));

    const where = __mockPrisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    // Un no-show o una cancelada nunca entraron al establecimiento.
    expect(where.estado.in).toEqual(['confirmed', 'checked_in', 'checked_out']);
    expect(where.estado.in).not.toContain('no_show');
    expect(where.estado.in).not.toContain('cancelled');
    // El servicio ya tiene que haber empezado: check-in alcanzado.
    expect(where.checkIn.lte).toBeInstanceOf(Date);
    expect(where.checkIn.gte).toBeInstanceOf(Date);

    // El filtro de comunicaciones evita reenviar lo aceptado y espacia reintentos.
    const claves = where.guestRegistryCommunications.none;
    expect(claves.tipoComunicacion).toBe(TIPO_COMUNICACION.parteViajeros);
    expect(claves.tipoOperacion).toBe(TIPO_OPERACION.alta);
    const condiciones = JSON.stringify(claves.OR);
    expect(condiciones).toContain(ESTADO_REGISTRO.aceptada);
    expect(condiciones).toContain(ESTADO_REGISTRO.datosIncompletos);
    expect(condiciones).toContain(ESTADO_REGISTRO.rechazada);
    expect(condiciones).toContain('intentos');
    expect(condiciones).toContain(String(MAX_REINTENTOS));
  });

  it('el tope de intentos es el mismo que enseña la pantalla de reservas', async () => {
    // El aviso «el barrido ya no lo reintenta solo» tiene que decir la verdad: si
    // el cron cambiara su tope sin cambiar el del módulo puro, la pantalla
    // estaría anunciando un abandono que no ocurre (o callando uno real).
    expect(MAX_REINTENTOS).toBe(MAX_INTENTOS_PARTE);
  });

  it('no reenvía lo que está EN VUELO: lo resuelve la consulta del lote', async () => {
    const ahora = new Date('2026-09-20T12:00:00Z');
    await runRegistroViajerosScan(ahora);

    const where = __mockPrisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    const condiciones = where.guestRegistryCommunications.none.OR as Array<Record<string, unknown>>;
    const enVuelo = condiciones.find((c) => c.estado === ESTADO_REGISTRO.enviada);

    // Reenviar un parte ya entregado crea una SEGUNDA comunicación del mismo
    // huésped en el Ministerio: la fila en vuelo lo excluye como candidata.
    expect(enVuelo).toBeTruthy();
    expect(enVuelo?.lote).toEqual({ not: null });

    // Y solo mientras no venza la ventana del lote: sin lote o vencida, el
    // parte vuelve a ser candidato (el plazo legal no admite esperar siempre).
    const vencimiento = (enVuelo?.fechaEnvio as { gte: Date }).gte;
    expect(vencimiento).toBeInstanceOf(Date);
    expect(ahora.getTime() - vencimiento.getTime()).toBe(VENTANA_LOTE_MS);

    // La MISMA ventana que usa el servicio: si una de las dos se cambia sola,
    // el barrido y `enVuelo()` dejarían de estar de acuerdo.
    const fuenteServicio = readFileSync(
      path.resolve(__dirname, '..', 'lib/hospitality/registro-viajeros-service.ts'),
      'utf8'
    );
    expect(fuenteServicio).toContain('VENTANA_LOTE_MS');
    expect(fuenteServicio).toContain('export function enVuelo(');
  });

  it('el reintento espera CRECIENDO (backoff), no una hora fija', async () => {
    const ahora = new Date('2026-09-20T12:00:00Z');
    await runRegistroViajerosScan(ahora);

    const where = __mockPrisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    const condiciones = where.guestRegistryCommunications.none.OR as Array<
      Record<string, unknown>
    >;
    const espaciado = condiciones.find((c) => Array.isArray(c.OR)) as {
      OR: Array<{ intentos: unknown; fechaEdicion: { gt: Date } }>;
    };
    expect(espaciado).toBeTruthy();

    // Cada peldaño perdon los intentos ya gastados con SU espera: 1h tras el
    // primero, 2h tras el segundo, 4h, 8h, 16h (el tope del peldaño).
    const esperas = espaciado.OR.map((rama) => ahora.getTime() - rama.fechaEdicion.gt.getTime());
    expect(esperas[0]).toBe(esperaReintentoMs(1));
    expect(esperas[1]).toBe(esperaReintentoMs(2));
    expect(esperas[2]).toBe(esperaReintentoMs(3));
    expect(esperas[3]).toBe(esperaReintentoMs(4));
    expect(esperas[4]).toBe(esperaReintentoMs(5));
    // La propiedad que justifica el cambio: estrictamente crecientes.
    expect(esperas[0]).toBeLessThan(esperas[1]);
    expect(esperas[1]).toBeLessThan(esperas[2]);
    expect(esperas[2]).toBeLessThan(esperas[3]);
    expect(esperas[3]).toBeLessThan(esperas[4]);
  });

  it('los límites del cron salen de la MISMA regla que la del módulo puro', () => {
    // Si el cron calcula sus fechas con otra fórmula, la pantalla (que usa la
    // función pura) y el barrido discutirían de cuándo toca reintentar.
    const fuenteCron = readFileSync(
      path.resolve(__dirname, '..', 'lib/cron/hospitality-registro-viajeros.ts'),
      'utf8'
    );
    expect(fuenteCron).toContain('esperaReintentoMs(');
    expect(fuenteCron).not.toContain('ESPERA_REINTENTO_MS');
  });

  it('envía cada candidata y cuenta por resultado', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([
      { id: 'res-1', tenantId: 'tenant-1' },
      { id: 'res-2', tenantId: 'tenant-1' },
      { id: 'res-3', tenantId: 'tenant-1' },
    ]);
    __mockEnviar
      .mockResolvedValueOnce({ estado: ESTADO_REGISTRO.enviada, errores: [] })
      .mockResolvedValueOnce({ estado: ESTADO_REGISTRO.datosIncompletos, errores: [] })
      .mockResolvedValueOnce({ estado: ESTADO_REGISTRO.rechazada, errores: [] });

    const resultado = await runRegistroViajerosScan();

    expect(resultado.candidatas).toBe(3);
    expect(resultado.enviadas).toBe(1);
    expect(resultado.datosIncompletos).toBe(1);
    expect(resultado.rechazadas).toBe(1);
    expect(__mockEnviar).toHaveBeenCalledWith('tenant-1', 'res-1');
  });

  it('consulta los lotes y anula las comunicaciones de reservas canceladas', async () => {
    __mockConsultar.mockResolvedValue({ consultados: 2, aceptadas: 1, rechazadas: 1, enProceso: 0 });
    // Dos consultas distintas a la misma tabla (anulables y abandonados): se
    // responde según lo que pida cada una, no con el mismo valor para las dos.
    // La de abandonados se reconoce por su `where.intentos` (el tope de
    // intentos); la de anulables, por el estado de la reserva.
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockImplementation(
      async (args: { where?: { intentos?: unknown } }) =>
        args?.where?.intentos ? [] : [{ id: 'com-1' }, { id: 'com-2' }]
    );

    const resultado = await runRegistroViajerosScan();

    expect(__mockConsultar).toHaveBeenCalledWith('tenant-1');
    expect(resultado.aceptadasAlConsultar).toBe(1);
    expect(resultado.rechazadas).toBe(1);

    const whereAnulables = __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mock.calls[0][0].where;
    expect(whereAnulables.reservation).toEqual({ estado: 'cancelled' });
    expect(whereAnulables.codigoComunicacion).toEqual({ not: null });

    expect(resultado.anuladas).toBe(2);
  });

  it('cuenta por tenant los partes que el barrido ya NO va a reintentar, por causa', async () => {
    __mockPrisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-1', nombre: 'Hotel Uno' },
      { id: 'tenant-2', nombre: 'Hotel Dos' },
    ]);
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockImplementation(
      async (args: { where?: { intentos?: unknown } }) =>
        args?.where?.intentos
          ? [
              { tenantId: 'tenant-1', estado: ESTADO_REGISTRO.rechazada },
              { tenantId: 'tenant-1', estado: ESTADO_REGISTRO.error },
              { tenantId: 'tenant-2', estado: ESTADO_REGISTRO.rechazada },
            ]
          : []
    );

    const resultado = await runRegistroViajerosScan();

    expect(resultado.abandonados).toBe(3);
    expect(resultado.abandonadosPorTenant).toEqual([
      { tenantId: 'tenant-1', nombre: 'Hotel Uno', partes: 2, rechazados: 1, sinEntregar: 1 },
      { tenantId: 'tenant-2', nombre: 'Hotel Dos', partes: 1, rechazados: 1, sinEntregar: 0 },
    ]);

    // El filtro es la misma regla del módulo: el parte de una cancelada o un
    // no-show no existe, así que no puede contar como abandonado; y los estados
    // son los dos que el barrido puede abandonar —un rechazo del Ministerio y
    // una entrega que no llegó—, no solo el rechazo.
    const where = __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mock.calls.find(
      (c) => c[0]?.where?.intentos
    )![0].where;
    expect(where.intentos).toEqual({ gte: MAX_INTENTOS_PARTE });
    expect(where.estado.in).toEqual(
      expect.arrayContaining([ESTADO_REGISTRO.rechazada, ESTADO_REGISTRO.error])
    );
    expect(where.tipoComunicacion).toBe(TIPO_COMUNICACION.parteViajeros);
    expect(where.reservation.estado.in).toEqual([...ESTADOS_ACTIVOS_REGISTRO]);
    expect(where.reservation.estado.in).not.toContain('cancelled');
  });

  it('una entrega que no llegó no se cuenta como rechazo del Ministerio', async () => {
    // Son dos incidencias distintas: si el panel dijera «el Ministerio sigue sin
    // aceptarlos» de un parte que nunca le llegó, el equipo buscaría el problema
    // en los datos del huésped.
    __mockPrisma.tenant.findMany.mockResolvedValue([{ id: 'tenant-1', nombre: 'Hotel Uno' }]);
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockImplementation(
      async (args: { where?: { intentos?: unknown } }) =>
        args?.where?.intentos
          ? [{ tenantId: 'tenant-1', estado: ESTADO_REGISTRO.error }]
          : []
    );

    const resultado = await runRegistroViajerosScan();

    expect(resultado.abandonadosPorTenant[0]).toMatchObject({
      rechazados: 0,
      sinEntregar: 1,
    });
    const aviso = avisosDelBarrido(resultado)[0];
    expect(aviso).toContain('1 sin respuesta del servicio');
    expect(aviso).not.toContain('rechazado(s) por el Ministerio');
    expect(avisosDelBarrido({ ...resultado, abandonadosPorTenant: [] })).toEqual([]);
  });

  it('las entregas fallidas de la pasada se cuentan aparte de los rechazos', async () => {
    // El contador del barrido: una caída del servicio se ve en el panel de
    // estado como lo que es ('sin entregar'), no como un rechazo del Ministerio.
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([
      { id: 'res-1', tenantId: 'tenant-1' },
      { id: 'res-2', tenantId: 'tenant-1' },
    ]);
    __mockEnviar
      .mockResolvedValueOnce({ estado: ESTADO_REGISTRO.error, errores: [] })
      .mockResolvedValueOnce({ estado: ESTADO_REGISTRO.error, errores: [] });

    const resultado = await runRegistroViajerosScan();

    expect(resultado.sinEntregar).toBe(2);
    expect(resultado.rechazadas).toBe(0);
    expect(resultado.enviadas).toBe(0);
    expect(resumenDelBarrido(resultado)).toContain('2 sin entregar');
    expect(resumenDelBarrido({ ...resultado, sinEntregar: 0 })).not.toContain('sin entregar');
  });

  it('sin partes abandonados no pregunta por los tenants (ni inventa avisos)', async () => {
    const resultado = await runRegistroViajerosScan();

    expect(resultado.abandonados).toBe(0);
    expect(resultado.abandonadosPorTenant).toEqual([]);
    expect(__mockPrisma.tenant.findMany).not.toHaveBeenCalled();
    expect(avisosDelBarrido(resultado)).toEqual([]);
  });

  it('el aviso del panel nombra el tenant y cuántos partes se han quedado sin reintentar', () => {
    const avisos = avisosDelBarrido({
      ...resultadoVacio(),
      abandonados: 3,
      abandonadosPorTenant: [
        { tenantId: 'tenant-1', nombre: 'Hotel Uno', partes: 2, rechazados: 2, sinEntregar: 0 },
        { tenantId: 'tenant-2', nombre: 'Hotel Dos', partes: 1, rechazados: 1, sinEntregar: 0 },
      ],
    });

    // Uno por tenant: quien mira el panel tiene que saber de quién es el problema.
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toContain('Hotel Uno');
    expect(avisos[0]).toContain('2 parte(s) sin reintentar');
    expect(avisos[1]).toContain('Hotel Dos');

    // Y el resumen de la pasada no lo esconde.
    const resumen = resumenDelBarrido({ ...resultadoVacio(), abandonados: 3 });
    expect(resumen).toContain('3 sin reintentar');
    expect(resumenDelBarrido(resultadoVacio())).not.toContain('sin reintentar');
  });

  it('un error en una reserva no detiene el barrido', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([
      { id: 'res-1', tenantId: 'tenant-1' },
      { id: 'res-2', tenantId: 'tenant-1' },
    ]);
    __mockEnviar
      .mockRejectedValueOnce(new Error('caída del servicio'))
      .mockResolvedValueOnce({ estado: ESTADO_REGISTRO.enviada, errores: [] });

    const resultado = await runRegistroViajerosScan();

    expect(resultado.errores).toBe(1);
    expect(resultado.enviadas).toBe(1);
    expect(__mockEnviar).toHaveBeenCalledTimes(2);
  });

  it('un fallo general se devuelve como error, sin lanzar', async () => {
    __mockPrisma.hospitalityMirConfig.findMany.mockRejectedValue(new Error('sin base de datos'));

    const resultado = await runRegistroViajerosScan();
    expect(resultado.error).toBe('sin base de datos');
    expect(resultado.enviadas).toBe(0);
  });
});
