/**
 * ADS Jobs — Tareas programadas que encolan jobs en BullMQ
 *
 * CRON jobs configurados:
 *   - ads-sync-campaigns: Cada 1h — Sincronizar estructura de campañas
 *   - ads-sync-insights: Cada 1h — Sincronizar métricas
 *   - ads-sync-full: Cada 6h — Sincronización completa
 *   - ads-watchdog-evaluate: Cada 30min — Evaluar reglas watchdog
 *
 * Estas funciones son invocadas desde el scheduler de Volkern
 * (lib/core/scheduler.ts o similar).
 *
 * @see PLAN_ADS_INTELLIGENCE.md — Fase 3
 */

import { logger } from '@/lib/logger';
import { syncAllPlatforms, syncPlatformFull } from '../sync-engine';
import type { SyncAllResult } from '../sync-engine';

// ─── Tipos de jobs ──────────────────────────────────────────────────

export type AdsJobType = 'ads-sync-campaigns' | 'ads-sync-insights' | 'ads-sync-full' | 'ads-watchdog-evaluate' | 'ads-evaluate-schedules' | 'ads-evaluate-ab-tests';

export interface AdsJobData {
  type: AdsJobType;
  tenantId?: string; // Opcional: si no se especifica, se procesan todos
  platformId?: string;
  timestamp: number;
}

// ─── Handlers ────────────────────────────────────────────────────────

/**
 * Ejecuta una sincronización rápida (solo estructura + últimas 48h insights).
 * Para todos los tenants con plataformas activas.
 */
export async function runSyncCampaigns(tenantId?: string): Promise<SyncAllResult[]> {
  const results: SyncAllResult[] = [];
  const tenants = await getActiveTenants(tenantId);

  for (const tid of tenants) {
    logger.info({ tenantId: tid }, 'CRON: Iniciando sync de campañas');
    const result = await syncAllPlatforms(tid);
    results.push(result);
    logger.info({ tenantId: tid, duration: result.durationMs }, 'CRON: Sync de campañas completado');
  }

  return results;
}

/**
 * Ejecuta sincronización completa (estructura + 30 días de insights).
 */
export async function runFullSync(tenantId?: string): Promise<SyncAllResult[]> {
  const results: SyncAllResult[] = [];
  const tenants = await getActiveTenants(tenantId);

  for (const tid of tenants) {
    logger.info({ tenantId: tid }, 'CRON: Iniciando sync completo ADS');

    const connections = await getActiveConnections(tid);
    for (const conn of connections) {
      const result = await syncPlatformFull(tid, conn.id);
      results.push({
        tenantId: tid,
        platforms: [result],
        totalErrors: result.success ? 0 : 1,
        durationMs: 0,
      });
    }

    logger.info({ tenantId: tid }, 'CRON: Sync completo ADS finalizado');
  }

  return results;
}

/**
 * Evalúa las reglas watchdog para todos los tenants.
 * (El worker watchdog-worker.ts procesa esto realmente)
 */
export async function runWatchdogEvaluation(tenantId?: string): Promise<void> {
  const tenants = await getActiveTenants(tenantId);

  for (const tid of tenants) {
    logger.info({ tenantId: tid }, 'CRON: Evaluación watchdog iniciada');
    // La evaluación se hará en Fase 4 con BudgetWatchdog
    logger.info({ tenantId: tid }, 'CRON: Evaluación watchdog completada');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Obtiene los tenants con conexiones ADS activas.
 */
async function getActiveTenants(tenantId?: string): Promise<string[]> {
  if (tenantId) return [tenantId];

  const { prisma } = await import('@/lib/db');
  const connections = await prisma.adPlatformConnection.findMany({
    where: { status: 'CONNECTED' },
    select: { tenantId: true },
    distinct: ['tenantId'],
  });

  return connections.map((c: { tenantId: string }) => c.tenantId);
}

/**
 * Obtiene las conexiones activas de un tenant.
 */
async function getActiveConnections(tenantId: string): Promise<Array<{ id: string; platform: string }>> {
  const { prisma } = await import('@/lib/db');
  return prisma.adPlatformConnection.findMany({
    where: { tenantId, status: 'CONNECTED' },
    select: { id: true, platform: true },
  });
}
