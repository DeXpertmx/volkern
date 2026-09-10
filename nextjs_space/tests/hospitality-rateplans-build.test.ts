import { describe, it, expect } from 'vitest';

/**
 * buildRateUpdates debe empujar las tarifas de los rate plans ACTIVOS de cada
 * unidad (plan maestro §15.2) y caer a tarifaBase solo cuando no hay planes.
 */

// NOTA: este archivo NO mockea lib/hospitality/sync para usar el real.
import { buildRateUpdates } from '../lib/hospitality/sync';

describe('buildRateUpdates usa los rate plans de la unidad', () => {
  it('empuja un rate por plan activo con su rateplanCode', () => {
    const start = new Date('2026-09-10T00:00:00');
    const end = new Date('2026-09-15T00:00:00');
    const updates = buildRateUpdates(
      [
        {
          id: 'u1',
          roomCode: 'SO-1',
          tarifaBase: 2500,
          ratePlans: [
            { codigo: 'RP-STD', tarifa: 2500 },
            { codigo: 'RP-WE', tarifa: 3200 },
          ],
        },
      ],
      start,
      end
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].rates).toHaveLength(2);
    expect(updates[0].rates[0]).toEqual({ roomCode: 'SO-1', rateplanCode: 'RP-STD', rate: 2500 });
    expect(updates[0].rates[1]).toEqual({ roomCode: 'SO-1', rateplanCode: 'RP-WE', rate: 3200 });
  });

  it('cae a tarifaBase cuando la unidad no tiene planes', () => {
    const updates = buildRateUpdates(
      [{ id: 'u1', roomCode: 'SO-1', tarifaBase: 1800, ratePlans: [] }],
      new Date('2026-09-10T00:00:00'),
      new Date('2026-09-15T00:00:00')
    );
    expect(updates[0].rates).toEqual([{ roomCode: 'SO-1', rateplanCode: 'SO-1', rate: 1800 }]);
  });

  it('ignora planes sin tarifa positiva', () => {
    const updates = buildRateUpdates(
      [
        {
          id: 'u1',
          roomCode: 'SO-1',
          tarifaBase: 2000,
          ratePlans: [
            { codigo: 'RP-0', tarifa: 0 },
            { codigo: 'RP-OK', tarifa: 2600 },
          ],
        },
      ],
      new Date('2026-09-10T00:00:00'),
      new Date('2026-09-15T00:00:00')
    );
    expect(updates[0].rates).toEqual([{ roomCode: 'SO-1', rateplanCode: 'RP-OK', rate: 2600 }]);
  });

  it('sin roomCode ni tarifa → sin updates (no inventa precios)', () => {
    const updates = buildRateUpdates(
      [{ id: 'u1', roomCode: null, tarifaBase: null, ratePlans: [] }],
      new Date('2026-09-10T00:00:00'),
      new Date('2026-09-15T00:00:00')
    );
    expect(updates).toEqual([]);
  });

  it('unidades con roomCode pero sin tarifa ni planes → sin updates', () => {
    const updates = buildRateUpdates(
      [{ id: 'u1', roomCode: 'SO-1', tarifaBase: null, ratePlans: [] }],
      new Date('2026-09-10T00:00:00'),
      new Date('2026-09-15T00:00:00')
    );
    expect(updates).toEqual([]);
  });
});