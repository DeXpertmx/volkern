/**
 * OPTIMIZE ENERGY SKILL — MCP skill implementation.
 *
 * Enrutado por el array `MCP_TOOLS` de `lib/mcp/mcp-handler.ts`
 * mediante la entrada `optimize_energy_consumption`. Su función es
 * un wrapper que consume `AnalyticsService.detectOversizedScenario` y
 * presenta el veredicto en formato sugerido por el README de MCP.
 *
 * Patrón: igual que `lib/mcp/skills/internalMessageSkill.ts` — función
 * async exportada, sin class. Esto se alinea con los demás skills
 * que `lib/skills/index.ts` re-exporta.
 */
import { AnalyticsService } from '../optimize-energy/analytics-service';

export async function optimizeEnergyConsumption(params: {
  tenantId: string;
  /** Threshold opcional para personalizar el "oversized". */
  thresholdRatio?: number;
}) {
  if (!params?.tenantId) {
    return {
      optimized: false,
      recommendation: 'MISSING_TENANT',
      alerts: ['tenantId es requerido para optimize_energy_consumption'],
    };
  }

  const verdict = await AnalyticsService.detectOversizedScenario({
    tenantId: params.tenantId,
    thresholdRatio: params.thresholdRatio,
  });

  // `detectOversizedScenario` puede devolver Infinity/NaN si availableLoad===0
  // y rows.length===0. Serialize defensivo para que el LLM nunca reciba null.
  const safe = (v: number) => Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;

  return {
    optimized: !verdict.isOversized,
    recommendation: verdict.isOversized
      ? 'REDUCE_LOAD_OR_INCREASE_CONTRACTED_CAPACITY'
      : 'WITHIN_LIMITS',
    tenantId: verdict.tenantId,
    thresholdRatio: verdict.thresholdRatio,
    metrics: {
      peakActualLoad: safe(verdict.peakActualLoad),
      avgActualLoad: safe(verdict.avgActualLoad),
      availableLoad: safe(verdict.availableLoad),
    },
    alerts: verdict.alerts,
  };
}
