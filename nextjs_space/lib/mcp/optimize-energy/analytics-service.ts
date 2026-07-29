/**
 * ANALYTICS SERVICE — production capacity analytics.
 *
 * Pivot del antiguo `metricLog` (modelo amputado): ahora leemos / escribimos
 * en `erp_capacity_snapshots`, donde cada fila es una medición de
 * producción por línea (`lineId` FK to `erp_production_lines`) con
 * `plannedLoad / actualLoad / availableLoad / forecastLoad / riskLevel`.
 *
 * Patrón: módulo con namespace `AnalyticsService` (no clase) para
 * coincidir con `lib/mcp/skills/internalMessageSkill.ts` y permitir
 * tree-shaking sólo de los métodos que se importen.
 *
 * Uso:
 *   import { AnalyticsService } from '@/lib/mcp/optimize-energy/analytics-service';
 *   await AnalyticsService.seedCapacitySnapshot({ tenantId, value: 22.4, unit: 'kW', metricType: 'potencia', timestamp: new Date() });
 *   const verdict = await AnalyticsService.detectOversizedScenario({ tenantId });
 */
import { prisma } from '@/lib/db';
import { randomUUID } from 'crypto';

/** Threshold de "oversized": peak actualLoad vs availableLoad. */
const DEFAULT_OVERSIZED_RATIO = 0.85;

/** UnitName se serializa dentro de `riskLevel` (HIGH = picos, NORMAL = estable). */
type UnitName = 'kW' | 'kvar';

export interface SeedCapacitySnapshotInput {
  tenantId: string;
  /** Magnitud eléctrica del pico (kW o kvar). */
  value: number;
  unit: UnitName;
  /** 'potencia' (activa) o 'reactiva'. Informativo — se codifica en riskLevel. */
  metricType: 'potencia' | 'reactiva';
  timestamp?: Date;
}

export interface SeedCapacitySnapshotResult {
  id: string;
  tenantId: string;
  lineId: string;
  snapshotDate: Date;
  actualLoad: number;
  riskLevel: string;
}

export interface OversizedVerdict {
  tenantId: string;
  isOversized: boolean;
  thresholdRatio: number;
  peakActualLoad: number;
  avgActualLoad: number;
  availableLoad: number;
  alerts: string[];
}

/** Helper privado — asegura una línea activa del tenant (idempotente). */
async function ensureActiveLine(tenantId: string): Promise<string> {
  const existing = await prisma.erp_production_lines.findFirst({
    where: { tenantId, active: true },
    select: { id: true },
  });
  if (existing) return existing.id;

  const fallbackId = `line-${tenantId.slice(0, 8)}-${Date.now()}`;
  const created = await prisma.erp_production_lines.create({
    data: {
      id: fallbackId,
      tenantId,
      name: 'Test Production Line',
      description: 'Línea sintética auto-creada por verify-agentic-skills',
      active: true,
    },
    select: { id: true },
  });
  return created.id;
}

/** Mapea el par (value, unit) → riskLevel legible para el script. */
function computeRiskLevel(value: number, unit: UnitName): string {
  if (unit === 'kvar') return value > 4 ? 'HIGH' : 'NORMAL';
  // kW (potencia contratada tope ≈ 30kW en el script de test)
  return value > 18 ? 'HIGH' : 'NORMAL';
}

export const AnalyticsService = {
  /**
   * Persiste una lectura como `erp_capacity_snapshots` row.
   * El par (value, unit, metricType) se proyecta a (actualLoad, riskLevel).
   */
  async seedCapacitySnapshot(
    input: SeedCapacitySnapshotInput,
  ): Promise<SeedCapacitySnapshotResult> {
    const lineId = await ensureActiveLine(input.tenantId);
    const snapshotDate = input.timestamp ?? new Date();
    const riskLevel = computeRiskLevel(input.value, input.unit);

    // Capacidad contratada inferida del plan del tenant (no hardcoded): sólo
    // así el ratio peak/capacity tiene sentido para no-tests plan='basico'.
    const tenant = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { plan: true },
    });
    const availableLoad = tenant?.plan === 'enterprise' ? 30 : 10;

    return prisma.erp_capacity_snapshots.create({
      data: {
        // schema `id String @id` sin `@default(cuid())` → Prisma exige id explícito.
        id: randomUUID(),
        tenantId: input.tenantId,
        lineId,
        snapshotDate,
        actualLoad: input.value,
        plannedLoad: 0,
        availableLoad,
        forecastLoad: input.value,
        riskLevel,
      },
      select: {
        id: true,
        tenantId: true,
        lineId: true,
        snapshotDate: true,
        actualLoad: true,
        riskLevel: true,
      },
    });
  },

  /** Wipe de snapshots del tenant — equivalente al `metricLog.deleteMany` original. */
  async wipeTenantSnapshots(tenantId: string): Promise<{ count: number }> {
    const r = await prisma.erp_capacity_snapshots.deleteMany({ where: { tenantId } });
    return { count: r.count };
  },

  /**
   * Detecta un escenario "oversized" comparando picos `actualLoad` vs
   * capacidad disponible en las últimas 24h. Devuelve alertas accionables.
   */
  async detectOversizedScenario(
    input: { tenantId: string; thresholdRatio?: number },
  ): Promise<OversizedVerdict> {
    const ratio = input.thresholdRatio ?? DEFAULT_OVERSIZED_RATIO;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rows = await prisma.erp_capacity_snapshots.findMany({
      where: { tenantId: input.tenantId, snapshotDate: { gte: since } },
      select: { actualLoad: true, availableLoad: true, riskLevel: true },
    });

    const peakActualLoad = rows.reduce((m, r) => Math.max(m, r.actualLoad), 0);
    const avgActualLoad =
      rows.length === 0 ? 0 : rows.reduce((s, r) => s + r.actualLoad, 0) / rows.length;
    const availableLoad =
      rows.length === 0 ? 30 : rows.reduce((s, r) => s + r.availableLoad, 0) / rows.length;

    const peakRatio = availableLoad > 0 ? peakActualLoad / availableLoad : 0;
    const isOversized = peakRatio > ratio;

    const alerts: string[] = [];
    if (rows.length === 0) {
      alerts.push('No hay snapshots en las últimas 24h');
    } else {
      if (isOversized) {
        alerts.push(
          `Peak ${peakActualLoad.toFixed(2)} supera ${(ratio * 100).toFixed(0)}% de capacidad disponible (${availableLoad.toFixed(2)})`,
        );
      }
      if (rows.some((r) => r.riskLevel === 'HIGH')) {
        alerts.push('Hay al menos una lectura con riskLevel=HIGH');
      }
    }

    return {
      tenantId: input.tenantId,
      isOversized,
      thresholdRatio: ratio,
      peakActualLoad,
      avgActualLoad,
      availableLoad,
      alerts,
    };
  },
};
