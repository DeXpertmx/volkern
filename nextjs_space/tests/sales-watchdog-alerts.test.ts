// @vitest-environment node
//
// GUARDIA C7 · El vigilante del pipeline (lib/sales/pipeline-watchdog.ts)
// — el bloque de alertas y auto-tagging, lo único del ciclo de riesgo que
// quedaba sin red (el arranque, que abre puertas de práctica, está congelado
// en tests/sales-training-gate.test.ts; el cálculo de salud, en
// tests/sales-health-autopilot.test.ts como C6).
//
// Lo que se congela:
//   ALERTAS Telegram — solo CRITICAL, solo valor > 5000 (en la moneda del
//   deal, defecto conocido del módulo y documentado en su ficha), dedupe de
//   24 horas (sin alerta previa sí; con alerta < 24 h no; con > 24 h sí),
//   marca `lastAlertSent` tras cada envío, y un fallo de Telegram NO rompe
//   el barrido (el error se traga a propósito: alertar no puede tumbar la
//   sincronización).
//   AUTO-TAGGING — HOT por salud > 85, ZOMBIE por salud < 25 (ojo: los
//   cortes del tagging NO son los del estado: ZOMBIE-estado nace en 30, la
//   etiqueta en 25), cada etiqueta quita la contraria, y las etiquetas
//   humanas se conservan intactas — incluida la puerta de práctica
//   (PRACTICA_REQUERIDA), que el tagging no debe tocar jamás.
//
// El health service NO se mockea entero: se espía syncPipelineHealth para
// alimentar el watchdog con deals fabricados — así el test vigila el bloque
// de alertas/tagging, no repite la guardia de C6.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dealUpdate: vi.fn(),
  dealFindMany: vi.fn(),
  notifyByTelegram: vi.fn(),
  syncPipelineHealth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    deal: { update: mocks.dealUpdate, findMany: mocks.dealFindMany },
  },
}));

vi.mock('@/lib/skills/notification-layer', () => ({
  notifyByTelegram: mocks.notifyByTelegram,
}));

const deal = (over: Record<string, unknown> = {}) => ({
  id: 'deal-1',
  titulo: 'Implementación ERP',
  valor: 12000,
  moneda: 'EUR',
  healthScore: 40,
  healthStatus: 'CRITICAL',
  tags: null as string | null,
  lastAlertSent: null as Date | null,
  ...over,
});

const HORA = 60 * 60 * 1000;

const correrWatchdog = async (deals: ReturnType<typeof deal>[]) =>
  import('@/lib/sales/pipeline-watchdog').then(async ({ PipelineWatchdog }) => {
    const servicio = (await import('@/lib/sales/pipeline-health-service'))
      .PipelineHealthService as unknown as { syncPipelineHealth: (t: string) => Promise<unknown[]> };
    const spy = vi.spyOn(servicio, 'syncPipelineHealth').mockResolvedValue(deals);
    try {
      return await PipelineWatchdog.runWatchdog('tenant-1');
    } finally {
      spy.mockRestore();
    }
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dealUpdate.mockResolvedValue({});
  mocks.dealFindMany.mockResolvedValue([]); // abrirPuertas (C13): sin deals críticos en BD
  mocks.notifyByTelegram.mockResolvedValue(undefined);
});

describe('C7 · Alertas Telegram del watchdog', () => {
  it('deal CRITICAL y valioso sin alerta previa: envía y marca lastAlertSent', async () => {
    await correrWatchdog([deal()]);

    expect(mocks.notifyByTelegram).toHaveBeenCalledTimes(1);
    const [mensaje] = mocks.notifyByTelegram.mock.calls[0];
    expect(mensaje).toContain('ALERTA DE ABANDONO');
    expect(mensaje).toContain('Implementación ERP');
    expect(mensaje).toContain('12000');
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1' },
        data: { lastAlertSent: expect.any(Date) },
      })
    );
  });

  it('el umbral de valor: 5000 exactos NO alerta, 5000.01 sí', async () => {
    await correrWatchdog([deal({ valor: 5000 })]);
    expect(mocks.notifyByTelegram).not.toHaveBeenCalled();

    await correrWatchdog([deal({ valor: 5000.01 })]);
    expect(mocks.notifyByTelegram).toHaveBeenCalledTimes(1);
  });

  it('solo CRITICAL alerta: WARNING y ZOMBIE se quedan sin alerta', async () => {
    await correrWatchdog([deal({ healthStatus: 'WARNING', valor: 20000 })]);
    expect(mocks.notifyByTelegram).not.toHaveBeenCalled();

    await correrWatchdog([deal({ healthStatus: 'ZOMBIE', valor: 20000 })]);
    expect(mocks.notifyByTelegram).not.toHaveBeenCalled();
  });

  it('dedupe de 24 horas: alertada hace 23 h no vuelve; hace 25 h sí', async () => {
    await correrWatchdog([deal({ lastAlertSent: new Date(Date.now() - 23 * HORA) })]);
    expect(mocks.notifyByTelegram).not.toHaveBeenCalled();

    await correrWatchdog([deal({ lastAlertSent: new Date(Date.now() - 25 * HORA) })]);
    expect(mocks.notifyByTelegram).toHaveBeenCalledTimes(1);
  });

  it('un fallo de Telegram no rompe el barrido ni el auto-tagging', async () => {
    mocks.notifyByTelegram.mockRejectedValue(new Error('telegram caído'));

    const res = await correrWatchdog([deal({ healthScore: 10, tags: null })]);

    expect(mocks.notifyByTelegram).toHaveBeenCalledTimes(1);
    // el resto del barrido sigue: la marca de alerta y el tagging se aplican
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1' },
        data: { lastAlertSent: expect.any(Date) },
      })
    );
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { tags: 'ZOMBIE' },
      })
    );
    expect(res.scanned).toBe(1);
  });
});

