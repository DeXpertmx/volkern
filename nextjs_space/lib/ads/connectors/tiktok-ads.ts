/**
 * Conector para TikTok Ads API v1.3
 *
 * Implementa AdPlatformConnector para sincronizar campañas, ad groups (ad sets),
 * anuncios e insights desde TikTok Ads hacia el modelo unificado de Volkern.
 *
 * Autenticación:
 *   - OAuth 2.0 con access token (válido por 1 hora, renovable vía refresh token)
 *   - Tokens cifrados en Vault del tenant
 *
 * Particularidades de la API:
 *   - La mayoría de endpoints usan POST incluso para consultas GET
 *   - Paginación con page / page_size
 *   - Las respuestas se envuelven en { code, message, data, request_id }
 *   - Rate limit: 10 requests/second
 *   - "advertiser_id" como identificador de cuenta
 *   - "app_id" / "secret" en vez de client_id / client_secret
 *
 * Endpoints principales:
 *   POST /oauth2/access_token/          → Token exchange & refresh
 *   POST /campaign/get/                 → Lista de campañas
 *   POST /ad_group/get/                 → Lista de ad groups
 *   POST /ad/get/                       → Lista de anuncios
 *   POST /report/integrated/get/        → Métricas (insights)
 *   POST /campaign/create/              → Crear campaña
 *   POST /campaign/update/              → Actualizar campaña (status, budget)
 *   POST /oauth2/revoke_token/          → Revocar token
 *
 * @see https://ads.tiktok.com/marketing_api/docs?id=1739584851943426
 */

import { prisma } from '@/lib/db';
import { VaultService } from '@/lib/security/vault';
import { logger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';
import type {
  AdPlatformConnector,
  AdConnectionInput,
  AdConnectionAuthUrl,
  SyncResult,
  InsightSyncResult,
  AdCampaignInput,
  AdCampaignOutput,
  PublishPublicationInput,
  PublishPublicationResult,
} from '../types';

const BASE_URL = 'https://ads.tiktok.com/open_api/v1.3';
const OAUTH_TOKEN_URL = 'https://ads.tiktok.com/open_api/oauth2/access_token/';
const OAUTH_AUTH_URL = 'https://ads.tiktok.com/open_api/oauth2/authorize/';

// ─── Helpers ──────────────────────────────────────────────────────────

interface TiktokTokenResponse {
  code: number;
  message: string;
  data: {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    refresh_token_expires_in: number;
    advertiser_ids?: string[];
    advertiser_id?: string;
    scope?: string;
  };
  request_id?: string;
}

interface TiktokErrorResponse {
  code: number;
  message: string;
  request_id?: string;
  data?: Record<string, unknown>;
}

interface TiktokListResponse<T> {
  code: number;
  message: string;
  data: {
    list: T[];
    page_info: {
      page: number;
      page_size: number;
      total_page: number;
      total_number: number;
    };
  };
  request_id?: string;
}

interface TiktokPageRequest {
  page: number;
  page_size: number;
  [key: string]: unknown;
}

async function tiktokFetch<T>(
  url: string,
  body: Record<string, unknown> = {},
  accessToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers['Access-Token'] = accessToken;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as TiktokErrorResponse;
    const msg = errorBody.message || `HTTP ${response.status}`;
    const code = errorBody.code || response.status;

    // Error codes de auth expirado: 40100, 40003, 40005
    if (code === 40100 || code === 40003 || code === 40005 || response.status === 401) {
      throw new TiktokAuthError(msg, code);
    }

    throw new TiktokApiError(msg, code, response.status);
  }

  const result = (await response.json()) as TiktokResponse<T>;
  if (result.code !== 0) {
    const msg = result.message || 'Unknown TikTok API error';

    if (result.code === 40100 || result.code === 40003 || result.code === 40005) {
      throw new TiktokAuthError(msg, result.code);
    }

    throw new TiktokApiError(msg, result.code, response.status);
  }

  return result.data;
}

interface TiktokResponse<T> {
  code: number;
  message: string;
  data: T;
  request_id?: string;
}

class TiktokApiError extends Error {
  constructor(
    message: string,
    public apiCode: number,
    public httpStatus: number,
  ) {
    super(`[TikTokAds API] ${message} (code: ${apiCode})`);
    this.name = 'TiktokApiError';
  }
}

