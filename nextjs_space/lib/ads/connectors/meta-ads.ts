/**
 * Conector para Meta Ads API (Facebook/Instagram) — Graph API v22.0
 *
 * Implementa AdPlatformConnector para sincronizar campañas, ad sets, ads
 * e insights desde Meta Ads hacia el modelo unificado de Volkern.
 *
 * Autenticación:
 *   - OAuth 2.0 con long-lived tokens (60 días)
 *   - Renovación automática vía refresh token en el flujo de sync
 *   - Tokens cifrados en Vault del tenant
 *
 * Endpoints principales:
 *   GET  /act_{account_id}/campaigns    → Lista de campañas
 *   GET  /act_{account_id}/adsets        → Lista de ad sets
 *   GET  /act_{account_id}/ads           → Lista de anuncios
 *   GET  /act_{account_id}/insights      → Métricas (impresions, clicks, spend, etc.)
 *
 * Rate Limits: 200 llamadas/hora por ad account
 *
 * @see https://developers.facebook.com/docs/graph-api/reference/ad-campaign/
 */

import { prisma } from '@/lib/db';
import { VaultService } from '@/lib/security/vault';
import { logger } from '@/lib/logger';
import { credencialesAds } from '../platform-env';
import type {
  AdPlatformConnector,
  AdConnectionInput,
  AdConnectionAuthUrl,
  SyncResult,
  InsightSyncResult,
  AdCampaignInput,
  AdCampaignOutput,
} from '../types';

const API_VERSION = 'v22.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// ─── Helpers ──────────────────────────────────────────────────────────

interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface MetaErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    is_transient?: boolean;
  };
}

async function metaFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const json = await response.json();

  // Meta a veces retorna 200 con { error: {...} }
  if (json.error) {
    const msg = json.error.error_user_msg || json.error.message || `HTTP ${response.status}`;
    const code = json.error.code || response.status;
    if (code === 190 || code === 102 || code === 401) {
      throw new MetaAuthError(msg, code);
    }
    throw new MetaApiError(msg, code, response.status);
  }

  if (!response.ok) {
    const errorBody = json as MetaErrorResponse;
    const msg = errorBody.error?.message || `HTTP ${response.status}`;
    const code = errorBody.error?.code || response.status;

    if (code === 190 || code === 102 || code === 401) {
      throw new MetaAuthError(msg, code);
    }

    throw new MetaApiError(msg, code, response.status);
  }

  return json as T;
}

class MetaApiError extends Error {
  constructor(
    message: string,
    public apiCode: number,
    public httpStatus: number,
  ) {
    super(`[MetaAds API] ${message} (code: ${apiCode})`);
    this.name = 'MetaApiError';
  }
}

class MetaAuthError extends Error {
  constructor(message: string, public apiCode: number) {
    super(`[MetaAds Auth] ${message} (code: ${apiCode})`);
    this.name = 'MetaAuthError';
  }
}

/**
 * Obtiene el access token cifrado del Vault y lo descifra.
 */
async function getDecryptedToken(platformId: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  accountId: string;
  vaultSeed: string;
}> {
  const config = await prisma.adPlatformConnection.findUnique({
    where: { id: platformId },
    include: { tenant: { select: { vaultSeed: true } } },
  });

  if (!config || !config.tenant.vaultSeed) {
    throw new Error(`Configuración de Meta Ads no encontrada (id: ${platformId})`);
  }

  const accessToken = VaultService.decrypt(config.accessToken, config.tenantId, config.tenant.vaultSeed);
  const refreshToken = config.refreshToken
    ? VaultService.decrypt(config.refreshToken, config.tenantId, config.tenant.vaultSeed)
    : null;

  return {
    accessToken,
    refreshToken,
    accountId: config.accountId,
    vaultSeed: config.tenant.vaultSeed,
  };
}

/**
 * Intenta renovar el token si está próximo a expirar o si recibimos un error de auth.
 */
