// @vitest-environment node

/**
 * Guardia de inventario (§29): noches que el proveedor tiene por buenas y el
 * estado interno no justifica.
 *
 * El caso de referencia es real (9-oct-2026): el push de la reserva de prueba
 * del onboarding dejó `available: 0` en dos noches, la reserva se borró del ERP
 * y nadie volvió a empujar. El canal siguió sin venderlas durante días.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityUnit: { findMany: vi.fn() },
  hospitalityReservation: { findMany: vi.fn() },
  hospitalityUnitBlock: { findMany: vi.fn() },
  hospitalitySyncLog: { findMany: vi.fn(), create: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: mocks, default: mocks }));

import {
  estadoEmpujado,
  compararInventario,
  indiceInterno,
  leerTramos,
  avisoDePropiedad,
  type CeldaEmpujada,
  type DivergenciaPropiedad,
} from '@/lib/hospitality/inventario-divergencias';

const HOY = new Date();
const dia = (offset: number) => {
  const d = new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
};

/** Log de push tal como lo escribe `recordSyncLog` en `sync.ts`. */
function logPush(
  horasAtras: number,
  updates: Array<{ startDate: string; endDate: string; rooms: Array<{ roomCode: string; available: number }> }>,
  estado = 'exito'
) {
  return {
    fechaCreacion: new Date(Date.now() - horasAtras * 60 * 60 * 1000),
    estado,
    requestPayload: { hotelCode: 'HOTEL1', updates },
  };
}

function celda(roomCode: string, fecha: string, available: number, empujadoEn = new Date().toISOString()): CeldaEmpujada {
  return { roomCode, fecha, available, empujadoEn };
}

function propiedad(overrides: Partial<DivergenciaPropiedad> = {}): DivergenciaPropiedad {
  return {
    propertyId: 'p1',
    propertyNombre: 'Villa Mar Azul',
    hotelCode: 'HOTEL1',
    cerradasSinJustificar: 0,
    abiertasSinJustificar: 0,
    comparadas: 0,
    sinDato: 0,
    logsUsados: 0,
    cerradas: [],
    abiertas: [],
    ...overrides,
  };
}

describe('leerTramos', () => {
  it('acepta la forma del contrato y descarta lo que no la cumple', () => {
    const tramos = leerTramos({
      hotelCode: 'HOTEL1',
      updates: [
        { startDate: '2026-10-10', endDate: '2026-10-11', rooms: [{ roomCode: '2b', available: 0 }] },
        { startDate: '2026-10-10', rooms: [] },
        'texto',
        null,
        { endDate: '2026-10-11', rooms: [] },
      ],
    });
    expect(tramos).toHaveLength(1);
    expect(tramos[0].rooms).toEqual([{ roomCode: '2b', available: 0 }]);
  });

  it('un payload sin updates no aporta tramos', () => {
    expect(leerTramos(null)).toEqual([]);
    expect(leerTramos({ hotelCode: 'HOTEL1' })).toEqual([]);
    expect(leerTramos({ updates: 'no-es-array' })).toEqual([]);
  });
});

