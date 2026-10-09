import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  unitOccupiedOnDay,
  unitAvailability,
  availabilityByRoomCode,
  unitBlockedOnDay,
  unitUnavailableOnDay,
} from '../lib/hospitality/availability';
import {
  buildInventoryUpdates,
  buildRateUpdates,
  buildInventoryRestrictions,
  buildRateRestrictions,
} from '../lib/hospitality/sync';

const day = (iso: string) => new Date(iso + 'T00:00:00');

// Reserva 10→15: ocupa 10,11,12,13,14 (checkout no cuenta)
const SPAN = {
  unitId: 'u1',
  checkIn: day('2026-09-10'),
  checkOut: day('2026-09-15'),
  estado: 'confirmed',
};

describe('unitOccupiedOnDay (regla §8: checkout no ocupa su día)', () => {
  it('ocupa desde check-in hasta el día anterior a check-out', () => {
    expect(unitOccupiedOnDay('u1', day('2026-09-10'), [SPAN])).toBe(true); // check-in
    expect(unitOccupiedOnDay('u1', day('2026-09-12'), [SPAN])).toBe(true);
    expect(unitOccupiedOnDay('u1', day('2026-09-14'), [SPAN])).toBe(true); // última noche
    expect(unitOccupiedOnDay('u1', day('2026-09-15'), [SPAN])).toBe(false); // checkout
  });

  it('ignora reservas de otras unidades', () => {
    expect(unitOccupiedOnDay('u2', day('2026-09-12'), [SPAN])).toBe(false);
  });

  it('ignora canceladas', () => {
    expect(unitOccupiedOnDay('u1', day('2026-09-12'), [{ ...SPAN, estado: 'cancelled' }])).toBe(false);
  });

  it('ignora no-shows: la habitación que nadie ocupó vuelve al inventario', () => {
    // Decisión de producto (docs/hospitality-booking-payments-plan.md §0, regla
    // 7): el no-show no bloquea disponibilidad — es un hecho de cobro, no un
    // bloqueo de inventario. Antes solo la cancelada liberaba la unidad y un
    // no-show dejaba un bloqueo fantasma invisible en planning y canales.
    for (const dia of ['2026-09-10', '2026-09-12', '2026-09-14']) {
      expect(unitOccupiedOnDay('u1', day(dia), [{ ...SPAN, estado: 'no_show' }])).toBe(false);
    }
    // Y la unidad queda vendible esas mismas noches (misma regla en el motor).
    const libres = unitAvailability(
      { id: 'u1', propertyId: 'p1', roomCode: 'STD', estado: 'available' },
      day('2026-09-10'),
      day('2026-09-15'),
      [{ ...SPAN, estado: 'no_show' }]
    );
    expect(libres.every((d) => d.disponible)).toBe(true);
  });
  it('aplica bloqueos manuales con intervalo inicio inclusivo y fin exclusivo', () => {
    const block = {
      unitId: 'u1',
      fechaInicio: day('2026-09-10'),
      fechaFin: day('2026-09-12'),
      estado: 'activo',
    };

    expect(unitBlockedOnDay('u1', day('2026-09-10'), [block])).toBe(true);
    expect(unitBlockedOnDay('u1', day('2026-09-11'), [block])).toBe(true);
    expect(unitBlockedOnDay('u1', day('2026-09-12'), [block])).toBe(false);
    expect(unitUnavailableOnDay('u1', day('2026-09-11'), [], [block])).toBe(true);
  });

  it('ignora bloqueos cancelados o de otra unidad', () => {
    const block = {
      unitId: 'u1',
      fechaInicio: day('2026-09-10'),
      fechaFin: day('2026-09-12'),
      estado: 'cancelado',
    };
    expect(unitBlockedOnDay('u1', day('2026-09-11'), [block])).toBe(false);
    expect(unitBlockedOnDay('u2', day('2026-09-11'), [{ ...block, estado: 'activo' }])).toBe(false);
  });

  it('resta disponibilidad agregada por roomCode cuando una unidad está bloqueada', () => {
    const units = [
      { id: 'u1', propertyId: 'p1', roomCode: 'suite', estado: 'available' },
      { id: 'u2', propertyId: 'p1', roomCode: 'suite', estado: 'available' },
    ];
    const blocks = [{
      unitId: 'u1',
      fechaInicio: day('2026-09-10'),
      fechaFin: day('2026-09-11'),
      estado: 'activo',
    }];
    const out = availabilityByRoomCode(units, day('2026-09-10'), day('2026-09-11'), [], blocks);
    expect(out[0].rooms).toEqual([{ roomCode: 'suite', available: 1 }]);
  });
});

