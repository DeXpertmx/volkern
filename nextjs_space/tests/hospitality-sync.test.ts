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
  horizonteDeTemporadas,
  HORIZONTE_PUSH_MAX_DIAS,
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

  it('reglas de temporada: mín/máx por fecha de llegada y días efectivos, sin duplicar las del plan', () => {
    // Temporada el 11-12 sep: de 3 a 5 noches y solo entradas del sábado (6) y
    // salidas del domingo (0). El plan no cierra ningún día.
    const units = [
      {
        roomCode: 'SUITE',
        ratePlans: [
          {
            codigo: 'SUITE-FLEX',
            minNoches: 1,
            maxNoches: null,
            checkInDias: null,
            checkOutDias: null,
            temporadas: [
              {
                desde: '2026-09-11',
                hasta: '2026-09-12',
                tarifa: 200,
                minNoches: 3,
                maxNoches: 5,
                checkInDias: [6],
                checkOutDias: [0],
              },
            ],
          },
        ],
      },
    ];

    // 2026-09-10 = jueves, 09-11 = viernes, 09-12 = sábado.
    const updates = buildRateRestrictions(units, day('2026-09-10'), day('2026-09-13'));
    expect(
      updates.map((u) => [
        u.startDate,
        u.endDate,
        u.rates[0].restrictions.minimumStayArrival,
        u.rates[0].restrictions.maximumStayArrival,
        u.rates[0].restrictions.closeOnArrival,
        u.rates[0].restrictions.closeOnDeparture,
      ])
    ).toEqual([
      ['2026-09-10', '2026-09-10', null, null, false, false],
      ['2026-09-11', '2026-09-11', 3, 5, true, true],
      ['2026-09-12', '2026-09-12', 3, 5, false, true],
    ]);
    // Las reglas generales del plan siguen viajando en SUS campos: no se
    // duplican ni se sustituyen (fuera de temporada el canal no recibe un
    // mínimo, un máximo ni un cierre que el hotel no configuró).
    expect(updates[0].rates[0].restrictions.minimumStay).toBe(1);
    expect(updates[1].rates[0].restrictions.minimumStay).toBe(1);
    expect(updates[1].rates[0].restrictions.maximumStay).toBeNull();
  });

  it('sin planes de tarifa no empuja restricciones (no inventar)', () => {
    const units = [{ roomCode: 'SUITE', ratePlans: [] }];
    expect(buildRateRestrictions(units, day('2026-09-10'), day('2026-09-11'))).toEqual([]);
  });

  it('un plan con el MISMO código que el vínculo viaja una sola vez, y viaja también en restricciones', () => {
    // Es la forma real de las cuatro unidades de Ciudad Patio Cuarenta: cada una
    // con su plan, y el código del plan ES el código de tarifa vinculado
    // (`1a-d-ep`). Empuja un solo par de tarifa —el plan manda sobre el respaldo
    // del vínculo, no se suman— y con él viajan las restricciones de esa unidad:
    // una unidad sin plan se quedaba fuera del push de restricciones.
    const units = [
      {
        id: 'u1',
        roomCode: '1a',
        tarifaBase: 120,
        rateplanCodeMapeado: '1a-d-ep',
        ratePlans: [{ codigo: '1a-d-ep', tarifa: 120 }],
      },
    ];
    expect(buildRateUpdates(units, day('2026-10-14'), day('2026-10-16'))).toEqual([
      {
        startDate: '2026-10-14',
        endDate: '2026-10-15',
        rates: [{ roomCode: '1a', rateplanCode: '1a-d-ep', rate: 120 }],
      },
    ]);

    const restricciones = buildRateRestrictions(
      [{ roomCode: '1a', ratePlans: [{ codigo: '1a-d-ep', minNoches: 2 }] }],
      day('2026-10-14'),
      day('2026-10-16')
    );
    const pares = restricciones.flatMap((u) => u.rates.map((r) => `${r.roomCode}/${r.rateplanCode}`));
    expect(new Set(pares)).toEqual(new Set(['1a/1a-d-ep']));
    expect(restricciones[0].rates[0].restrictions.minimumStay).toBe(2);
  });
});

