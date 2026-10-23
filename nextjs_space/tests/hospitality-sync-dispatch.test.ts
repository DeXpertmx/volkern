import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// MOCKS (vi.hoisted)
// ────────────────────────────────────────────────────────────────────────────
const __prisma = vi.hoisted(() => ({
  connectivityProvider: { findUnique: vi.fn() },
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityUnit: { findMany: vi.fn() },
  hospitalityReservation: { findMany: vi.fn() },
  hospitalityUnitBlock: { findMany: vi.fn() },
  hospitalityRatePlan: { findMany: vi.fn() },
  connectivityMapping: { findFirst: vi.fn() },
  hospitalitySyncLog: { create: vi.fn() },
}));

const __pushInventory = vi.hoisted(() => vi.fn());
const __pushRates = vi.hoisted(() => vi.fn());
const __pushInventoryRestrictions = vi.hoisted(() => vi.fn());
const __pushRateRestrictions = vi.hoisted(() => vi.fn());
const __getProvider = vi.hoisted(() => vi.fn());
const __updateStatus = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ prisma: __prisma }));

// Módulo real para lo que es puro (la lectura de `warnings` del proveedor: es la
// regla que decide que un descarte no es un éxito) y mocks solo para la red.
vi.mock('@/lib/hospitality/connectivity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hospitality/connectivity')>()),
  getConnectivityProvider: (...a: any[]) => __getProvider(...a),
  // `dispatchConnectivityPush` resuelve las credenciales con
  // `getConnectivityCredentials` (el ID de socio puede ser el del cliente, no
  // solo el de plataforma). Se derivan del mismo `__getProvider` que ya gobierna
  // cada escenario, así que «sin configurar» sigue siendo el mismo caso: sin los
  // tres secretos no hay credenciales y no se empuja nada.
  getConnectivityCredentials: async (...a: any[]) => {
    const provider = await __getProvider(...a);
    if (!provider || !provider.partnerIdEnc || !provider.usernameEnc || !provider.passwordEnc) {
      return null;
    }
    return { partnerId: 'partner-test', username: 'usuario-test', password: 'clave-test' };
  },
  updateConnectivityStatus: (...a: any[]) => __updateStatus(...a),
  pushInventory: (...a: any[]) => __pushInventory(...a),
  pushRates: (...a: any[]) => __pushRates(...a),
  pushInventoryRestrictions: (...a: any[]) => __pushInventoryRestrictions(...a),
  pushRateRestrictions: (...a: any[]) => __pushRateRestrictions(...a),
}));

const ok = (tipo: string) => ({
  ok: true,
  tipo,
  httpStatus: 200,
  message: 'ok',
  respuestaExterna: { success: true, message: 'ok' },
  duracionMs: 5,
});

/** Unidad con mapping externo y un plan de tarifa activo. */
function unidadConPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    propertyId: 'p1',
    estado: 'available',
    tarifaBase: 1000,
    mappings: [{ unitId: 'u1', externalUnitCode: 'SUITE', externalRatePlanCode: null }],
    ratePlans: [
      {
        id: 'rp1',
        codigo: 'SUITE-REST',
        tarifa: 1000,
        activo: true,
        minNoches: 2,
        maxNoches: 5,
        checkInDias: null,
        checkOutDias: null,
        ...overrides,
      },
    ],
  };
}

/**
 * Emula la proyección de Prisma: solo devuelve los campos pedidos en el
 * `select`. Así el test detecta un `select` incompleto (el bug que dejó el
 * push de tarifas muerto al filtrar por un campo no seleccionado).
 */
function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Expande los tramos del push de inventario a un mapa fecha → disponible.
 * Es lo que recibe de verdad el proveedor: los tramos son un detalle de
 * transporte, lo que importa es el disponible de cada noche.
 */