describe('unitAvailability', () => {
  it('devuelve 1/0 por cada fecha del rango', () => {
    const out = unitAvailability(
      { id: 'u1', propertyId: 'p1', roomCode: 'executive', estado: 'available' },
      day('2026-09-10'),
      day('2026-09-13'), // 3 noches: 10,11,12
      [SPAN]
    );
    expect(out).toEqual([
      { fecha: '2026-09-10', disponible: false },
      { fecha: '2026-09-11', disponible: false },
      { fecha: '2026-09-12', disponible: false },
    ]);
  });
});

describe('availabilityByRoomCode', () => {
  const units = [
    { id: 'u1', propertyId: 'p1', roomCode: 'executive', estado: 'available' },
    { id: 'u2', propertyId: 'p1', roomCode: 'executive', estado: 'available' },
    { id: 'u3', propertyId: 'p1', roomCode: 'suite', estado: 'available' },
  ];

  it('agrupa por roomCode y cuenta libres por fecha', () => {
    // u1 ocupada del 10 al 14; u2 y u3 libres
    const out = availabilityByRoomCode(units, day('2026-09-10'), day('2026-09-12'), [SPAN]);
    expect(out).toHaveLength(2); // 10 y 11
    const day10 = out[0];
    expect(day10.fecha).toBe('2026-09-10');
    expect(day10.rooms.find((r) => r.roomCode === 'executive')?.available).toBe(1);
    expect(day10.rooms.find((r) => r.roomCode === 'suite')?.available).toBe(1);
  });

  it('ignora unidades sin mapping (roomCode null)', () => {
    const out = availabilityByRoomCode(
      [{ id: 'u1', propertyId: 'p1', roomCode: null, estado: 'available' }],
      day('2026-09-10'),
      day('2026-09-11'),
      []
    );
    expect(out[0].rooms).toEqual([]);
  });

  it('cuenta unidades en maintenance como no disponibles', () => {
    const unitsMaint = [
      { id: 'u1', propertyId: 'p1', roomCode: 'executive', estado: 'maintenance' },
      { id: 'u2', propertyId: 'p1', roomCode: 'executive', estado: 'available' },
    ];
    const out = availabilityByRoomCode(unitsMaint, day('2026-09-10'), day('2026-09-11'), []);
    expect(out[0].rooms.find((r) => r.roomCode === 'executive')?.available).toBe(1);
  });
});

describe('buildInventoryUpdates (UPSERT por rango, contrato)', () => {
  it('agrupa días consecutivos con la misma disponibilidad en un solo bloque', () => {
    const byDay = [
      { fecha: '2026-09-10', rooms: [{ roomCode: 'executive', available: 1 }] },
      { fecha: '2026-09-11', rooms: [{ roomCode: 'executive', available: 1 }] },
      { fecha: '2026-09-12', rooms: [{ roomCode: 'executive', available: 0 }] },
      { fecha: '2026-09-13', rooms: [{ roomCode: 'executive', available: 0 }] },
    ];
    const updates = buildInventoryUpdates(byDay);
    expect(updates).toEqual([
      { startDate: '2026-09-10', endDate: '2026-09-11', rooms: [{ roomCode: 'executive', available: 1 }] },
      { startDate: '2026-09-12', endDate: '2026-09-13', rooms: [{ roomCode: 'executive', available: 0 }] },
    ]);
  });

  it('devuelve array vacío sin días', () => {
    expect(buildInventoryUpdates([])).toEqual([]);
  });

  it('payload con la forma exacta del contrato', () => {
    const updates = buildInventoryUpdates([
      { fecha: '2026-09-10', rooms: [{ roomCode: 'executive', available: 5 }] },
    ]);
    expect(updates[0]).toMatchObject({
      startDate: '2026-09-10',
      endDate: '2026-09-10',
      rooms: [{ roomCode: 'executive', available: 5 }],
    });
  });
});