describe('el rateplanCode de un plan: el suyo, el del vínculo, o ninguno', () => {
  // Caso real (hotel `75fdbbce2e`, 14-oct-2026): la `Tarifa 2A` se creó sin
  // código y el push mandó `cmv877haz0072us01nb0np80t` —su cuid interno— como
  // `rateplanCode`; el proveedor lo descartó con `INVALID_RATEPLAN_CODE` y el
  // mensaje que leía el hotel le pedía «activar en su extranet» ese id.
  const ID_INTERNO = 'cmv877haz0072us01nb0np80t';
  const unidad = (extra: Record<string, unknown> = {}) => ({
    id: 'u1',
    roomCode: '2a',
    tarifaBase: 120,
    rateplanCodeMapeado: '2a-d-ep',
    ratePlans: [{ codigo: null, tarifa: 120 }],
    ...extra,
  });

  it('un plan sin código viaja con el código VINCULADO de la unidad', () => {
    const updates = buildRateUpdates([unidad()], day('2026-10-14'), day('2026-10-16'));
    expect(updates).toEqual([
      {
        startDate: '2026-10-14',
        endDate: '2026-10-15',
        rates: [{ roomCode: '2a', rateplanCode: '2a-d-ep', rate: 120 }],
      },
    ]);
    expect(JSON.stringify(updates)).not.toContain(ID_INTERNO);
  });

  it('sin código de plan y sin vínculo, esa tarifa NO viaja (no se inventa un código)', () => {
    expect(
      buildRateUpdates([unidad({ rateplanCodeMapeado: null })], day('2026-10-14'), day('2026-10-16'))
    ).toEqual([]);
  });

  it('la tarifa base de una unidad SIN planes conserva su respaldo histórico', () => {
    // No es el caso del plan sin código: aquí no hay ningún plan que etiquetar.
    expect(
      buildRateUpdates(
        [{ id: 'u1', roomCode: '2a', tarifaBase: 120, ratePlans: [] }],
        day('2026-10-14'),
        day('2026-10-16')
      )
    ).toEqual([
      {
        startDate: '2026-10-14',
        endDate: '2026-10-15',
        rates: [{ roomCode: '2a', rateplanCode: '2a', rate: 120 }],
      },
    ]);
  });

  it('un plan con su propio código no lo cambia por el del vínculo', () => {
    const updates = buildRateUpdates(
      [unidad({ ratePlans: [{ codigo: '2a-s-ep', tarifa: 99 }] })],
      day('2026-10-14'),
      day('2026-10-16')
    );
    expect(updates[0].rates).toEqual([
      { roomCode: '2a', rateplanCode: '2a-s-ep', rate: 99 },
    ]);
  });

  it('dos planes que acaban en el MISMO par empujan un solo precio (el primero)', () => {
    // El canal tiene un único número por (habitación, tarifa): mandar dos y que
    // gane el que llegue último sería un precio que el hotel no decidió.
    const updates = buildRateUpdates(
      [
        unidad({
          tarifaBase: null,
          ratePlans: [
            { codigo: null, tarifa: 120 },
            { codigo: null, tarifa: 90 },
          ],
        }),
      ],
      day('2026-10-14'),
      day('2026-10-16')
    );
    expect(updates).toEqual([
      {
        startDate: '2026-10-14',
        endDate: '2026-10-15',
        rates: [{ roomCode: '2a', rateplanCode: '2a-d-ep', rate: 120 }],
      },
    ]);
  });

  it('el plan con estacionalidad sin código usa el del vínculo como clave de su serie', () => {
    const updates = buildRateUpdates(
      [
        unidad({
          tarifaBase: null,
          ratePlans: [
            {
              codigo: null,
              tarifa: 120,
              temporadas: [{ desde: '2026-10-15', hasta: '2026-10-15', tarifa: 140 }],
            },
          ],
        }),
      ],
      day('2026-10-14'),
      day('2026-10-17')
    );
    expect(updates).toEqual([
      { startDate: '2026-10-14', endDate: '2026-10-14', rates: [{ roomCode: '2a', rateplanCode: '2a-d-ep', rate: 120 }] },
      { startDate: '2026-10-15', endDate: '2026-10-15', rates: [{ roomCode: '2a', rateplanCode: '2a-d-ep', rate: 140 }] },
      { startDate: '2026-10-16', endDate: '2026-10-16', rates: [{ roomCode: '2a', rateplanCode: '2a-d-ep', rate: 120 }] },
    ]);
  });

  it('las restricciones de tarifa siguen el mismo criterio', () => {
    const conVinculo = buildRateRestrictions(
      [{ roomCode: '2a', rateplanCodeMapeado: '2a-d-ep', ratePlans: [{ codigo: null, minNoches: 2 }] }],
      day('2026-10-14'),
      day('2026-10-15')
    );
    expect(conVinculo[0].rates).toEqual([
      expect.objectContaining({
        roomCode: '2a',
        rateplanCode: '2a-d-ep',
        restrictions: expect.objectContaining({ minimumStay: 2 }),
      }),
    ]);

    // Sin vínculo tampoco hay restricciones que inventar para esa tarifa.
    expect(
      buildRateRestrictions(
        [{ roomCode: '2a', ratePlans: [{ codigo: null, minNoches: 2 }] }],
        day('2026-10-14'),
        day('2026-10-15')
      )
    ).toEqual([]);
  });
});