async function refreshTokenIfNeeded(platformId: string): Promise<string> {
  const config = await prisma.adPlatformConnection.findUnique({
    where: { id: platformId },
    include: { tenant: { select: { vaultSeed: true } } },
  });

  if (!config) throw new Error(`Platform connection not found: ${platformId}`);
  if (!config.tenant.vaultSeed) throw new Error('vaultSeed missing');    // Misma app de Facebook que el módulo social: sirve para anuncios cuando
    // tiene los productos de Marketing API aprobados (ver ../platform-env.ts).
    const { clientId, clientSecret } = credencialesAds('META');
    if (!clientId || !clientSecret) {
      throw new Error('ADS_META_CLIENT_ID y ADS_META_CLIENT_SECRET requeridos para renovar token');
    }

  const currentRefreshToken = config.refreshToken
    ? VaultService.decrypt(config.refreshToken, config.tenantId, config.tenant.vaultSeed)
    : null;

  if (!currentRefreshToken) {
    throw new MetaAuthError('No hay refresh token para renovar', 190);
  }

  const url = `${BASE_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${currentRefreshToken}`;

  const tokenData = await metaFetch<MetaTokenResponse>(url);

  // Guardar nuevos tokens cifrados
  const newAccessToken = VaultService.encrypt(tokenData.access_token, config.tenantId, config.tenant.vaultSeed);
  const newRefreshToken = tokenData.refresh_token
    ? VaultService.encrypt(tokenData.refresh_token, config.tenantId, config.tenant.vaultSeed)
    : null;

  await prisma.adPlatformConnection.update({
    where: { id: platformId },
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      status: 'CONNECTED',
    },
  });

  logger.info({ platformId }, 'Meta Ads token renovado exitosamente');
  return tokenData.access_token;
}

// ─── Mapeo de tipos Meta → Volkern ────────────────────────────────────

const META_OBJECTIVE_MAP: Record<string, string> = {
  OUTCOME_AWARE: 'AWARENESS',
  OUTCOME_ENGAGEMENT: 'ENGAGEMENT',
  OUTCOME_TRAFFIC: 'TRAFFIC',
  OUTCOME_LEADS: 'LEAD_GENERATION',
  OUTCOME_SALES: 'CONVERSIONS',
  OUTCOME_APP_PROMOTION: 'CONVERSIONS',
};

const META_STATUS_MAP: Record<string, string> = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
  DELETED: 'DELETED',
  CAMPAIGN_PAUSED: 'PAUSED',
  WITH_ISSUES: 'PAUSED',
};

// ─── Conector ─────────────────────────────────────────────────────────