describe('buildRateUpdates (contrato: /update-rates)', () => {
  it('construye un bloque por roomCode con tarifa base', () => {
    const units = [
      { id: 'u1', roomCode: 'executive', tarifaBase: 1749 },
      { id: 'u2', roomCode: 'suite', tarifaBase: 2999 },
    ];
    const updates = buildRateUpdates(units, day('2026-09-10'), day('2026-09-13'));
    expect(updates).toHaveLength(1);
    expect(updates[0].startDate).toBe('2026-09-10');
    expect(updates[0].endDate).toBe('2026-09-12'); // inclusivo
    expect(updates[0].rates).toEqual(
      expect.arrayContaining([
        { roomCode: 'executive', rateplanCode: 'executive', rate: 1749 },
        { roomCode: 'suite', rateplanCode: 'suite', rate: 2999 },
      ])
    );
  });

  it('plan sin estacionalidad: un solo bloque plano para todo el horizonte (como siempre)', () => {
    const updates = buildRateUpdates(
      [{ id: 'u1', roomCode: 'STD', tarifaBase: null, ratePlans: [{ codigo: 'STD-FLEX', tarifa: 100 }] }],
      day('2026-09-10'),
      day('2026-09-14')
    );
    expect(updates).toEqual([
      { startDate: '2026-09-10', endDate: '2026-09-13', rates: [{ roomCode: 'STD', rateplanCode: 'STD-FLEX', rate: 100 }] },
    ]);
  });

  it('plan con temporada: la serie se segmenta en tramos de precio constante', () => {
    const updates = buildRateUpdates(
      [
        {
          id: 'u1',
          roomCode: 'STD',
          tarifaBase: null,
          ratePlans: [
            {
              codigo: 'STD-FLEX',
              tarifa: 100,
              temporadas: [{ desde: '2026-09-12', hasta: '2026-09-14', tarifa: 150 }],
            },
          ],
        },
      ],
      day('2026-09-10'),
      day('2026-09-16')
    );
    // 10-11 a 100, 12-14 a 150, 15 a 100 otra vez: tres tramos.
    expect(updates).toEqual([
      { startDate: '2026-09-10', endDate: '2026-09-11', rates: [{ roomCode: 'STD', rateplanCode: 'STD-FLEX', rate: 100 }] },
      { startDate: '2026-09-12', endDate: '2026-09-14', rates: [{ roomCode: 'STD', rateplanCode: 'STD-FLEX', rate: 150 }] },
      { startDate: '2026-09-15', endDate: '2026-09-15', rates: [{ roomCode: 'STD', rateplanCode: 'STD-FLEX', rate: 100 }] },
    ]);
  });

  it('fin de semana: el canal ve los viernes/sábados más caros, noche a noche', () => {
    // 2026-09-11 viernes, 12 sábado, 13 domingo: +20% solo en el fin de semana.
    const updates = buildRateUpdates(
      [
        {
          id: 'u1',
          roomCode: 'STD',
          tarifaBase: null,
          ratePlans: [{ codigo: 'STD-FLEX', tarifa: 100, finDeSemana: { dias: [5, 6], porcentaje: 20 } }],
        },
      ],
      day('2026-09-11'),
      day('2026-09-14')
    );
    expect(updates).toEqual([
      { startDate: '2026-09-11', endDate: '2026-09-12', rates: [{ roomCode: 'STD', rateplanCode: 'STD-FLEX', rate: 120 }] },
      { startDate: '2026-09-13', endDate: '2026-09-13', rates: [{ roomCode: 'STD', rateplanCode: 'STD-FLEX', rate: 100 }] },
    ]);
  });

  it('sin tarifa base no empuja tarifas (no inventar precios)', () => {
    const units = [{ id: 'u1', roomCode: 'executive', tarifaBase: null }];
    expect(buildRateUpdates(units, day('2026-09-10'), day('2026-09-11'))).toEqual([]);
  });

  it('ignora unidades sin roomCode', () => {
    const units = [
      { id: 'u1', roomCode: null, tarifaBase: 100 },
      { id: 'u2', roomCode: 'executive', tarifaBase: 200 },
    ];
    const updates = buildRateUpdates(units, day('2026-09-10'), day('2026-09-11'));
    expect(updates[0].rates).toEqual([{ roomCode: 'executive', rateplanCode: 'executive', rate: 200 }]);
  });

  /**
   * Caso real (Ciudad Patio Cuarenta, hotel 75fdbbce2e, 9-oct 2026): la unidad
   * aún no tenía planes de tarifa, así que el respaldo empujó la tarifa base
   * bajo el ROOMCODE (`rateplanCode: "2b"`) y el proveedor la descartó con
   * `INVALID_RATEPLAN_CODE : 2b` — sin que nada lo dijera. El roomCode no es un
   * código de tarifa: si el hotel ya vinculó uno contra el catálogo, es ese.
   */
  it('sin planes, la tarifa base viaja bajo el código de tarifa VINCULADO (no bajo el roomCode)', () => {
    const units = [
      { id: 'u1', roomCode: '2b', tarifaBase: 120, rateplanCodeMapeado: '2b-d-ep' },
    ];
    const updates = buildRateUpdates(units, day('2026-10-09'), day('2026-10-11'));

    expect(updates).toEqual([
      { startDate: '2026-10-09', endDate: '2026-10-10', rates: [{ roomCode: '2b', rateplanCode: '2b-d-ep', rate: 120 }] },
    ]);
  });

  it('un plan de tarifa propio sigue mandando sobre el código vinculado', () => {
    const units = [
      {
        id: 'u1',
        roomCode: '2b',
        tarifaBase: 120,
        rateplanCodeMapeado: '2b-d-ep',
        ratePlans: [{ codigo: '2b-s-ep', tarifa: 99 }],
      },
    ];
    const updates = buildRateUpdates(units, day('2026-10-09'), day('2026-10-11'));

    expect(updates[0].rates).toEqual([{ roomCode: '2b', rateplanCode: '2b-s-ep', rate: 99 }]);
  });
});