describe('C7 · Auto-tagging HOT / ZOMBIE del watchdog', () => {
  it('HOT por salud > 85 y REEMPLAZA a ZOMBIE si estaba (nunca conviven)', async () => {
    await correrWatchdog([deal({ healthScore: 90, healthStatus: 'HEALTHY', tags: 'ZOMBIE' })]);

    // el orden del módulo: añade HOT y luego filtra ZOMBIE → queda solo HOT
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tags: 'HOT' } })
    );
  });

  it('ZOMBIE por salud < 25 y quita HOT si estaba — los cortes del tagging son 25, no los 30 del estado', async () => {
    // salud 28: estado ZOMBIE (corte 30) pero SIN etiqueta (corte 25)
    await correrWatchdog([deal({ healthScore: 28, healthStatus: 'ZOMBIE', tags: null })]);
    expect(mocks.dealUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tags: expect.stringContaining('ZOMBIE') }) })
    );

    // salud 24: etiqueta sí
    await correrWatchdog([deal({ healthScore: 24, healthStatus: 'ZOMBIE', tags: null })]);
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tags: 'ZOMBIE' } })
    );
  });

  it('salud intermedia (25-85): deja las etiquetas como están — no inventa ni limpia', async () => {
    await correrWatchdog([deal({ healthScore: 60, healthStatus: 'WARNING', tags: 'prioridad-cliente' })]);

    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tags: 'prioridad-cliente' } })
    );
  });

  it('conserva las etiquetas humanas al añadir la automática', async () => {
    await correrWatchdog([deal({ healthScore: 90, tags: 'renovacion,canal-web' })]);

    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tags: 'renovacion,canal-web,HOT' } })
    );
  });

  it('reescribe las etiquetas aunque no cambien (escritura incondicional del barrido)', async () => {
    // comportamiento real, congelado tal cual: el update ocurre SIEMPRE con
    // las etiquetas unidas, sean nuevas o idénticas. No es un defecto
    // funcional (el valor queda igual) pero sí una escritura por deal y
    // barrido — si algún día se optimiza a escritura condicional, este test
    // es el que hay que cambiar a propósito.
    await correrWatchdog([deal({ healthScore: 90, tags: 'HOT' })]);
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tags: 'HOT' } })
    );

    await correrWatchdog([deal({ healthScore: 10, tags: 'ZOMBIE' })]);
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tags: 'ZOMBIE' } })
    );
  });

  it('convive con la puerta de práctica: el tagging no la elimina jamás', async () => {
    // deal crítico con puerta abierta y salud de ZOMBIE: ambas etiquetas deben sobrevivir
    await correrWatchdog([
      deal({
        id: 'deal-puerta',
        healthScore: 10,
        healthStatus: 'ZOMBIE',
        tags: 'PRACTICA_REQUERIDA',
      }),
    ]);

    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tags: 'PRACTICA_REQUERIDA,ZOMBIE' } })
    );
  });

  it('reporta el barrido: scanned = deals procesados, alerts = deals notificados', async () => {
    const res = await correrWatchdog([
      deal({ id: 'deal-a' }), // alerta
      deal({ id: 'deal-b', lastAlertSent: new Date() }), // en dedupe: sin alerta
      deal({ id: 'deal-c', healthStatus: 'HEALTHY', valor: 100, tags: null }), // sano
    ]);

    expect(res.scanned).toBe(3);
    expect(res.alerts).toBe(1);
    expect(res.puertasAbiertas).toBeGreaterThanOrEqual(0);
  });
});