describe('horizonteDeTemporadas (el horizonte del push alcanza la temporada configurada)', () => {
  const HOY = day('2026-10-15');
  /** Plan con una temporada, en la forma cruda que llega del Json de la base. */
  const planCon = (desde: string, hasta: string, tarifa = 140) => ({ temporadas: [{ desde, hasta, tarifa }] });

  it('sin temporadas no pide nada: manda el horizonte pedido', () => {
    expect(horizonteDeTemporadas([], HOY)).toEqual({ dias: 0, hasta: null, fueraDelTope: false });
    expect(horizonteDeTemporadas([{ temporadas: null }], HOY)).toEqual({
      dias: 0,
      hasta: null,
      fueraDelTope: false,
    });
  });

  it('la temporada de verano de Ciudad Patio Cuarenta entra en el push (caso real 15-oct-2026)', () => {
    // 17-jun → 31-ago-2027 desde el 15-oct-2026: 320 noches, y el horizonte es
    // EXCLUSIVO, así que hacen falta 321 días para que la última noche entre.
    // Con los 90 del producto (13-ene-2027) y los 180 del panel (13-abr-2027)
    // esa tarifa no viajaba por ninguna vía.
    const h = horizonteDeTemporadas([planCon('2027-06-17', '2027-08-31')], HOY);
    expect(h.dias).toBe(321);
    expect(h.hasta).toBe('2027-08-31');
    expect(h.fueraDelTope).toBe(false);
  });

  it('manda la temporada más lejana de todos los planes', () => {
    const h = horizonteDeTemporadas(
      [planCon('2027-06-17', '2027-08-31'), planCon('2027-12-20', '2028-01-06')],
      HOY
    );
    expect(h.hasta).toBe('2028-01-06');
    // 15-oct-2026 → 6-ene-2028 = 448 noches, +1 para que entre la última.
    expect(h.dias).toBe(449);
  });

  it('una temporada pasada no pide nada (el push no va hacia atrás)', () => {
    expect(horizonteDeTemporadas([planCon('2026-09-01', '2026-09-30')], HOY)).toEqual({
      dias: 0,
      hasta: null,
      fueraDelTope: false,
    });
  });

  it('la temporada que termina hoy pide un día (el horizonte es exclusivo)', () => {
    expect(horizonteDeTemporadas([planCon('2026-10-01', '2026-10-15')], HOY)).toEqual({
      dias: 1,
      hasta: '2026-10-15',
      fueraDelTope: false,
    });
  });

  it('lo que no es una temporada válida no alarga el horizonte', () => {
    // Tarifa 0, rango invertido y un Json que no es una lista: el normalizador
    // los descarta pieza a pieza y ninguno mueve el horizonte — alargarlo por un
    // dato que no existe sería publicar de más por nada.
    expect(
      horizonteDeTemporadas(
        [
          planCon('2027-01-01', '2027-12-31', 0),
          planCon('2027-12-31', '2027-01-01'),
          { temporadas: 'Verano' },
        ],
        HOY
      )
    ).toEqual({ dias: 0, hasta: null, fueraDelTope: false });
  });

  it('un «31 de febrero» que el normalizador deja pasar no alarga el horizonte', () => {
    // `fechaIsoValida` acepta la forma `YYYY-MM-DD` y `new Date('2027-02-31')` no
    // es inválido (rueda al 3 de marzo), así que esa fila sobrevive la
    // normalización; aquí la fecha se comprueba de ida y vuelta (`fechaDeIso`) y
    // un día que no existe no puede mover el horizonte.
    expect(horizonteDeTemporadas([planCon('2027-01-01', '2027-02-31')], HOY)).toEqual({
      dias: 0,
      hasta: null,
      fueraDelTope: false,
    });
  });

  it('se queda en el tope del horizonte de venta, y lo dice', () => {
    const h = horizonteDeTemporadas([planCon('2029-06-01', '2029-08-31')], HOY);
    expect(h.dias).toBe(HORIZONTE_PUSH_MAX_DIAS);
    expect(h.fueraDelTope).toBe(true);
    // El tope es el mismo horizonte de venta que usa el barrido de reservas.
    expect(HORIZONTE_PUSH_MAX_DIAS).toBe(730);
  });

  it('con tope a medida (el tope es parámetro, no una constante escondida)', () => {
    const h = horizonteDeTemporadas([planCon('2027-06-17', '2027-08-31')], HOY, 100);
    expect(h).toEqual({ dias: 100, hasta: '2027-08-31', fueraDelTope: true });
  });
});