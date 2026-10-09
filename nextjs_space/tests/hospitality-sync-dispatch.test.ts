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

vi.mock('@/lib/hospitality/connectivity', () => ({
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