describe('estadoEmpujado (replay de los pushes)', () => {
  it('el push más NUEVO que cubre cada noche es el que manda', () => {
    const { celdas } = estadoEmpujado(
      [
        // Más nuevo: la reserva de prueba cierra los días 1 y 2.
        logPush(1, [
          {
            startDate: dia(1),
            endDate: dia(2),
            rooms: [{ roomCode: '2b', available: 0 }],
          },
        ]),
        // Más viejo: el push del paso 7 los tenía libres.
        logPush(5, [
          {
            startDate: dia(1),
            endDate: dia(4),
            rooms: [{ roomCode: '2b', available: 1 }],
          },
        ]),
      ],
      { desde: dia(0), hasta: dia(4) }
    );

    expect(celdas.get(`2b|${dia(1)}`)?.available).toBe(0);
    expect(celdas.get(`2b|${dia(2)}`)?.available).toBe(0);
    // Los días que solo cubría el push viejo conservan su valor…
    expect(celdas.get(`2b|${dia(3)}`)?.available).toBe(1);
    expect(celdas.get(`2b|${dia(4)}`)?.available).toBe(1);
  });

  it('un push fallido no describe nada: no llegó al proveedor', () => {
    const { celdas, logsUsados } = estadoEmpujado(
      [
        logPush(1, [
          { startDate: dia(1), endDate: dia(1), rooms: [{ roomCode: '2b', available: 0 }] },
        ], 'error'),
      ],
      { desde: dia(0), hasta: dia(4) }
    );
    expect(celdas.size).toBe(0);
    expect(logsUsados).toBe(0);
  });

  it('acota al rango que se va a juzgar y no inventa noches de un payload corrupto', () => {
    const { celdas } = estadoEmpujado(
      [
        logPush(1, [
          // Rango que se sale de la ventana…
          { startDate: dia(-10), endDate: dia(20), rooms: [{ roomCode: '2b', available: 1 }] },
          // …y una fecha que no existe (JS la correría al 3 de marzo).
          { startDate: '2026-02-31', endDate: '2026-03-02', rooms: [{ roomCode: '2b', available: 0 }] },
          // Un tramo invertido tampoco vale.
          { startDate: dia(3), endDate: dia(2), rooms: [{ roomCode: '2b', available: 0 }] },
        ]),
      ],
      { desde: dia(0), hasta: dia(4) }
    );
    expect([...celdas.keys()].sort()).toEqual(
      [dia(0), dia(1), dia(2), dia(3), dia(4)].map((f) => `2b|${f}`).sort()
    );
    expect(celdas.get(`2b|${dia(0)}`)?.available).toBe(1);
  });

  it('los tramos sin roomCode utilizable se ignoran', () => {
    const { celdas } = estadoEmpujado(
      [
        logPush(1, [
          {
            startDate: dia(1),
            endDate: dia(1),
            rooms: [
              { roomCode: '', available: 0 } as any,
              { roomCode: '2b', available: 'x' as any },
              // `Number(null)` es 0: sin la comprobación de tipo esto se leería
              // como una noche cerrada que nunca se cerró.
              { roomCode: '2b', available: null } as any,
            ],
          },
        ]),
      ],
      { desde: dia(0), hasta: dia(2) }
    );
    expect(celdas.size).toBe(0);
  });
});

