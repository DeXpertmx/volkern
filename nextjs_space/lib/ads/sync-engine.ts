/**
 * Motor de Sincronización ADS
 *
 * Orquesta la sincronización de todas las plataformas ADS conectadas
 * para un tenant. Es llamado por los workers de BullMQ y puede ser
 * invocado bajo demanda desde la API REST.
 *
 * Flujo:
 *   1. Obtener todas las conexiones activas del tenant
 *   2. Por cada conexión, obtener el conector del registry
 *   3. syncCampaigns() → estructura (campañas, ad sets, ads)
 *   4. syncInsights() → métricas del período
 *   5. Actualizar lastSyncedAt
 *
 * @see PLAN_ADS_INTELLIGENCE.md — Fase 3
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getConnector } from './connectors';
import type { AdPlatform } from './types';

// ─── Interfaces ───────────────────────────────────────────────────────

export interface SyncAllResult {
  tenantId: string;
  platforms: Array<{
    platformId: string;
    platform: string;
    campaigns: { created: number; updated: number };
    adSets: { created: number; updated: number };
    ads: { created: number; updated: number };
    insightsImported: number;
    errors: string[];
    success: boolean;
  }>;
  totalErrors: number;
  durationMs: number;
}

// ─── Sync Engine ──────────────────────────────────────────────────────

/**
 * Sincroniza todas las plataformas ADS conectadas de un tenant.
 * - Estructura (campañas, ad sets, ads)
 * - Insights de las últimas 24-48h
 */
export async function syncAllPlatforms(tenantId: string): Promise<SyncAllResult> {
  const startTime = Date.now();
  const result: SyncAllResult = {
    tenantId,
    platforms: [],
    totalErrors: 0,
    durationMs: 0,
  };

  try {
    // Obtener conexiones activas del tenant
    const connections = await prisma.adPlatformConnection.findMany({
      where: { tenantId, status: 'CONNECTED' },
      select: { id: true, platform: true, accountName: true },
    });

    if (connections.length === 0) {
      logger.info({ tenantId }, 'Sync: No hay plataformas ADS conectadas');
      result.durationMs = Date.now() - startTime;
      return result;
    }

    logger.info({ tenantId, count: connections.length }, 'Sync: Iniciando sincronización de plataformas ADS');

    // Sincronizar cada plataforma
    for (const conn of connections) {
      const platformResult = await syncPlatform(tenantId, conn.id, conn.platform as AdPlatform);
      result.platforms.push(platformResult);
      if (!platformResult.success) result.totalErrors++;
    }

    logger.info(
      { tenantId, totalPlatforms: connections.length, totalErrors: result.totalErrors },
      'Sync: Sincronización ADS completada',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    logger.error({ tenantId, err }, `Sync: Error general en sincronización: ${msg}`);
    result.totalErrors++;
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Sincroniza una plataforma específica.
 */
async function syncPlatform(
  tenantId: string,
  platformId: string,
  platform: AdPlatform,
): Promise<SyncAllResult['platforms'][0]> {
  const base: SyncAllResult['platforms'][0] = {
    platformId,
    platform,
    campaigns: { created: 0, updated: 0 },
    adSets: { created: 0, updated: 0 },
    ads: { created: 0, updated: 0 },
    insightsImported: 0,
    errors: [],
    success: true,
  };

  try {
    const connector = getConnector(platform);

    // 1. Sincronizar estructura (campañas, ad sets, ads)
    logger.info({ tenantId, platform, platformId }, 'Sync: Sincronizando estructura de campañas');
    const syncResult = await connector.syncCampaigns(tenantId, platformId);
    base.campaigns = { created: syncResult.campaignsCreated, updated: syncResult.campaignsUpdated };
    base.adSets = { created: syncResult.adSetsCreated, updated: syncResult.adSetsUpdated };
    base.ads = { created: syncResult.adsCreated, updated: syncResult.adsUpdated };
    base.errors.push(...syncResult.errors);

    // 2. Sincronizar insights de las últimas 48h
    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - 48 * 60 * 60 * 1000);

    logger.info({ tenantId, platform, from: dateFrom, to: dateTo }, 'Sync: Sincronizando insights');
    const insightResult = await connector.syncInsights(tenantId, platformId, dateFrom, dateTo);
    base.insightsImported = insightResult.insightsImported;
    base.errors.push(...insightResult.errors);

    // 3. Si hay errores, marcar como no exitoso pero no fatal
    if (base.errors.length > 0) {
      base.success = false;
      // Si el error es de autenticación, ya fue manejado por el connector
    }

    logger.info(
      { tenantId, platform, platformId, campaigns: base.campaigns, insights: base.insightsImported },
      'Sync: Plataforma sincronizada',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    base.errors.push(msg);
    base.success = false;
    logger.error({ tenantId, platform, err }, `Sync: Error en plataforma ${platform}: ${msg}`);
  }

  return base;
}

/**
 * Sincroniza una plataforma específica forzando sync completo
 * (insights de los últimos 30 días).
 */
export async function syncPlatformFull(
  tenantId: string,
  platformId: string,
): Promise<SyncAllResult['platforms'][0]> {
  const conn = await prisma.adPlatformConnection.findUnique({
    where: { id: platformId },
    select: { platform: true },
  });

  if (!conn) {
    const base = {
      platformId,
      platform: 'UNKNOWN',
      campaigns: { created: 0, updated: 0 },
      adSets: { created: 0, updated: 0 },
      ads: { created: 0, updated: 0 },
      insightsImported: 0,
      errors: ['Platform connection not found'],
      success: false,
    };
    return base;
  }

  const base = await syncPlatform(tenantId, platformId, conn.platform as AdPlatform);

  // Si la estructura se sincronizó bien, hacer sync de insights más profundo
  if (base.success) {
    try {
      const connector = getConnector(conn.platform as AdPlatform);
      const dateTo = new Date();
      const dateFrom = new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);

      logger.info({ tenantId, platformId, from: dateFrom, to: dateTo }, 'Sync: Full sync insights (30 días)');
      const insightResult = await connector.syncInsights(tenantId, platformId, dateFrom, dateTo);
      base.insightsImported = insightResult.insightsImported;
      base.errors.push(...insightResult.errors);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      base.errors.push(`Insights deep sync error: ${msg}`);
    }
  }

  return base;
}