// ─── Restricciones de venta (§5): forma exacta del contrato ───────────────

describe('buildInventoryRestrictions (Inventory Restrictions POST)', () => {
  it('payload con la forma exacta del contrato (todos los campos, opcionales en null)', () => {
    const units = [
      { roomCode: 'SUITE', estado: 'available', ratePlans: [{ minNoches: 2, maxNoches: 7 }] },
    ];
    const byDay = [
      { fecha: '2026-09-10', rooms: [{ roomCode: 'SUITE', available: 3 }] },
      { fecha: '2026-09-11', rooms: [{ roomCode: 'SUITE', available: 3 }] },
    ];

    expect(buildInventoryRestrictions(units, byDay)).toEqual([
      {
        startDate: '2026-09-10',
        endDate: '2026-09-11',
        rooms: [
          {
            roomCode: 'SUITE',
            available: 3,
            restrictions: {
              stopSell: false,
              exactStayArrival: null,
              maximumStayArrival: null,
              minimumAdvanceReservation: null,
              minimumStay: 2,
              closeOnArrival: false,
              minimumStayArrival: null,
              maximumStay: 7,
              maximumAdvanceReservation: null,
              closeOnDeparture: false,
            },
          },
        ],
      },
    ]);
  });

  it('marca stopSell cuando TODAS las unidades del tipo están fuera de servicio', () => {
    const units = [{ roomCode: 'SUITE', estado: 'maintenance', ratePlans: [] }];
    const byDay = [{ fecha: '2026-09-10', rooms: [] }];

    const rooms = buildInventoryRestrictions(units, byDay)[0].rooms;
    expect(rooms).toEqual([
      { roomCode: 'SUITE', available: 0, restrictions: expect.objectContaining({ stopSell: true }) },
    ]);
  });

  it('no cierra el tipo si al menos una unidad sigue vendible', () => {
    const units = [
      { roomCode: 'SUITE', estado: 'maintenance', ratePlans: [] },
      { roomCode: 'SUITE', estado: 'available', ratePlans: [] },
    ];
    const byDay = [{ fecha: '2026-09-10', rooms: [{ roomCode: 'SUITE', available: 1 }] }];

    const rooms = buildInventoryRestrictions(units, byDay)[0].rooms;
    expect(rooms[0].restrictions.stopSell).toBe(false);
    expect(rooms[0].available).toBe(1);
  });

  it('toma la estancia mínima más permisiva entre los planes activos', () => {
    const units = [
      { roomCode: 'SUITE', estado: 'available', ratePlans: [{ minNoches: 3 }, { minNoches: 1 }] },
    ];
    const byDay = [{ fecha: '2026-09-10', rooms: [{ roomCode: 'SUITE', available: 1 }] }];

    const rooms = buildInventoryRestrictions(units, byDay)[0].rooms;
    expect(rooms[0].restrictions.minimumStay).toBe(1);
    expect(rooms[0].restrictions.maximumStay).toBeNull();
  });

  it('devuelve array vacío sin días o sin unidades con mapping', () => {
    expect(buildInventoryRestrictions([], [])).toEqual([]);
    expect(
      buildInventoryRestrictions(
        [{ roomCode: null, estado: 'available', ratePlans: [] }],
        [{ fecha: '2026-09-10', rooms: [] }]
      )
    ).toEqual([]);
  });
});