export class MetaAdsConnector implements AdPlatformConnector {
  /**
   * Conecta una cuenta de Meta Ads: canjea el auth code por tokens,
   * obtiene el ad account ID y guarda la conexión cifrada en Vault.
   */
  async connect(tenantId: string, input: AdConnectionInput): Promise<void> {
    const { clientId, clientSecret } = credencialesAds('META');
    if (!clientId || !clientSecret) {
      throw new Error('ADS_META_CLIENT_ID y ADS_META_CLIENT_SECRET son requeridos en .env');
    }

    // 1. Canjear auth code por access token
    const tokenUrl = `${BASE_URL}/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(input.redirectUri)}&client_secret=${clientSecret}&code=${input.authCode}`;
    const tokenData = await metaFetch<MetaTokenResponse>(tokenUrl);

    // 2. Obtener ad accounts del usuario
    const meUrl = `${BASE_URL}/me/adaccounts?fields=id,name,account_id&limit=100&access_token=${tokenData.access_token}`;
    const accountsData = await metaFetch<{ data: Array<{ id: string; name: string; account_id: string }> }>(meUrl);

    if (!accountsData.data || accountsData.data.length === 0) {
      throw new Error('No se encontraron ad accounts de Meta Ads para este usuario');
    }

    // Tomar el primer ad account (el usuario puede conectar más después)
    const primaryAccount = accountsData.data[0];

    // 3. Obtener vaultSeed del tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { vaultSeed: true },
    });
    if (!tenant || !tenant.vaultSeed) {
      throw new Error(`Tenant ${tenantId} sin vaultSeed. Ejecute la inicialización del Vault primero.`);
    }

    // 4. Cifrar tokens y guardar conexión
    const encryptedAccessToken = VaultService.encrypt(tokenData.access_token, tenantId, tenant.vaultSeed);
    const encryptedRefreshToken = tokenData.refresh_token
      ? VaultService.encrypt(tokenData.refresh_token, tenantId, tenant.vaultSeed)
      : null;

    await prisma.adPlatformConnection.create({
      data: {
        tenantId,
        platform: 'META',
        accountId: primaryAccount.account_id,
        accountName: primaryAccount.name,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        status: 'CONNECTED',
        metadata: { adAccountId: primaryAccount.id },
      },
    });

    logger.info({ tenantId, accountId: primaryAccount.account_id }, 'Meta Ads conectado exitosamente');
  }

  /**
   * Desconecta la cuenta: revoca tokens y marca como DISCONNECTED.
   */
  async disconnect(tenantId: string, platformId: string): Promise<void> {
    try {
      const { accessToken } = await getDecryptedToken(platformId);
      // Intentar revocar el token (no crítico si falla)
      await metaFetch<{ success: boolean }>(
        `${BASE_URL}/me/permissions?access_token=${accessToken}`,
        { method: 'DELETE' },
      );
    } catch (err) {
      logger.warn({ platformId, err }, 'Error al revocar token de Meta Ads (no crítico)');
    }

    await prisma.adPlatformConnection.update({
      where: { id: platformId },
      data: {
        status: 'DISCONNECTED',
        accessToken: '',
        refreshToken: null,
      },
    });

    logger.info({ tenantId, platformId }, 'Meta Ads desconectado');
  }

  /**
   * Obtiene la URL de autorización OAuth.
   */
  async getAuthUrl(tenantId: string, redirectUri: string): Promise<AdConnectionAuthUrl> {
    const { clientId } = credencialesAds('META');
    if (!clientId) throw new Error('ADS_META_CLIENT_ID no configurado');

    const scopes = [
      'ads_read',
      'ads_management',
      'business_management',
      'read_insights',
    ].join(',');

    const url = `https://www.facebook.com/${API_VERSION}/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${tenantId}`;

    return { url, platform: 'META' };
  }

  /**
   * Sincroniza la estructura completa de campañas, ad sets y ads desde Meta Ads.
   */
  async syncCampaigns(tenantId: string, platformId: string): Promise<SyncResult> {
    const result: SyncResult = {
      platformId,
      campaignsCreated: 0,
      campaignsUpdated: 0,
      adSetsCreated: 0,
      adSetsUpdated: 0,
      adsCreated: 0,
      adsUpdated: 0,
      errors: [],
    };

    try {
      const { accessToken, accountId, vaultSeed } = await getDecryptedToken(platformId);
      const adAccountId = `act_${accountId}`;

      // ─── 1. Obtener campañas ─────────────────────────────────────
      const campaignsUrl = `${BASE_URL}/${adAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,end_time,bid_strategy,budget_remaining,created_time,updated_time&limit=100&access_token=${accessToken}`;
      const campaignsData = await metaFetch<{
        data: Array<Record<string, unknown>>;
        paging?: { next?: string };
      }>(campaignsUrl);

      for (const camp of campaignsData.data) {
        const externalId = camp.id as string;
        const objective = (camp.objective as string) || '';
        const status = META_STATUS_MAP[(camp.status as string)] || 'ACTIVE';

        const campaignData = {
          name: (camp.name as string) || 'Sin nombre',
          status,
          objective: META_OBJECTIVE_MAP[objective] || objective,
          dailyBudget: (camp.daily_budget as number)
            ? (camp.daily_budget as number) / 100
            : null,
          lifetimeBudget: (camp.lifetime_budget as number)
            ? (camp.lifetime_budget as number) / 100
            : null,
          startDate: camp.start_time ? new Date(camp.start_time as string) : null,
          endDate: camp.end_time ? new Date(camp.end_time as string) : null,
          bidStrategy: (camp.bid_strategy as string) || null,
          syncedAt: new Date(),
        };

        // Upsert: buscar por externalId + platformId
        const existing = await prisma.adCampaign.findFirst({
          where: { externalId, platformId },
        });

        if (existing) {
          await prisma.adCampaign.update({
            where: { id: existing.id },
            data: campaignData,
          });
          result.campaignsUpdated++;
        } else {
          await prisma.adCampaign.create({
            data: {
              ...campaignData,
              externalId,
              tenantId,
              platformId,
              isVolkernManaged: true,
            },
          });
          result.campaignsCreated++;
        }
      }

      // ─── 2. Obtener ad sets ──────────────────────────────────────
      const adSetsUrl = `${BASE_URL}/${adAccountId}/adsets?fields=id,name,campaign_id,status,daily_budget,lifetime_budget,bid_amount,bid_strategy,targeting,start_time,end_time,created_time&limit=100&access_token=${accessToken}`;
      const adSetsData = await metaFetch<{
        data: Array<Record<string, unknown>>;
      }>(adSetsUrl);

      for (const aset of adSetsData.data) {
        const externalId = aset.id as string;
        const campaignExternalId = aset.campaign_id as string;

        // Encontrar la campaña local por externalId
        const localCampaign = await prisma.adCampaign.findFirst({
          where: { externalId: campaignExternalId, platformId },
        });
        if (!localCampaign) continue;

        const status = META_STATUS_MAP[(aset.status as string)] || 'ACTIVE';
        const targeting = aset.targeting ? JSON.parse(JSON.stringify(aset.targeting)) : null;

        const setData = {
          name: (aset.name as string) || 'Sin nombre',
          status,
          dailyBudget: (aset.daily_budget as number)
            ? (aset.daily_budget as number) / 100
            : null,
          lifetimeBudget: (aset.lifetime_budget as number)
            ? (aset.lifetime_budget as number) / 100
            : null,
          bidAmount: (aset.bid_amount as number)
            ? (aset.bid_amount as number) / 100
            : null,
          bidStrategy: (aset.bid_strategy as string) || null,
          targeting: targeting || undefined,
          startDate: aset.start_time ? new Date(aset.start_time as string) : null,
          endDate: aset.end_time ? new Date(aset.end_time as string) : null,
        };

        const existing = await prisma.adSet.findFirst({
          where: { externalId, campaignId: localCampaign.id },
        });

        if (existing) {
          await prisma.adSet.update({ where: { id: existing.id }, data: setData });
          result.adSetsUpdated++;
        } else {
          await prisma.adSet.create({
            data: { ...setData, externalId, campaignId: localCampaign.id },
          });
          result.adSetsCreated++;
        }
      }

      // ─── 3. Obtener anuncios ─────────────────────────────────────
      const adsUrl = `${BASE_URL}/${adAccountId}/ads?fields=id,name,adset_id,status,creative{id,thumbnail_url,image_url,title,body,call_to_action_type,link_url,object_story_spec,video_id}&limit=100&access_token=${accessToken}`;
      const adsData = await metaFetch<{ data: Array<Record<string, unknown>> }>(adsUrl);

      for (const ad of adsData.data) {
        const externalId = ad.id as string;
        const adSetExternalId = ad.adset_id as string;

        const localAdSet = await prisma.adSet.findFirst({
          where: { externalId: adSetExternalId },
        });
        if (!localAdSet) continue;

        const creative = ad.creative as Record<string, unknown> | null;
        const creativeData = creative as Record<string, unknown> | null;

        const adData = {
          name: (ad.name as string) || 'Sin nombre',
          status: META_STATUS_MAP[(ad.status as string)] || 'ACTIVE',
          creativeType: creativeData?.id ? 'IMAGE' as const : 'TEXT' as const,
          creativeUrl: (creativeData?.thumbnail_url as string) || (creativeData?.image_url as string) || null,
          headline: (creativeData?.title as string) || null,
          primaryText: (creativeData?.body as string) || null,
          callToAction: (creativeData?.call_to_action_type as string) || null,
          destinationUrl: (creativeData?.link_url as string) || null,
          thumbnailUrl: (creativeData?.thumbnail_url as string) || null,
          videoId: (creativeData?.video_id as string) || null,
        };

        const existing = await prisma.ad.findFirst({
          where: { externalId, adSetId: localAdSet.id },
        });

        if (existing) {
          await prisma.ad.update({ where: { id: existing.id }, data: adData });
          result.adsUpdated++;
        } else {
          await prisma.ad.create({
            data: { ...adData, externalId, adSetId: localAdSet.id },
          });
          result.adsCreated++;
        }
      }

      // Actualizar lastSyncedAt en la conexión
      await prisma.adPlatformConnection.update({
        where: { id: platformId },
        data: { lastSyncedAt: new Date() },
      });

      logger.info(result, 'Meta Ads: sincronización de campañas completada');
    } catch (err) {
      if (err instanceof MetaAuthError) {
        // Token expirado, intentar renovar
        logger.warn({ platformId }, 'Meta Ads: token expirado, intentando renovar...');
        try {
          await refreshTokenIfNeeded(platformId);
          // Reintentar la sincronización recursively no es ideal, pero el próximo ciclo lo hará
          result.errors.push('Token renovado, reintentar en el próximo ciclo');
        } catch (refreshErr) {
          const msg = refreshErr instanceof Error ? refreshErr.message : 'Error desconocido';
          result.errors.push(`Error renovando token: ${msg}`);
          await prisma.adPlatformConnection.update({
            where: { id: platformId },
            data: { status: 'EXPIRED' },
          });
        }
      } else {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        result.errors.push(msg);
        logger.error({ platformId, err }, 'Meta Ads: error en syncCampaigns');
      }
    }

    return result;
  }

  /**
   * Sincroniza las métricas (insights) de un período desde Meta Ads.
   */
  async syncInsights(
    tenantId: string,
    platformId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<InsightSyncResult> {
    const result: InsightSyncResult = {
      platformId,
      insightsImported: 0,
      dateFrom,
      dateTo,
      errors: [],
    };

    try {
      const { accessToken, accountId } = await getDecryptedToken(platformId);
      const adAccountId = `act_${accountId}`;

      // Formato de fechas para Meta: YYYY-MM-DD
      const since = dateFrom.toISOString().split('T')[0];
      const until = dateTo.toISOString().split('T')[0];

      const fields = [
        'campaign_id',
        'campaign_name',
        'adset_id',
        'adset_name',
        'ad_id',
        'ad_name',
        'impressions',
        'clicks',
        'spend',
        'reach',
        'frequency',
        'cpc',
        'cpm',
        'ctr',
        'conversions',
        'cost_per_conversion',
        'conversion_rate_ranking',
        'quality_ranking',
        'engagement_rate_ranking',
        'video_avg_time_watched_seconds',
        'video_plays',
      ].join(',');

      const insightsUrl = `${BASE_URL}/${adAccountId}/insights?fields=${fields}&time_range[since]=${since}&time_range[until]=${until}&level=ad&limit=100&access_token=${accessToken}`;
      const insightsData = await metaFetch<{ data: Array<Record<string, unknown>> }>(insightsUrl);

      for (const insight of insightsData.data) {
        const campaignExternalId = insight.campaign_id as string;
        const adSetExternalId = insight.adset_id as string;
        const adExternalId = insight.ad_id as string;

        // Buscar IDs locales
        const localCampaign = await prisma.adCampaign.findFirst({
          where: { externalId: campaignExternalId, platformId },
          select: { id: true },
        });
        const localAdSet = await prisma.adSet.findFirst({
          where: { externalId: adSetExternalId },
          select: { id: true },
        });
        const localAd = await prisma.ad.findFirst({
          where: { externalId: adExternalId },
          select: { id: true },
        });

        const spend = insight.spend ? parseFloat(insight.spend as string) : 0;
        const conversions = insight.conversions ? parseInt(insight.conversions as string, 10) : 0;

        const insightData = {
          tenantId,
          platformId,
          campaignId: localCampaign?.id || null,
          adSetId: localAdSet?.id || null,
          adId: localAd?.id || null,
          dateStart: dateFrom,
          dateEnd: dateTo,
          impressions: insight.impressions ? parseInt(insight.impressions as string, 10) : 0,
          clicks: insight.clicks ? parseInt(insight.clicks as string, 10) : 0,
          spend: Math.round(spend * 100) / 100,
          reach: insight.reach ? parseInt(insight.reach as string, 10) : 0,
          frequency: insight.frequency ? parseFloat(insight.frequency as string) : 0,
          cpc: insight.cpc ? parseFloat(insight.cpc as string) : 0,
          cpm: insight.cpm ? parseFloat(insight.cpm as string) : 0,
          ctr: insight.ctr ? parseFloat(insight.ctr as string) : 0,
          conversions,
          conversionRate: spend > 0 && conversions > 0 ? (conversions / spend) * 100 : 0,
          cpa: conversions > 0 ? spend / conversions : 0,
          roas: 0, // Se calcula offline cuando hay revenue del CRM
          revenue: 0,
          leads: 0,
          costPerLead: 0,
          qualityRank: insight.quality_ranking ? parseFloat(insight.quality_ranking as string) : null,
          engagementRate: insight.engagement_rate_ranking ? parseFloat(insight.engagement_rate_ranking as string) : null,
          videoPlays: insight.video_plays ? parseInt(insight.video_plays as string, 10) : null,
          videoAvgWatchTime: insight.video_avg_time_watched_seconds
            ? parseFloat(insight.video_avg_time_watched_seconds as string)
            : null,
          canvas: {
            campaignName: (insight.campaign_name as string) || '',
            adSetName: (insight.adset_name as string) || '',
            adName: (insight.ad_name as string) || '',
          },
        };

        // Upsert: evitar duplicados para el mismo día y entidad
        const existingInsight = await prisma.adInsight.findFirst({
          where: {
            platformId,
            campaignId: localCampaign?.id || 'no-id',
            adSetId: localAdSet?.id || 'no-id',
            adId: localAd?.id || 'no-id',
            dateStart: dateFrom,
          },
        });

        if (existingInsight) {
          await prisma.adInsight.update({
            where: { id: existingInsight.id },
            data: { ...insightData, canvas: insightData.canvas as object },
          });
        } else {
          await prisma.adInsight.create({
            data: { ...insightData, canvas: insightData.canvas as object },
          });
        }

        result.insightsImported++;
      }

      logger.info(
        { platformId, from: since, to: until, imported: result.insightsImported },
        'Meta Ads: insights sincronizados',
      );
    } catch (err) {
      if (err instanceof MetaAuthError) {
        try {
          await refreshTokenIfNeeded(platformId);
          result.errors.push('Token renovado, reintentar insights en el próximo ciclo');
        } catch (refreshErr) {
          const msg = refreshErr instanceof Error ? refreshErr.message : 'Error desconocido';
          result.errors.push(`Error renovando token: ${msg}`);
        }
      } else {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        result.errors.push(msg);
        logger.error({ platformId, err }, 'Meta Ads: error en syncInsights');
      }
    }

    return result;
  }

  /**
   * Pausa una campaña en Meta Ads.
   */
  async pauseCampaign(campaignId: string, externalId: string): Promise<void> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { platform: true },
    });
    if (!campaign) throw new Error(`Campaña no encontrada: ${campaignId}`);

    const { accessToken } = await getDecryptedToken(campaign.platformId);

    await metaFetch(
      `${BASE_URL}/${externalId}?fields=status&access_token=${accessToken}`,
      {
        method: 'POST',
        body: JSON.stringify({ status: 'PAUSED' }),
      },
    );
  }

  /**
   * Reanuda una campaña pausada en Meta Ads.
   */
  async resumeCampaign(campaignId: string, externalId: string): Promise<void> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { platform: true },
    });
    if (!campaign) throw new Error(`Campaña no encontrada: ${campaignId}`);

    const { accessToken } = await getDecryptedToken(campaign.platformId);

    await metaFetch(
      `${BASE_URL}/${externalId}?fields=status&access_token=${accessToken}`,
      {
        method: 'POST',
        body: JSON.stringify({ status: 'ACTIVE' }),
      },
    );
  }

  /**
   * Actualiza el presupuesto diario de una campaña en Meta Ads.
   * Meta maneja budgets en centavos (ej: 5000 = $50.00).
   */
  async updateBudget(campaignId: string, externalId: string, budget: number): Promise<void> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { platform: true },
    });
    if (!campaign) throw new Error(`Campaña no encontrada: ${campaignId}`);

    const { accessToken } = await getDecryptedToken(campaign.platformId);
    const budgetInCents = Math.round(budget * 100);

    await metaFetch(
      `${BASE_URL}/${externalId}?fields=daily_budget&access_token=${accessToken}`,
      {
        method: 'POST',
        body: JSON.stringify({ daily_budget: budgetInCents }),
      },
    );
  }

  /**
   * Crea una campaña en Meta Ads.
   * Los budgets se envían en centavos (enteros).
   */
  async createCampaign(
    tenantId: string,
    platformId: string,
    data: AdCampaignInput,
  ): Promise<AdCampaignOutput> {
    const { accessToken, accountId } = await getDecryptedToken(platformId);
    const adAccountId = `act_${accountId}`;

    // Mapear objetivo Volkern → Meta
    const objectiveMap: Record<string, string> = {
      CONVERSIONS: 'OUTCOME_SALES',
      TRAFFIC: 'OUTCOME_TRAFFIC',
      AWARENESS: 'OUTCOME_AWARE',
      LEAD_GENERATION: 'OUTCOME_LEADS',
      ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
      SALES: 'OUTCOME_SALES',
    };
    const metaObjective = objectiveMap[data.objective || 'CONVERSIONS'] || 'OUTCOME_SALES';

    const body: Record<string, unknown> = {
      name: data.name,
      objective: metaObjective,
      status: 'PAUSED', // Crear pausada por seguridad; el usuario la activa
      special_ad_categories: [],
    };

    if (data.dailyBudget !== undefined) {
      body.daily_budget = Math.round(data.dailyBudget * 100);
    }
    if (data.lifetimeBudget !== undefined) {
      body.lifetime_budget = Math.round(data.lifetimeBudget * 100);
    }
    if (data.bidStrategy) {
      body.bid_strategy = data.bidStrategy;
    }
    if (data.startDate) {
      body.start_time = data.startDate.toISOString();
    }
    if (data.endDate) {
      body.end_time = data.endDate.toISOString();
    }

    const response = await metaFetch<{ id: string }>(
      `${BASE_URL}/${adAccountId}/campaigns?access_token=${accessToken}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );

    // Guardar campaña localmente
    await prisma.adCampaign.create({
      data: {
        tenantId,
        platformId,
        externalId: response.id,
        name: data.name,
        status: 'PAUSED',
        objective: data.objective || 'CONVERSIONS',
        dailyBudget: data.dailyBudget || null,
        lifetimeBudget: data.lifetimeBudget || null,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        bidStrategy: data.bidStrategy || null,
        isVolkernManaged: data.isVolkernManaged ?? true,
        syncedAt: new Date(),
      },
    });

    return {
      externalId: response.id,
      name: data.name,
      status: 'PAUSED',
      ...(data.objective && { objective: data.objective }),
      ...(data.dailyBudget !== undefined && { dailyBudget: data.dailyBudget }),
    };
  }
}
