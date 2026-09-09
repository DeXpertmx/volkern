import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  unitOccupiedOnDay,
  unitAvailability,
  availabilityByRoomCode,
} from '../lib/hospitality/availability';
import { buildInventoryUpdates, buildRateUpdates } from '../lib/hospitality/sync';

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
});