describe('buildRateRestrictions (Rate Restrictions POST)', () => {
  it('payload con la forma exacta del contrato', () => {
    const units = [
      {
        roomCode: 'EXECUTIVE',
        ratePlans: [
          { codigo: 'EXECUTIVE-S-101', minNoches: 1, maxNoches: null, checkInDias: null, checkOutDias: null },
        ],
      },
    ];

    const updates = buildRateRestrictions(units, day('2026-02-22'), day('2026-02-25'));
    expect(updates).toEqual([
      {
        startDate: '2026-02-22',
        endDate: '2026-02-24',
        rates: [
          {
            roomCode: 'EXECUTIVE',
            rateplanCode: 'EXECUTIVE-S-101',
            restrictions: {
              stopSell: false,
              exactStayArrival: null,
              maximumStayArrival: null,
              minimumAdvanceReservation: null,
              minimumStay: 1,
              closeOnArrival: false,
              minimumStayArrival: null,
              maximumStay: null,
              maximumAdvanceReservation: null,
              closeOnDeparture: false,
            },
          },
        ],
      },
    ]);
  });

  it('expresa los días de check-in permitidos como closeOnArrival y segmenta el rango', () => {
    const units = [
      {
        roomCode: 'SUITE',
        ratePlans: [
          { codigo: 'SUITE-FLEX', minNoches: 2, maxNoches: 5, checkInDias: [5], checkOutDias: [] },
        ],
      },
    ];
    // 2026-09-10 = jueves, 09-11 = viernes, 09-12 = sábado
    const updates = buildRateRestrictions(units, day('2026-09-10'), day('2026-09-13'));
    expect(
      updates.map((u) => [u.startDate, u.endDate, u.rates[0].restrictions.closeOnArrival])
    ).toEqual([
      ['2026-09-10', '2026-09-10', true],
      ['2026-09-11', '2026-09-11', false],
      ['2026-09-12', '2026-09-12', true],
    ]);
    expect(updates[0].rates[0].restrictions).toMatchObject({ minimumStay: 2, maximumStay: 5 });
  });

  it('sin planes de tarifa no empuja restricciones (no inventar)', () => {
    const units = [{ roomCode: 'SUITE', ratePlans: [] }];
    expect(buildRateRestrictions(units, day('2026-09-10'), day('2026-09-11'))).toEqual([]);
  });
});