class TiktokAuthError extends Error {
  constructor(message: string, public apiCode: number) {
    super(`[TikTokAds Auth] ${message} (code: ${apiCode})`);
    this.name = 'TiktokAuthError';
  }
}

/**
 * Obtiene todos los elementos paginados de un endpoint de TikTok.
 * TikTok usa page/page_size para paginación.
 */
async function tiktokPaginatedFetch<T>(
  url: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<T[]> {
  const allItems: T[] = [];
  let page = 1;
  const pageSize = 100;
  let totalPages = 1;

  do {
    const paginatedBody: TiktokPageRequest = {
      ...body,
      page,
      page_size: pageSize,
    };

    const result = await tiktokFetch<TiktokListResponse<T>['data']>(url, paginatedBody, accessToken) as {
      list: T[];
      page_info: {
        page: number;
        page_size: number;
        total_page: number;
        total_number: number;
      };
    };

    if (result.list && Array.isArray(result.list)) {
      allItems.push(...result.list);
    }

    if (result.page_info) {
      totalPages = result.page_info.total_page;
    }
    page++;

    // Respetar rate limit: 10 req/s -> esperar 100ms entre páginas
    if (page <= totalPages) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } while (page <= totalPages);

  return allItems;
}

// ─── Token Management ─────────────────────────────────────────────────

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
    throw new Error(`Configuración de TikTok Ads no encontrada (id: ${platformId})`);
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
 * Renueva el access token de TikTok usando el refresh token.
 * TikTok access tokens expiran en 1 hora; refresh tokens en 1 año.
 */
async function refreshTokenIfNeeded(platformId: string): Promise<string> {
  const config = await prisma.adPlatformConnection.findUnique({
    where: { id: platformId },
    include: { tenant: { select: { vaultSeed: true } } },
  });

  if (!config) throw new Error(`Platform connection not found: ${platformId}`);
  if (!config.tenant.vaultSeed) throw new Error('vaultSeed missing');

  const appId = process.env.ADS_TIKTOK_CLIENT_ID;
  const secret = process.env.ADS_TIKTOK_CLIENT_SECRET;
  if (!appId || !secret) {
    throw new Error('ADS_TIKTOK_CLIENT_ID y ADS_TIKTOK_CLIENT_SECRET requeridos para renovar token');
  }

  const currentRefreshToken = config.refreshToken
    ? VaultService.decrypt(config.refreshToken, config.tenantId, config.tenant.vaultSeed)
    : null;

  if (!currentRefreshToken) {
    throw new TiktokAuthError('No hay refresh token para renovar', 40100);
  }

  const tokenData = await tiktokFetch<TiktokTokenResponse['data']>(OAUTH_TOKEN_URL, {
    app_id: appId,
    secret,
    grant_type: 'refresh_token',
    refresh_token: currentRefreshToken,
  });

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

  logger.info({ platformId }, 'TikTok Ads token renovado exitosamente');
  return tokenData.access_token;
}

// ─── Mapeo de tipos TikTok → Volkern ──────────────────────────────────

const TIKTOK_OBJECTIVE_MAP: Record<string, string> = {
  TRAFFIC: 'TRAFFIC',
  ENGAGEMENT: 'ENGAGEMENT',
  LEAD_GENERATION: 'LEAD_GENERATION',
  VIDEO_VIEWS: 'ENGAGEMENT',
  REACH: 'AWARENESS',
  CONVERSIONS: 'CONVERSIONS',
  APP_INSTALL: 'CONVERSIONS',
  CATALOG_SALES: 'SALES',
};

const TIKTOK_STATUS_MAP: Record<string, string> = {
  CAMPAIGN_STATUS_ENABLE: 'ACTIVE',
  CAMPAIGN_STATUS_DISABLE: 'PAUSED',
  CAMPAIGN_STATUS_DELIVERY: 'ACTIVE',
  CAMPAIGN_STATUS_NOT_DELIVERY: 'PAUSED',
  CAMPAIGN_STATUS_ALL: 'ACTIVE',
  ENABLE: 'ACTIVE',
  DISABLE: 'PAUSED',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
  DELETE: 'DELETED',
  CAMPAIGN_STATUS_DELETED: 'DELETED',
  CAMPAIGN_STATUS_ARCHIVED: 'ARCHIVED',
  ADGROUP_STATUS_ENABLE: 'ACTIVE',
  ADGROUP_STATUS_DISABLE: 'PAUSED',
  ADGROUP_STATUS_DELIVERY: 'ACTIVE',
  ADGROUP_STATUS_NOT_DELIVERY: 'PAUSED',
  AD_STATUS_ENABLE: 'ACTIVE',
  AD_STATUS_DISABLE: 'PAUSED',
  AD_STATUS_DELIVERY: 'ACTIVE',
  AD_STATUS_NOT_DELIVERY: 'PAUSED',
};

const TIKTOK_BUDGET_MODE_MAP: Record<string, string> = {
  BUDGET_MODE_DAY: 'DAILY',
  BUDGET_MODE_TOTAL: 'LIFETIME',
};

const TIKTOK_BID_STRATEGY_MAP: Record<string, string> = {
  BID_STRATEGY_CUSTOM: 'BID_CAP',
  BID_STRATEGY_LOWEST_COST: 'LOWEST_COST',
  BID_STRATEGY_TARGET_COST: 'COST_CAP',
  BID_STRATEGY_TARGET_ROAS: 'TARGET_ROAS',
  PRICING_STRATEGY_CENT_CPM: 'BID_CAP',
  PRICING_STRATEGY_CPC: 'BID_CAP',
  PRICING_STRATEGY_CPA: 'TARGET_CPA',
  PRICING_STRATEGY_OCPM: 'LOWEST_COST',
  'BID_STRATEGY_TARGET_NUMBER_OF_RESULT': 'TARGET_CPA',
};

const TIKTOK_OPTIMIZATION_MAP: Record<string, string> = {
  OPTIMIZATION_GOAL_IMPRESSIONS: 'IMPRESSIONS',
  OPTIMIZATION_GOAL_CLICKS: 'CLICKS',
  OPTIMIZATION_GOAL_CTR: 'CLICKS',
  OPTIMIZATION_GOAL_RESULT: 'CONVERSIONS',
  OPTIMIZATION_GOAL_CONVERSION: 'CONVERSIONS',
  OPTIMIZATION_GOAL_REACH: 'REACH',
  OPTIMIZATION_GOAL_ENGAGEMENT: 'ENGAGEMENT',
  OPTIMIZATION_GOAL_VIDEO_PLAY: 'ENGAGEMENT',
  OPTIMIZATION_GOAL_INSTALL: 'CONVERSIONS',
  OPTIMIZATION_GOAL_COMMERCE: 'CONVERSIONS',
  OPTIMIZATION_GOAL_LEAD: 'LEAD_GENERATION',
};

// ─── Conector ─────────────────────────────────────────────────────────

export class TiktokAdsConnector implements AdPlatformConnector {
  /**
   * Conecta una cuenta de TikTok Ads: canjea el auth code por tokens,
   * obtiene el advertiser ID y guarda la conexión cifrada en Vault.
   */
  async connect(tenantId: string, input: AdConnectionInput): Promise<void> {
    const appId = process.env.ADS_TIKTOK_CLIENT_ID;
    const secret = process.env.ADS_TIKTOK_CLIENT_SECRET;
    if (!appId || !secret) {
      throw new Error('ADS_TIKTOK_CLIENT_ID y ADS_TIKTOK_CLIENT_SECRET son requeridos en .env');
    }

    // 1. Canjear auth code por access token
    const tokenData = await tiktokFetch<TiktokTokenResponse['data']>(OAUTH_TOKEN_URL, {
      app_id: appId,
      secret,
      auth_code: input.authCode,
      grant_type: 'authorization_code',
    });

    if (!tokenData.access_token) {
      throw new Error('TikTok Ads: No se recibió access_token en la respuesta');
    }

    // 2. Obtener advertiser ID
    let advertiserId = tokenData.advertiser_id || '';
    const advertiserIds = tokenData.advertiser_ids || [];

    if (!advertiserId && advertiserIds.length > 0) {
      advertiserId = advertiserIds[0];
    }

    if (!advertiserId) {
      throw new Error('No se encontraron advertisers de TikTok Ads para este usuario');
    }

    // 3. Obtener información básica del advertiser
    let advertiserName = advertiserId;
    try {
      const advertiserInfo = await tiktokFetch<Array<{ advertiser_id: string; advertiser_name: string; company_name?: string }>>(
        `${BASE_URL}/advertiser/info/`,
        { advertiser_ids: [advertiserId] },
        tokenData.access_token,
      );
      if (Array.isArray(advertiserInfo) && advertiserInfo.length > 0) {
        advertiserName = advertiserInfo[0].advertiser_name || advertiserInfo[0].company_name || advertiserId;
      }
    } catch (err) {
      logger.warn({ err }, 'TikTok Ads: no se pudo obtener nombre del advertiser, usando ID como nombre');
    }

    // 4. Obtener vaultSeed del tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { vaultSeed: true },
    });
    if (!tenant || !tenant.vaultSeed) {
      throw new Error(`Tenant ${tenantId} sin vaultSeed. Ejecute la inicialización del Vault primero.`);
    }

    // 5. Cifrar tokens y guardar conexión
    const encryptedAccessToken = VaultService.encrypt(tokenData.access_token, tenantId, tenant.vaultSeed);
    const encryptedRefreshToken = tokenData.refresh_token
      ? VaultService.encrypt(tokenData.refresh_token, tenantId, tenant.vaultSeed)
      : null;

    await prisma.adPlatformConnection.create({
      data: {
        tenantId,
        platform: 'TIKTOK',
        accountId: advertiserId,
        accountName: advertiserName,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        status: 'CONNECTED',
        metadata: {
          advertiserId,
        },
      },
    });

    logger.info({ tenantId, accountId: advertiserId }, 'TikTok Ads conectado exitosamente');
  }

  /**
   * Desconecta la cuenta: revoca tokens y marca como DISCONNECTED.
   */
  async disconnect(tenantId: string, platformId: string): Promise<void> {
    try {
      const { accessToken } = await getDecryptedToken(platformId);
      const appId = process.env.ADS_TIKTOK_CLIENT_ID;
      const secret = process.env.ADS_TIKTOK_CLIENT_SECRET;
      if (appId && secret) {
        await tiktokFetch<Record<string, unknown>>(`${BASE_URL}/oauth2/revoke_token/`, {
          app_id: appId,
          secret,
          access_token: accessToken,
        });
      }
    } catch (err) {
      logger.warn({ platformId, err }, 'Error al revocar token de TikTok Ads (no crítico)');
    }

    await prisma.adPlatformConnection.update({
      where: { id: platformId },
      data: {
        status: 'DISCONNECTED',
        accessToken: '',
        refreshToken: null,
      },
    });

    logger.info({ tenantId, platformId }, 'TikTok Ads desconectado');
  }

  /**
   * Obtiene la URL de autorización OAuth.
   */
  async getAuthUrl(tenantId: string, redirectUri: string): Promise<AdConnectionAuthUrl> {
    const appId = process.env.ADS_TIKTOK_CLIENT_ID;
    if (!appId) throw new Error('ADS_TIKTOK_CLIENT_ID no configurado');

    const scopes = [
      'ad_management',
      'ad_insights',
      'read_admin',
    ].join(',');

    const url = `${OAUTH_AUTH_URL}?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${tenantId}`;

    return { url, platform: 'TIKTOK' };
  }

  /**
   * Sincroniza la estructura completa de campañas, ad groups y ads desde TikTok Ads.
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
      const { accessToken, accountId } = await getDecryptedToken(platformId);
      const advertiserId = accountId;

      // ─── 1. Obtener campañas ─────────────────────────────────────
      const campaigns = await tiktokPaginatedFetch<Record<string, unknown>>(
        `${BASE_URL}/campaign/get/`,
        { advertiser_id: advertiserId },
        accessToken,
      );

      for (const camp of campaigns) {
        const externalId = String(camp.campaign_id || '');
        if (!externalId) continue;

        const objective = (camp.objective_type as string) || '';
        const rawStatus = (camp.campaign_status as string) || (camp.operation_status as string) || '';
        const status = TIKTOK_STATUS_MAP[rawStatus] || 'ACTIVE';

        const budgetMode = (camp.budget_mode as string) || '';
        let dailyBudget: number | null = null;
        let lifetimeBudget: number | null = null;
        const budget = (camp.budget as number) || 0;

        if (budgetMode === 'BUDGET_MODE_DAY') {
          dailyBudget = budget;
        } else if (budgetMode === 'BUDGET_MODE_TOTAL') {
          lifetimeBudget = budget;
        } else {
          dailyBudget = budget;
        }

        const campaignData = {
          name: (camp.campaign_name as string) || 'Sin nombre',
          status,
          objective: TIKTOK_OBJECTIVE_MAP[objective] || objective || 'CONVERSIONS',
          dailyBudget,
          lifetimeBudget,
          startDate: camp.start_time ? new Date(camp.start_time as string) : null,
          endDate: camp.end_time ? new Date(camp.end_time as string) : null,
          bidStrategy: null as string | null,
          syncedAt: new Date(),
        };

        // TikTok no expone bid_strategy directamente en campaña; se usa BUDGET_MODE_DAY por defecto
        if (budgetMode === 'BUDGET_MODE_TOTAL') {
          campaignData.bidStrategy = 'BID_CAP';
        }

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

      // ─── 2. Obtener ad groups (ad sets en TikTok) ────────────────
      const adGroups = await tiktokPaginatedFetch<Record<string, unknown>>(
        `${BASE_URL}/ad_group/get/`,
        { advertiser_id: advertiserId },
        accessToken,
      );

      for (const ag of adGroups) {
        const externalId = String(ag.adgroup_id || '');
        if (!externalId) continue;

        const campaignExternalId = String(ag.campaign_id || '');
        const localCampaign = await prisma.adCampaign.findFirst({
          where: { externalId: campaignExternalId, platformId },
        });
        if (!localCampaign) continue;

        const rawStatus = (ag.operation_status as string) || (ag.adgroup_status as string) || '';
        const status = TIKTOK_STATUS_MAP[rawStatus] || 'ACTIVE';

        let targeting: unknown = null;
        if (ag.targeting) {
          targeting = JSON.parse(JSON.stringify(ag.targeting));
        }

        let bidAmount: number | null = null;
        if (ag.bid) {
          bidAmount = parseFloat(String(ag.bid));
        }
        if (ag.bid_price) {
          bidAmount = parseFloat(String(ag.bid_price));
        }

        const bidType = (ag.bid_type as string) || (ag.bid_strategy as string) || '';
        const bidStrategy = TIKTOK_BID_STRATEGY_MAP[bidType] || (bidAmount ? 'BID_CAP' : null);

        const optimizationGoal = (ag.optimization_goal as string) || '';
        const mappedGoal = TIKTOK_OPTIMIZATION_MAP[optimizationGoal] || null;

        const budgetMode2 = (ag.budget_mode as string) || '';
        let setDailyBudget: number | null = null;
        let setLifetimeBudget: number | null = null;
        const setBudget = (ag.budget as number) || 0;

        if (budgetMode2 === 'BUDGET_MODE_DAY') {
          setDailyBudget = setBudget;
        } else if (budgetMode2 === 'BUDGET_MODE_TOTAL') {
          setLifetimeBudget = setBudget;
        }

        const setData = {
          name: (ag.adgroup_name as string) || 'Sin nombre',
          status,
          dailyBudget: setDailyBudget,
          lifetimeBudget: setLifetimeBudget,
          bidAmount,
          bidStrategy,
          targeting: targeting as Prisma.InputJsonValue | undefined,
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
      const ads = await tiktokPaginatedFetch<Record<string, unknown>>(
        `${BASE_URL}/ad/get/`,
        { advertiser_id: advertiserId },
        accessToken,
      );

      for (const ad of ads) {
        const externalId = String(ad.ad_id || '');
        if (!externalId) continue;

        const adSetExternalId = String(ad.adgroup_id || '');
        const localAdSet = await prisma.adSet.findFirst({
          where: { externalId: adSetExternalId },
        });
        if (!localAdSet) continue;

        const rawStatus = (ad.operation_status as string) || (ad.ad_status as string) || '';
        const status = TIKTOK_STATUS_MAP[rawStatus] || 'ACTIVE';

        // Extraer datos del creative
        const creatives = ad.creatives as Array<Record<string, unknown>> | undefined;
        const creativeInfo = creatives && creatives.length > 0 ? creatives[0] : null;

        let creativeType = 'IMAGE';
        let headline: string | null = null;
        let primaryText: string | null = null;
        let callToAction: string | null = null;
        let creativeUrl: string | null = null;
        let thumbnailUrl: string | null = null;
        let videoId: string | null = null;
        let destinationUrl: string | null = null;

        if (creativeInfo) {
          headline = (creativeInfo.ad_name as string) || (creativeInfo.title as string) || null;
          primaryText = (creativeInfo.text as string) || null;
          callToAction = (creativeInfo.call_to_action as string) || null;
          creativeUrl = (creativeInfo.image_url as string) || (creativeInfo.video_url as string) || null;
          thumbnailUrl = (creativeInfo.image_url as string) || null;
          destinationUrl = (creativeInfo.click_tracking_url as string) || null;

          if (creativeInfo.video_id || creativeInfo.video_url) {
            creativeType = 'VIDEO';
            videoId = (creativeInfo.video_id as string) || null;
            if (!creativeUrl) {
              creativeUrl = (creativeInfo.video_url as string) || null;
            }
          } else if (creativeInfo.image_ids || creativeInfo.image_url) {
            creativeType = 'IMAGE';
            if (Array.isArray(creativeInfo.image_ids)) {
              creativeUrl = (creativeInfo.image_url as string) || null;
            }
            if (Array.isArray(creativeInfo.image_url)) {
              const urls = creativeInfo.image_url as string[];
              creativeUrl = urls[0] || null;
              thumbnailUrl = urls[0] || null;
            }
          } else if (creativeInfo.ad_format === 'CAROUSEL' || creativeInfo.carousel) {
            creativeType = 'CAROUSEL';
          }
        }

        const adData = {
          name: (ad.ad_name as string) || 'Sin nombre',
          status,
          creativeType: creativeType as 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'COLLECTION' | 'TEXT',
          creativeUrl,
          headline,
          primaryText,
          callToAction,
          destinationUrl,
          thumbnailUrl,
          videoId,
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

      logger.info(result, 'TikTok Ads: sincronización de campañas completada');
    } catch (err) {
      if (err instanceof TiktokAuthError) {
        logger.warn({ platformId }, 'TikTok Ads: token expirado, intentando renovar...');
        try {
          await refreshTokenIfNeeded(platformId);
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
        logger.error({ platformId, err }, 'TikTok Ads: error en syncCampaigns');
      }
    }

    return result;
  }

  /**
   * Sincroniza las métricas (insights) de un período desde TikTok Ads.
   * Usa el endpoint /report/integrated/get/ con dimensiones y métricas.
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
      const advertiserId = accountId;

      // Formato de fechas para TikTok: YYYY-MM-DD
      const startDate = dateFrom.toISOString().split('T')[0];
      const endDate = dateTo.toISOString().split('T')[0];

      // TikTok requiere procesar insights a nivel de campaña, ad group y ad por separado
      // Usamos el endpoint integrado con service_type: "AUCTION" y report_type: "BASIC"
      const dimensions = ['stat_time_day', 'campaign_id', 'campaign_name', 'adgroup_id', 'adgroup_name', 'ad_id', 'ad_name'];
      const metrics = [
        'impressions',
        'clicks',
        'spend',
        'reach',
        'cpc',
        'cpm',
        'ctr',
        'conversion',
        'cost_per_conversion',
        'conversion_rate',
        'conversions',
        'result',
        'result_rate',
        'cost_per_result',
        'video_play_actions',
        'video_views_p50',
        'video_views_p100',
        'video_watched_2s',
        'total_page_view',
      ].join(',');

      const body: Record<string, unknown> = {
        advertiser_id: advertiserId,
        report_type: 'BASIC',
        service_type: 'AUCTION',
        dimensions: dimensions,
        metrics,
        start_date: startDate,
        end_date: endDate,
        page: 1,
        page_size: 100,
      };

      // Llamada inicial para obtener total de páginas
      type InsightPage = {
        list: Array<Record<string, unknown>>;
        page_info: {
          page: number;
          page_size: number;
          total_page: number;
          total_number: number;
        };
      };

      const firstPage = await tiktokFetch<InsightPage>(
        `${BASE_URL}/report/integrated/get/`,
        body,
        accessToken,
      );

      const allRows: Array<Record<string, unknown>> = [...(firstPage.list || [])];
      const totalPages = firstPage.page_info?.total_page || 1;

      for (let p = 2; p <= totalPages; p++) {
        const pageBody = { ...body, page: p };
        const pageData = await tiktokFetch<InsightPage>(
          `${BASE_URL}/report/integrated/get/`,
          pageBody,
          accessToken,
        );
        if (pageData.list) {
          allRows.push(...pageData.list);
        }
        // Rate limit: 10 req/s -> 150ms entre páginas
        if (p < totalPages) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }

      for (const insight of allRows) {
        const campaignExternalId = String(insight.campaign_id || '');
        const adSetExternalId = String(insight.adgroup_id || '');
        const adExternalId = String(insight.ad_id || '');

        if (!campaignExternalId) continue;

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

        const spend = insight.spend ? parseFloat(String(insight.spend)) : 0;
        const conversions = insight.conversions ? parseInt(String(insight.conversions), 10) : 0;
        const conversion = insight.conversion ? parseInt(String(insight.conversion), 10) : 0;
        const totalConversions = conversions + conversion;

        // TikTok devuelve dimension como stat_time_day para report_type=BASIC
        const statDate = String(insight.stat_time_day || startDate);
        const dateStart = new Date(statDate + 'T00:00:00Z');
        const dateEnd = new Date(statDate + 'T00:00:00Z');

        const insightData = {
          tenantId,
          platformId,
          campaignId: localCampaign?.id || null,
          adSetId: localAdSet?.id || null,
          adId: localAd?.id || null,
          dateStart,
          dateEnd,
          impressions: insight.impressions ? parseInt(String(insight.impressions), 10) : 0,
          clicks: insight.clicks ? parseInt(String(insight.clicks), 10) : 0,
          spend: Math.round(spend * 100) / 100,
          reach: insight.reach ? parseInt(String(insight.reach), 10) : 0,
          frequency: 0,
          cpc: insight.cpc ? parseFloat(String(insight.cpc)) : 0,
          cpm: insight.cpm ? parseFloat(String(insight.cpm)) : 0,
          ctr: insight.ctr ? parseFloat(String(insight.ctr)) : 0,
          conversions: totalConversions,
          conversionRate: insight.conversion_rate ? parseFloat(String(insight.conversion_rate)) : 0,
          cpa: totalConversions > 0 ? spend / totalConversions : 0,
          roas: 0,
          revenue: 0,
          leads: 0,
          costPerLead: 0,
          qualityRank: null,
          engagementRate: null,
          videoPlays: insight.video_play_actions ? parseInt(String(insight.video_play_actions), 10) : null,
          videoAvgWatchTime: insight.video_views_p50 ? parseFloat(String(insight.video_views_p50)) : null,
          canvas: {
            campaignName: String(insight.campaign_name || ''),
            adSetName: String(insight.adgroup_name || ''),
            adName: String(insight.ad_name || ''),
          },
        };

        const existingInsight = await prisma.adInsight.findFirst({
          where: {
            platformId,
            campaignId: localCampaign?.id || 'no-id',
            adSetId: localAdSet?.id || 'no-id',
            adId: localAd?.id || 'no-id',
            dateStart,
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
        { platformId, from: startDate, to: endDate, imported: result.insightsImported },
        'TikTok Ads: insights sincronizados',
      );
    } catch (err) {
      if (err instanceof TiktokAuthError) {
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
        logger.error({ platformId, err }, 'TikTok Ads: error en syncInsights');
      }
    }

    return result;
  }

  /**
   * Pausa una campaña en TikTok Ads.
   * TikTok usa POST /campaign/update/ con status CAMPAIGN_STATUS_DISABLE.
   */
  async pauseCampaign(campaignId: string, externalId: string): Promise<void> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { platform: true },
    });
    if (!campaign) throw new Error(`Campaña no encontrada: ${campaignId}`);

    const { accessToken, accountId } = await getDecryptedToken(campaign.platformId);

    await tiktokFetch<Record<string, unknown>>(
      `${BASE_URL}/campaign/update/`,
      {
        advertiser_id: accountId,
        campaign_id: externalId,
        operation_status: 'DISABLE',
      },
      accessToken,
    );
  }

  /**
   * Reanuda una campaña pausada en TikTok Ads.
   */
  async resumeCampaign(campaignId: string, externalId: string): Promise<void> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { platform: true },
    });
    if (!campaign) throw new Error(`Campaña no encontrada: ${campaignId}`);

    const { accessToken, accountId } = await getDecryptedToken(campaign.platformId);

    await tiktokFetch<Record<string, unknown>>(
      `${BASE_URL}/campaign/update/`,
      {
        advertiser_id: accountId,
        campaign_id: externalId,
        operation_status: 'ENABLE',
      },
      accessToken,
    );
  }

  /**
   * Actualiza el presupuesto diario de una campaña en TikTok Ads.
   * TikTok maneja budgets en moneda local (decimal). Se usa budget_mode=BUDGET_MODE_DAY.
   */
  async updateBudget(campaignId: string, externalId: string, budget: number): Promise<void> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { platform: true },
    });
    if (!campaign) throw new Error(`Campaña no encontrada: ${campaignId}`);

    const { accessToken, accountId } = await getDecryptedToken(campaign.platformId);

    await tiktokFetch<Record<string, unknown>>(
      `${BASE_URL}/campaign/update/`,
      {
        advertiser_id: accountId,
        campaign_id: externalId,
        budget_mode: 'BUDGET_MODE_DAY',
        budget: budget,
      },
      accessToken,
    );
  }

  /**
   * Crea una campaña en TikTok Ads.
   * La campaña se crea pausada (DISABLE) por seguridad.
   */
  async createCampaign(
    tenantId: string,
    platformId: string,
    data: AdCampaignInput,
  ): Promise<AdCampaignOutput> {
    const { accessToken, accountId } = await getDecryptedToken(platformId);
    const advertiserId = accountId;

    // Mapear objetivo Volkern → TikTok
    const objectiveMap: Record<string, string> = {
      CONVERSIONS: 'CONVERSIONS',
      TRAFFIC: 'TRAFFIC',
      AWARENESS: 'REACH',
      LEAD_GENERATION: 'LEAD_GENERATION',
      ENGAGEMENT: 'ENGAGEMENT',
      SALES: 'CATALOG_SALES',
    };
    const tiktokObjective = objectiveMap[data.objective || 'CONVERSIONS'] || 'CONVERSIONS';

    let budgetMode = 'BUDGET_MODE_DAY';
    let budgetAmount = data.dailyBudget || 5;

    if (data.lifetimeBudget !== undefined) {
      budgetMode = 'BUDGET_MODE_TOTAL';
      budgetAmount = data.lifetimeBudget;
    }

    const body: Record<string, unknown> = {
      advertiser_id: advertiserId,
      campaign_name: data.name,
      objective_type: tiktokObjective,
      budget_mode: budgetMode,
      budget: budgetAmount,
      operation_status: 'DISABLE',
    };

    const response = await tiktokFetch<{ campaign_id: string }>(
      `${BASE_URL}/campaign/create/`,
      body,
      accessToken,
    );

    const externalId = response.campaign_id;

    // Guardar campaña localmente
    await prisma.adCampaign.create({
      data: {
        tenantId,
        platformId,
        externalId,
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
      externalId,
      name: data.name,
      status: 'PAUSED',
      ...(data.objective && { objective: data.objective }),
      ...(data.dailyBudget !== undefined && { dailyBudget: data.dailyBudget }),
    };
  }

  // ─── Publicaciones ADS ─────────────────────────────────────────────
  // v1: stubs. TikTok Ads requiere:
  //   1. POST /file/video/upload/  para subir el medio
  //   2. POST /ad/create/          para crear el anuncio
  //   3. Manejar status PENDING_REVIEW/REVIEWING (TikTok revisa antes de aprobar)

  async publishPublication(_input: PublishPublicationInput): Promise<PublishPublicationResult> {
    throw new Error(
      '[TikTokAds] publishPublication no implementado en v1. Use plataforma=META o implemente /file/video/upload + /ad/create.',
    );
  }

  async pausePublication(_externalAdId: string): Promise<void> {
    throw new Error('[TikTokAds] pausePublication no implementado en v1.');
  }

  async resumePublication(_externalAdId: string): Promise<void> {
    throw new Error('[TikTokAds] resumePublication no implementado en v1.');
  }

  async deletePublication(_externalAdId: string): Promise<void> {
    throw new Error('[TikTokAds] deletePublication no implementado en v1.');
  }
}