describe('compararInventario', () => {
  it('cerrada sin justificar: el proveedor no vende una noche que aquí está libre', () => {
    const celdas = new Map<string, CeldaEmpujada>([
      [`2b|${dia(1)}`, celda('2b', dia(1), 0)],
      [`2b|${dia(2)}`, celda('2b', dia(2), 0)],
      [`2b|${dia(3)}`, celda('2b', dia(3), 1)],
    ]);
    const interno = indiceInterno([
      { fecha: dia(1), rooms: [{ roomCode: '2b', available: 1 }] },
      { fecha: dia(2), rooms: [{ roomCode: '2b', available: 1 }] },
      { fecha: dia(3), rooms: [{ roomCode: '2b', available: 1 }] },
    ]);

    const r = compararInventario({ celdas, interno });

    expect(r.cerradasSinJustificar).toBe(2);
    expect(r.abiertasSinJustificar).toBe(0);
    expect(r.comparadas).toBe(3);
    expect(r.sinDato).toBe(0);
    expect(r.cerradas.map((n) => n.fecha)).toEqual([dia(1), dia(2)]);
    expect(r.cerradas[0]).toMatchObject({ roomCode: '2b', proveedor: 0, interno: 1 });
  });

  it('abierta sin justificar: el proveedor vende una noche que aquí ya está ocupada', () => {
    const celdas = new Map<string, CeldaEmpujada>([[`2b|${dia(1)}`, celda('2b', dia(1), 1)]]);
    const interno = indiceInterno([{ fecha: dia(1), rooms: [{ roomCode: '2b', available: 0 }] }]);

    const r = compararInventario({ celdas, interno });

    expect(r.abiertasSinJustificar).toBe(1);
    expect(r.cerradasSinJustificar).toBe(0);
    expect(r.abiertas[0]).toMatchObject({ proveedor: 1, interno: 0 });
  });

  it('un roomCode que ya no existe aquí y el canal sigue vendiendo es sobreventa', () => {
    const celdas = new Map<string, CeldaEmpujada>([[`3c|${dia(1)}`, celda('3c', dia(1), 2)]]);
    const interno = indiceInterno([{ fecha: dia(1), rooms: [{ roomCode: '2b', available: 1 }] }]);

    const r = compararInventario({ celdas, interno });

    expect(r.abiertasSinJustificar).toBe(1);
    expect(r.abiertas[0].roomCode).toBe('3c');
  });

  it('una noche que ningún push cubre es «sin dato», no una divergencia', () => {
    const celdas = new Map<string, CeldaEmpujada>();
    const interno = indiceInterno([{ fecha: dia(1), rooms: [{ roomCode: '2b', available: 1 }] }]);

    const r = compararInventario({ celdas, interno });

    expect(r.sinDato).toBe(1);
    expect(r.comparadas).toBe(0);
    expect(r.cerradasSinJustificar).toBe(0);
    expect(r.abiertasSinJustificar).toBe(0);
  });

  it('recorta el listado sin perder el recuento real', () => {
    const celdas = new Map<string, CeldaEmpujada>();
    const serie: Array<{ fecha: string; rooms: Array<{ roomCode: string; available: number }> }> = [];
    for (let i = 0; i < 5; i++) {
      celdas.set(`2b|${dia(i)}`, celda('2b', dia(i), 0));
      serie.push({ fecha: dia(i), rooms: [{ roomCode: '2b', available: 1 }] });
    }

    const r = compararInventario({ celdas, interno: indiceInterno(serie), maxListado: 2 });

    expect(r.cerradasSinJustificar).toBe(5);
    expect(r.cerradas).toHaveLength(2);
  });
});

describe('avisoDePropiedad', () => {
  it('nombra los dos sentidos por separado', () => {
    const aviso = avisoDePropiedad(
      propiedad({ cerradasSinJustificar: 2, abiertasSinJustificar: 1 })
    );
    expect(aviso).toContain('Villa Mar Azul');
    expect(aviso).toContain('2 noche(s) que el proveedor NO vende');
    expect(aviso).toContain('1 noche(s) que el proveedor vende');
  });

  it('sin divergencias no hay aviso', () => {
    expect(avisoDePropiedad(propiedad())).toBeNull();
  });
});