function disponibilidadPorDia(
  updates: Array<{ startDate: string; endDate: string; rooms: Array<{ roomCode: string; available: number }> }>
) {
  const porDia = new Map<string, number>();
  for (const update of updates) {
    for (const room of update.rooms) {
      const cursor = new Date(`${update.startDate}T00:00:00`);
      const fin = new Date(`${update.endDate}T00:00:00`);
      while (cursor.getTime() <= fin.getTime()) {
        porDia.set(isoLocal(cursor), room.available);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }
  return porDia;
}

function mockUnidades(units: Array<Record<string, any>>) {
  __prisma.hospitalityUnit.findMany.mockImplementation(async (args: any) => {
    const select = args?.include?.ratePlans?.select;
    return units.map((u) => ({
      ...u,
      ratePlans: (u.ratePlans || []).map((p: any) => {
        if (!select) return p;
        const proyectado: Record<string, unknown> = {};
        for (const key of Object.keys(select)) if (select[key]) proyectado[key] = p[key];
        return proyectado;
      }),
    }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __getProvider.mockResolvedValue({
    partnerIdEnc: 'enc',
    usernameEnc: 'enc',
    passwordEnc: 'enc',
    contadorErrores: 0,
  });
  __prisma.hospitalityProperty.findMany.mockResolvedValue([{ id: 'p1' }]);
  __prisma.hospitalityReservation.findMany.mockResolvedValue([]);
  __prisma.hospitalityUnitBlock.findMany.mockResolvedValue([]);
  // Sin temporadas configuradas, el horizonte es el que pide el llamador.
  __prisma.hospitalityRatePlan.findMany.mockResolvedValue([]);
  __prisma.connectivityMapping.findFirst.mockResolvedValue({ externalPropertyId: 'HOTEL1' });
  mockUnidades([unidadConPlan()]);
  __prisma.hospitalitySyncLog.create.mockResolvedValue({});
  __pushInventory.mockResolvedValue(ok('inventory'));
  __pushRates.mockResolvedValue(ok('rates'));
  __pushInventoryRestrictions.mockResolvedValue(ok('inventory_restrictions'));
  __pushRateRestrictions.mockResolvedValue(ok('rates_restrictions'));
  __updateStatus.mockResolvedValue(null);
});

describe('dispatchConnectivityPush (plan §5 y §15.2)', () => {
  it('empuja inventario, restricciones de inventario, tarifas y restricciones de tarifas', async () => {
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');

    const res = await dispatchConnectivityPush('t1', null, 'manual', { diasHorizonte: 5 });

    expect(res.ok).toBe(true);
    expect(res.pushCount).toBe(4);
    expect(__pushInventory).toHaveBeenCalledTimes(1);
    expect(__pushInventoryRestrictions).toHaveBeenCalledTimes(1);
    expect(__pushRates).toHaveBeenCalledTimes(1);
    expect(__pushRateRestrictions).toHaveBeenCalledTimes(1);

    // Los cuatro quedan auditados con su propio tipo (§29).
    const tipos = __prisma.hospitalitySyncLog.create.mock.calls.map(
      (c: any[]) => c[0].data.tipo
    );
    expect(tipos.sort()).toEqual(
      ['inventory', 'inventory_restrictions', 'rates', 'rates_restrictions'].sort()
    );
  });

  it('el push de tarifas incluye los planes ACTIVOS (no los descarta el filtro)', async () => {
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');

    await dispatchConnectivityPush('t1', null, 'manual', { diasHorizonte: 5 });

    const [hotelCode, rateUpdates] = __pushRates.mock.calls[0];
    expect(hotelCode).toBe('HOTEL1');
    expect(rateUpdates.flatMap((u: any) => u.rates)).toEqual([
      { roomCode: 'SUITE', rateplanCode: 'SUITE-REST', rate: 1000 },
    ]);
  });

  it('el id interno del plan NUNCA viaja como rateplanCode (caso real 14-oct-2026)', async () => {
    // La `Tarifa 2A` del hotel se creó sin código y el push mandó su cuid como
    // `rateplanCode`: el proveedor lo descartó (`INVALID_RATEPLAN_CODE`) y el
    // mensaje le pedía al hotel activar ese id en su extranet. Con el código de
    // tarifa del vínculo, el plan viaja donde debe.
    const ID_INTERNO = 'cmv877haz0072us01nb0np80t';
    mockUnidades([
      {
        id: 'u1',
        nombre: 'Apartamento centro ciudad patio cuarenta 2A',
        codigo: 'CPC-2A',
        propertyId: 'p1',
        estado: 'available',
        tarifaBase: 120,
        mappings: [{ unitId: 'u1', externalUnitCode: '2a', externalRatePlanCode: '2a-d-ep' }],
        // El plan llega con el id que la base pone en la PK y sin código propio.
        ratePlans: [
          {
            id: ID_INTERNO,
            codigo: null,
            tarifa: 120,
            activo: true,
            minNoches: 2,
            maxNoches: null,
            checkInDias: null,
            checkOutDias: null,
            temporadas: null,
            finDeSemana: null,
          },
        ],
      },
    ]);

    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');
    await dispatchConnectivityPush('t1', 'p1', 'manual', { diasHorizonte: 5 });

    const [, rateUpdates] = __pushRates.mock.calls[0];
    expect(rateUpdates.flatMap((u: any) => u.rates)).toEqual([
      { roomCode: '2a', rateplanCode: '2a-d-ep', rate: 120 },
    ]);
    const [, restricciones] = __pushRateRestrictions.mock.calls[0];
    expect(restricciones[0].rates[0].rateplanCode).toBe('2a-d-ep');
    // Ni en un payload ni en el otro.
    expect(JSON.stringify(__pushRates.mock.calls[0][1])).not.toContain(ID_INTERNO);
    expect(JSON.stringify(__pushRateRestrictions.mock.calls[0][1])).not.toContain(ID_INTERNO);
  });

  it('sin código de plan y sin vínculo la tarifa no viaja: la unidad cuenta como «no viajó»', async () => {
    mockUnidades([
      {
        ...unidadConPlan({ codigo: null, tarifa: 120 }),
        id: 'u1',
        nombre: 'Apartamento con tarifa sin código',
        tarifaBase: 120,
        mappings: [{ unitId: 'u1', externalUnitCode: '2a', externalRatePlanCode: null }],
      },
      {
        ...unidadConPlan(),
        id: 'u2',
        nombre: 'Apartamento 2B',
        mappings: [{ unitId: 'u2', externalUnitCode: '2b', externalRatePlanCode: '2b-d-ep' }],
      },
    ]);
    // El push falla con un descarte: es cuando el informe publica lo que no viajó.
    __pushRates.mockResolvedValue({
      ok: false,
      tipo: 'rates',
      httpStatus: 200,
      error: 'descartó datos',
      respuestaExterna: { success: true, warnings: ['INVALID_RATEPLAN_CODE : 2b-d-ep'] },
      duracionMs: 5,
    });

    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');
    const res = await dispatchConnectivityPush('t1', 'p1', 'manual', { diasHorizonte: 5 });

    // Solo viaja la unidad que tiene con qué etiquetar su precio, y con el
    // código de SU plan (el del vínculo solo entra cuando el plan no tiene).
    const [, rateUpdates] = __pushRates.mock.calls[0];
    expect(rateUpdates.flatMap((u: any) => u.rates)).toEqual([
      { roomCode: '2b', rateplanCode: 'SUITE-REST', rate: 1000 },
    ]);
    expect(res.rates.error).toContain('«Apartamento con tarifa sin código»');
    expect(res.rates.error).toContain('no tiene plan de tarifa con código del proveedor');
    expect(res.rechazo.noEnviadas.map((n) => n.nombre)).toEqual([
      'Apartamento con tarifa sin código',
    ]);
  });

  it('la temporada configurada entra en el push sin empujar a mano (caso real 15-oct-2026)', async () => {
    // El horizonte pedido (5 días) no llegaba a la temporada: el canal se
    // quedaba con el precio plano y la «Tarifa de Verano» del hotel solo viajó
    // en un push manual de 365 días. Ahora el horizonte se alarga hasta la
    // última noche de temporada y su precio por fecha viaja en el mismo envío.
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 20);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 25);
    const isoInicio = isoLocal(inicio);
    const isoFin = isoLocal(fin);

    mockUnidades([unidadConPlan({ temporadas: [{ desde: isoInicio, hasta: isoFin, tarifa: 1400 }] })]);
    __prisma.hospitalityRatePlan.findMany.mockResolvedValue([
      { temporadas: [{ desde: isoInicio, hasta: isoFin, tarifa: 1400 }] },
    ]);

    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');
    await dispatchConnectivityPush('t1', null, 'manual', { diasHorizonte: 5 });

    // Las tarifas llevan el tramo de temporada con su precio (y 1000 fuera de él).
    const [, rateUpdates] = __pushRates.mock.calls[0];
    const precios = rateUpdates.flatMap((u: any) => u.rates);
    expect(precios).toEqual(
      expect.arrayContaining([
        { roomCode: 'SUITE', rateplanCode: 'SUITE-REST', rate: 1400 },
      ])
    );
    const tramoTemporada = rateUpdates.find((u: any) =>
      u.rates.some((r: any) => r.rate === 1400)
    );
    expect(tramoTemporada.startDate).toBe(isoInicio);
    expect(tramoTemporada.endDate).toBe(isoFin);

    // Y la disponibilidad cubre la temporada entera (la última noche, incluida).
    const dias = disponibilidadPorDia(__pushInventory.mock.calls[0][1]);
    expect(dias.get(isoFin)).toBe(1);
    expect([...dias.keys()].sort().at(-1)).toBe(isoFin);
  });

  it('el horizonte de la temporada se queda en el de venta de los canales (tope)', async () => {
    const hoy = new Date();
    const hoyIso = isoLocal(hoy);
    const lejano = new Date(hoy.getFullYear() + 3, hoy.getMonth(), hoy.getDate());

    __prisma.hospitalityRatePlan.findMany.mockResolvedValue([
      { temporadas: [{ desde: isoLocal(lejano), hasta: isoLocal(lejano), tarifa: 1400 }] },
    ]);

    const { dispatchConnectivityPush, HORIZONTE_PUSH_MAX_DIAS } = await import('@/lib/hospitality/sync');
    await dispatchConnectivityPush('t1', null, 'manual', { diasHorizonte: 5 });

    const dias = disponibilidadPorDia(__pushInventory.mock.calls[0][1]);
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + HORIZONTE_PUSH_MAX_DIAS - 1);
    expect(isoLocal(ultimo)).not.toBe(hoyIso);
    expect([...dias.keys()].sort().at(-1)).toBe(isoLocal(ultimo));
  });

  it('una unidad sin planes empuja su tarifa base bajo el código de tarifa VINCULADO', async () => {
    // Caso real (hotel 75fdbbce2e, 9-oct 2026): sin planes de tarifa, la tarifa
    // base viajaba bajo el roomCode (`rateplanCode: "2b"`) y el proveedor la
    // descartaba con `INVALID_RATEPLAN_CODE`. El código vinculado de la unidad
    // es el que el hotel validó contra su catálogo.
    mockUnidades([
      {
        ...unidadConPlan(),
        ratePlans: [],
        tarifaBase: 120,
        mappings: [{ unitId: 'u1', externalUnitCode: '2b', externalRatePlanCode: '2b-d-ep' }],
      },
    ]);
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');

    await dispatchConnectivityPush('t1', null, 'manual', { diasHorizonte: 5 });

    const [, rateUpdates] = __pushRates.mock.calls[0];
    expect(rateUpdates.flatMap((u: any) => u.rates)).toEqual([
      { roomCode: '2b', rateplanCode: '2b-d-ep', rate: 120 },
    ]);
  });

  it('envía restricciones de inventario con available y los diez campos del contrato', async () => {
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');

    await dispatchConnectivityPush('t1', null, 'manual', { diasHorizonte: 5 });

    const [, updates] = __pushInventoryRestrictions.mock.calls[0];
    expect(updates).toHaveLength(1); // 5 días idénticos se agrupan en un bloque
    expect(updates[0].rooms).toEqual([
      {
        roomCode: 'SUITE',
        available: 1,
        restrictions: {
          stopSell: false,
          exactStayArrival: null,
          maximumStayArrival: null,
          minimumAdvanceReservation: null,
          minimumStay: 2,
          closeOnArrival: false,
          minimumStayArrival: null,
          maximumStay: 5,
          maximumAdvanceReservation: null,
          closeOnDeparture: false,
        },
      },
    ]);
  });

  it('cierra la llegada los días no permitidos por el plan, cubriendo todo el horizonte', async () => {
    mockUnidades([unidadConPlan({ checkInDias: [5] })]); // solo viernes
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');

    await dispatchConnectivityPush('t1', null, 'manual', { diasHorizonte: 5 });

    const [, updates] = __pushRateRestrictions.mock.calls[0];
    let dias = 0;
    for (const u of updates) {
      const cursor = new Date(u.startDate + 'T00:00:00');
      const end = new Date(u.endDate + 'T00:00:00');
      while (cursor.getTime() <= end.getTime()) {
        dias += 1;
        expect(u.rates[0].restrictions.closeOnArrival).toBe(cursor.getDay() !== 5);
        expect(u.rates[0].rateplanCode).toBe('SUITE-REST');
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    expect(dias).toBe(5);
  });

  it('sin plan de tarifas no empuja tarifas ni restricciones de tarifas', async () => {
    mockUnidades([{ ...unidadConPlan(), tarifaBase: null, ratePlans: [] }]);
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');

    const res = await dispatchConnectivityPush('t1', null, 'manual', { diasHorizonte: 5 });

    expect(res.pushCount).toBe(2); // inventario + restricciones de inventario
    expect(__pushRates).not.toHaveBeenCalled();
    expect(__pushRateRestrictions).not.toHaveBeenCalled();
  });

  it('con skipRates solo empuja inventario y sus restricciones', async () => {
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');

    const res = await dispatchConnectivityPush('t1', null, 'reserva_creada', {
      diasHorizonte: 5,
      skipRates: true,
    });

    expect(res.pushCount).toBe(2);
    expect(__pushRates).not.toHaveBeenCalled();
    expect(__pushRateRestrictions).not.toHaveBeenCalled();
  });

  it('reempujar tras borrar la reserva de prueba reabre las noches que cerró', async () => {
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');

    const hoy = new Date();
    const llegada = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
    const salida = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 3);

    // 1) La prueba de reserva entra (2 noches): su push cierra las dos noches en
    //    el proveedor, que es de donde salen las «noches fantasma» cuando la
    //    prueba luego se borra sin volver a empujar.
    __prisma.hospitalityReservation.findMany.mockResolvedValue([
      { unitId: 'u1', checkIn: llegada, checkOut: salida, estado: 'confirmed' },
    ]);
    await dispatchConnectivityPush('t1', 'p1', 'reserva_creada', {
      diasHorizonte: 4,
      skipRates: true,
    });
    const recienCreada = disponibilidadPorDia(__pushInventory.mock.calls[0][1]);
    expect(recienCreada.get(isoLocal(llegada))).toBe(0);
    expect(recienCreada.get(isoLocal(salida))).toBe(1);

    // 2) La limpieza la borra del ERP y vuelve a empujar: la disponibilidad se
    //    recalcula desde el estado interno, así que las noches se reabren.
    __prisma.hospitalityReservation.findMany.mockResolvedValue([]);
    await dispatchConnectivityPush('t1', 'p1', 'onboarding_limpieza', { diasHorizonte: 4 });

    const trasLimpiar = disponibilidadPorDia(__pushInventory.mock.calls[1][1]);
    expect(trasLimpiar.get(isoLocal(llegada))).toBe(1);
    expect(trasLimpiar.get(isoLocal(salida))).toBe(1);
    expect([...trasLimpiar.values()].every((v) => v === 1)).toBe(true);
  });

  it('un descarte del canal se atribuye a las UNIDADES, no a códigos sueltos (caso 13-oct-2026)', async () => {
    // El proveedor aceptó la petición y descartó la habitación de una de las dos
    // unidades empujadas (`INVALID_ROOM_CODE`): antes solo llegaba el código y el
    // envío entero se leía como fallido, sin decir qué unidad arreglar.
    mockUnidades([
      {
        ...unidadConPlan(),
        id: 'u1',
        nombre: 'Apartamento 1A',
        tarifaBase: 100,
        ratePlans: [],
        mappings: [{ unitId: 'u1', externalUnitCode: '1a', externalRatePlanCode: '1a-s-ep' }],
      },
      {
        ...unidadConPlan(),
        id: 'u2',
        nombre: 'Apartamento 2B',
        tarifaBase: 100,
        ratePlans: [],
        mappings: [{ unitId: 'u2', externalUnitCode: '2b', externalRatePlanCode: '2b-s-ep' }],
      },
    ]);
    __pushInventory.mockResolvedValue({
      ok: false,
      tipo: 'inventory',
      httpStatus: 200,
      message: 'ok',
      error: 'El proveedor aceptó la petición pero descartó datos: INVALID_ROOM_CODE : 1a',
      respuestaExterna: { success: true, message: 'ok', warnings: ['INVALID_ROOM_CODE : 1a'] },
      duracionMs: 5,
    });

    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');
    const res = await dispatchConnectivityPush('t1', null, 'manual', { diasHorizonte: 5 });

    expect(res.ok).toBe(false);
    // El error que se enseña nombra la unidad del hotel; el vocabulario del
    // proveedor no vuelve a salir.
    expect(res.inventory.error).toContain('«Apartamento 1A»');
    expect(res.inventory.error).toContain('habitación 1a');
    expect(res.inventory.error).not.toContain('INVALID_ROOM_CODE');
    // El informe separa lo descartado de lo que sí se envió.
    expect(res.rechazo.descartadas.map((d) => d.nombre)).toEqual(['Apartamento 1A']);
    expect(res.rechazo.aceptadas.map((a) => a.nombre)).toEqual(['Apartamento 2B']);
    expect(res.rechazo.mensaje).toContain('descartó 1 de 2');
    // Y queda en el log con el nombre: es lo que leen el panel y el asistente.
    const log = __prisma.hospitalitySyncLog.create.mock.calls
      .map((c: any[]) => c[0].data)
      .find((d: any) => d.tipo === 'inventory');
    expect(log.errorMensaje).toContain('«Apartamento 1A»');
  });

  it('una unidad que NO viajó en el push no puede contarse como enviada (caso 13-oct-2026)', async () => {
    // El push de restricciones de tarifa solo lleva unidades con plan CON código:
    // la segunda unidad (con tarifa base y sin planes) viaja en inventario y en
    // tarifas, pero no aquí. El informe se calcula sobre las que viajaron, y a la
    // que se quedó fuera la nombra con su motivo en vez de llamarla «enviada».
    mockUnidades([
      {
        ...unidadConPlan(),
        id: 'u1',
        nombre: 'Apartamento 1A',
        mappings: [{ unitId: 'u1', externalUnitCode: '1a', externalRatePlanCode: '1a-s-ep' }],
      },
      {
        ...unidadConPlan(),
        id: 'u2',
        nombre: 'Apartamento 2A',
        tarifaBase: 80,
        ratePlans: [],
        mappings: [{ unitId: 'u2', externalUnitCode: '2a', externalRatePlanCode: '2a-s-ep' }],
      },
    ]);
    __pushRateRestrictions.mockResolvedValue({
      ok: false,
      tipo: 'rates_restrictions',
      httpStatus: 200,
      error: 'descartó datos',
      respuestaExterna: { success: true, warnings: ['INVALID_ROOM_CODE : 1a'] },
      duracionMs: 5,
    });

    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');
    const res = await dispatchConnectivityPush('t1', null, 'manual', { diasHorizonte: 5 });

    // El conteo es sobre el envío real (1 unidad), no sobre la propiedad (2).
    expect(res.rateRestrictions.error).toContain('descartó 1 de 1 unidades');
    expect(res.rateRestrictions.error).toContain('«Apartamento 1A»');
    // Y la que no viajó se dice, con el motivo: ni enviada ni fallida.
    expect(res.rateRestrictions.error).toContain('1 unidad no viajó en este envío');
    expect(res.rateRestrictions.error).toContain('«Apartamento 2A»');
    expect(res.rateRestrictions.error).toContain('no tiene plan de tarifa con código del proveedor');
    expect(res.rateRestrictions.error).not.toContain('sí se enviaron');
    expect(res.rechazo.noEnviadas.map((n) => n.nombre)).toEqual(['Apartamento 2A']);
  });

  it('un fallo que no es un descarte conserva el mensaje del proveedor y deja el informe vacío', async () => {
    __pushInventory.mockResolvedValue({
      ok: false,
      tipo: 'inventory',
      httpStatus: 404,
      error: 'HTTP 404',
      respuestaExterna: { success: false, message: 'hotel desconocido' },
      duracionMs: 5,
    });
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');

    const res = await dispatchConnectivityPush('t1', null, 'manual', { diasHorizonte: 5 });

    expect(res.inventory.error).toBe('HTTP 404');
    expect(res.rechazo).toEqual({
      huboDescartes: false,
      descartadas: [],
      aceptadas: [],
      codigosSinUnidad: [],
      noEnviadas: [],
      mensaje: null,
    });
  });

  it('registra el error del proveedor sin romper el flujo', async () => {
    __pushInventory.mockResolvedValue({
      ok: false,
      tipo: 'inventory',
      httpStatus: 404,
      error: 'HTTP 404',
      duracionMs: 5,
    });
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');

    const res = await dispatchConnectivityPush('t1', null, 'manual', { diasHorizonte: 5 });

    expect(res.ok).toBe(false);
    expect(res.errores).toBe(1);
    expect(res.inventory.error).toBe('HTTP 404');
    expect(__updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'error', error: true })
    );
  });
});
