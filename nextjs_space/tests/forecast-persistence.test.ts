import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests de los helpers de persistencia del forecast, extraídos de los GET de
 * /api/insurance/portfolio/forecast. Se mockea @/lib/db (vi.hoisted, patrón
 * del proyecto) y se verifican las reglas de idempotencia:
 *   · persistForecastLog: upsert por (tenant, mes, sourceVersion) que NO pisa real
 *   · backfillForecastLogs: solo backfillea logs con real NULL
 *   · persistSmartForecastLog: sourceVersion v2-smart-seasonal
 */

const { calls, mockPrisma } = vi.hoisted(() => {
  const calls: Array<{ op: string; args: any }> = [];
  const mockPrisma = {
    poliza: {
      findMany: vi.fn(async () => []),
    },
    portfolioForecastLog: {
      upsert: vi.fn(async (args: any) => {
        calls.push({ op: 'upsert', args });
        return { id: 'log-1', ...(args.create ?? {}) };
      }),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => ({ proyectado: 1000 })),
      update: vi.fn(async (args: any) => {
        calls.push({ op: 'update', args });
        return { id: 'log-1' };
      }),
      create: vi.fn(async (args: any) => {
        calls.push({ op: 'create', args });
        return { id: 'log-smart' };
      }),
    },
  };
  return { calls, mockPrisma };
});

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import {
  persistForecastLog,
  backfillForecastLogs,
  persistSmartForecastLog,
  sumaRealDelMes,
  FORECAST_SOURCE_VERSION,
  SMART_FORECAST_SOURCE_VERSION,
} from '@/lib/insurance/forecast-persistence';

beforeEach(() => {
  calls.length = 0;
  mockPrisma.poliza.findMany.mockResolvedValue([]);
  mockPrisma.portfolioForecastLog.findMany.mockResolvedValue([]);
  mockPrisma.portfolioForecastLog.findUnique.mockResolvedValue({ proyectado: 1000 });
});

describe('persistForecastLog', () => {
  it('hace upsert con la clave compuesta tenant+mes+sourceVersion', async () => {
    const mes = new Date('2026-03-01T00:00:00.000Z');

    await persistForecastLog('tenant-1', {
      mesProyectado: mes,
      proyectado: 15000,
      slope: 100,
      intercepto: 9000,
      r2: 0.82,
      ventanaMeses: 6,
      sourceVersion: FORECAST_SOURCE_VERSION,
    });

    const { args } = calls[0];
    expect(args.where.tenantId_mesProyectado_sourceVersion).toEqual({
      tenantId: 'tenant-1',
      mesProyectado: mes,
      sourceVersion: FORECAST_SOURCE_VERSION,
    });
    expect(args.create.proyectado).toBe(15000);
    expect(args.update.proyectado).toBe(15000);
    // El update NO toca real/errorPct (no pisar logs backfilleados)
    expect(args.update.real).toBeUndefined();
    expect(args.update.errorPct).toBeUndefined();
  });

  it('devuelve null si falla (el log es auditoría, no rompe la respuesta)', async () => {
    mockPrisma.portfolioForecastLog.upsert.mockRejectedValueOnce(new Error('db down'));
    const result = await persistForecastLog('tenant-1', {
      mesProyectado: new Date(),
      proyectado: 1,
      slope: 0,
      intercepto: 1,
      r2: 0,
      ventanaMeses: 6,
      sourceVersion: FORECAST_SOURCE_VERSION,
    });
    expect(result).toBeNull();
  });
});

describe('backfillForecastLogs', () => {
  it('solo procesa logs con real NULL y persiste real+errorPct+backfilledEn', async () => {
    const mesPasado = new Date('2026-01-01T00:00:00.000Z');
    mockPrisma.portfolioForecastLog.findMany.mockResolvedValue([
      { id: 'log-pasado', mesProyectado: mesPasado },
    ]);
    mockPrisma.poliza.findMany.mockResolvedValue([{ primaAnual: 12000, moneda: 'MXN' }]);

    const count = await backfillForecastLogs('tenant-1', 'MXN');

    expect(count).toBe(1);
    // findMany filtró por mesProyectado < ahora y real: null (idempotencia)
    const findArgs = mockPrisma.portfolioForecastLog.findMany.mock.calls[0][0];
    expect(findArgs.where.tenantId).toBe('tenant-1');
    expect(findArgs.where.real).toBeNull();
    const upd = calls.find(c => c.op === 'update')!;
    expect(upd.args.where.id).toBe('log-pasado');
    expect(Number(upd.args.data.real)).toBeCloseTo(12000, 2);
    // errorPct = |1000 - 12000| / 1000 * 100 = 1100 (proyectado mock = 1000)
    expect(Number(upd.args.data.errorPct)).toBeCloseTo(1100, 2);
    expect(upd.args.data.backfilledEn).toBeInstanceOf(Date);
  });

  it('no backfillea nada cuando no hay logs pendientes (devuelve 0)', async () => {
    const count = await backfillForecastLogs('tenant-1', 'MXN');
    expect(count).toBe(0);
  });

  it('es idempotente: los logs ya backfilleados (real NOT NULL) quedan fuera', async () => {
    await backfillForecastLogs('tenant-1', 'MXN');
    await backfillForecastLogs('tenant-1', 'MXN');
    expect(calls.filter(c => c.op === 'update')).toHaveLength(0);
  });
});

describe('persistSmartForecastLog', () => {
  it('crea el log con sourceVersion v2-smart-seasonal', async () => {
    const mes = new Date('2026-03-01T00:00:00.000Z');

    await persistSmartForecastLog('tenant-1', {
      mesProyectado: mes,
      proyectado: 16000,
      slope: 100,
      intercepto: 9000,
      r2: 0.8,
    });

    const { args } = calls[0];
    expect(args.data.tenantId).toBe('tenant-1');
    expect(args.data.sourceVersion).toBe(SMART_FORECAST_SOURCE_VERSION);
    expect(args.data.proyectado).toBe(16000);
    expect(args.data.backfilledEn).toBeNull();
  });
});

describe('sumaRealDelMes', () => {
  it('convierte cada póliza a la moneda del tenant antes de sumar', async () => {
    mockPrisma.poliza.findMany.mockResolvedValue([
      { primaAnual: 1000, moneda: 'USD' }, // 1000 USD = 17000 MXN (rate 17)
      { primaAnual: 5000, moneda: 'MXN' },
    ]);

    const total = await sumaRealDelMes('tenant-1', new Date('2026-01-01'), 'MXN');
    expect(total).toBeGreaterThan(21000);
  });
});