describe('detectarDivergenciasInventario (barrido completo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hospitalitySyncLog.create.mockResolvedValue({ id: 'log_div' });
  });

  it('caza las dos noches fantasma del onboarding y deja la traza', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      { id: 'p1', nombre: 'Villa Mar Azul', mappings: [{ externalPropertyId: 'HOTEL1' }] },
    ]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'u1', propertyId: 'p1', estado: 'available', mappings: [{ externalUnitCode: '2b' }] },
    ]);
    // La reserva de prueba ya se borró: internamente las noches están libres.
    mocks.hospitalityReservation.findMany.mockResolvedValue([]);
    mocks.hospitalityUnitBlock.findMany.mockResolvedValue([]);
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([
      // El push de la reserva de prueba (reserva_creada) cerró dos noches…
      logPush(1, [
        { startDate: dia(1), endDate: dia(2), rooms: [{ roomCode: '2b', available: 0 }] },
      ]),
      // …y antes el paso 7 las tenía libres hasta el día 4.
      logPush(5, [
        { startDate: dia(1), endDate: dia(4), rooms: [{ roomCode: '2b', available: 1 }] },
      ]),
    ]);

    const { detectarDivergenciasInventario } = await import(
      '@/lib/hospitality/inventario-divergencias'
    );
    const resumen = await detectarDivergenciasInventario({ tenantId: 't1', dias: 30 });

    expect(resumen.ok).toBe(true);
    expect(resumen.propiedades).toBe(1);
    expect(resumen.cerradasSinJustificar).toBe(2);
    expect(resumen.abiertasSinJustificar).toBe(0);

    const detalle = resumen.detalle[0];
    expect(detalle.hotelCode).toBe('HOTEL1');
    expect(detalle.logsUsados).toBe(2);
    expect(detalle.comparadas).toBe(4); // los 4 días que cubre algún push
    expect(detalle.sinDato).toBe(26); // el resto del horizonte, nunca empujado
    expect(detalle.cerradas.map((n) => n.fecha)).toEqual([dia(1), dia(2)]);
    expect(detalle.cerradas[0]).toMatchObject({ roomCode: '2b', proveedor: 0, interno: 1 });
    expect(resumen.avisos[0]).toContain('se pierden ventas');

    const log = mocks.hospitalitySyncLog.create.mock.calls.at(-1)?.[0];
    expect(log.data.tipo).toBe('divergencias_inventario');
    expect(log.data.propertyId).toBe('p1');
    expect(log.data.responseBody).toMatchObject({
      cerradasSinJustificar: 2,
      abiertasSinJustificar: 0,
      comparadas: 4,
      sinDato: 26,
    });
  });

  it('sin ningún push no se juzga nada: todo es «sin dato»', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      { id: 'p1', nombre: 'Villa Mar Azul', mappings: [{ externalPropertyId: 'HOTEL1' }] },
    ]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'u1', propertyId: 'p1', estado: 'available', mappings: [{ externalUnitCode: '2b' }] },
    ]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([]);
    mocks.hospitalityUnitBlock.findMany.mockResolvedValue([]);
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([]);

    const { detectarDivergenciasInventario } = await import(
      '@/lib/hospitality/inventario-divergencias'
    );
    const resumen = await detectarDivergenciasInventario({ tenantId: 't1', dias: 30 });

    expect(resumen.cerradasSinJustificar).toBe(0);
    expect(resumen.abiertasSinJustificar).toBe(0);
    expect(resumen.comparadas).toBe(0);
    expect(resumen.sinDato).toBe(30);
    expect(resumen.avisos).toEqual([]);
  });

  it('una propiedad sin mapping activo no se audita: nada se le empujó', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      { id: 'p9', nombre: 'Sin vincular', mappings: [] },
    ]);

    const { detectarDivergenciasInventario } = await import(
      '@/lib/hospitality/inventario-divergencias'
    );
    const resumen = await detectarDivergenciasInventario({ tenantId: 't1' });

    expect(resumen.propiedades).toBe(0);
    expect(resumen.detalle).toEqual([]);
    expect(mocks.hospitalitySyncLog.create).not.toHaveBeenCalled();
  });

  it('un fallo en una propiedad no tumba el barrido de las demás', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      { id: 'p1', nombre: 'Rota', mappings: [{ externalPropertyId: 'HOTEL1' }] },
      { id: 'p2', nombre: 'Sana', mappings: [{ externalPropertyId: 'HOTEL2' }] },
    ]);
    mocks.hospitalityUnit.findMany
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValue([
        { id: 'u1', propertyId: 'p2', estado: 'available', mappings: [{ externalUnitCode: '2b' }] },
      ]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([]);
    mocks.hospitalityUnitBlock.findMany.mockResolvedValue([]);
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([]);

    const { detectarDivergenciasInventario } = await import(
      '@/lib/hospitality/inventario-divergencias'
    );
    const resumen = await detectarDivergenciasInventario({ tenantId: 't1', dias: 30 });

    expect(resumen.ok).toBe(false);
    expect(resumen.errores).toEqual(['[Rota] DB timeout']);
    expect(resumen.detalle).toHaveLength(1);
    expect(resumen.detalle[0].propertyId).toBe('p2');
  });
});
