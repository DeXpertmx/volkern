/**
 * Conector para Google Ads API v16 — REST + GAQL
 *
 * Implementa AdPlatformConnector para sincronizar campañas, ad groups,
 * anuncios e insights desde Google Ads hacia el modelo unificado de Volkern.
 *
 * Autenticación:
 *   - OAuth 2.0 con refresh token (long-lived)
 *   - Developer Token requerido (solicitud a Google)
 *   - Tokens cifrados en Vault del tenant
 *
 * Endpoints principales:
 *   POST /v16/customers/{customer_id}/googleAds:search  → GAQL queries
 *   POST /v16/customers/{customer_id}/campaigns/mutate  → CRUD campañas
 *
 * Rate Limits: ~50,000 operaciones/día por cliente
 * Developer Token: https://developers.google.com/google-ads/api/docs/first-call/dev-token
 *
 * @see https://developers.google.com/google-ads/api/reference/rpc/v16
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

const API_VERSION = 'v16';
const BASE_URL = `https://googleads.googleapis.com/${API_VERSION}`;
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// ─── Helpers ──────────────────────────────────────────────────────────

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

interface GoogleErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
    details?: Array<Record<string, unknown>>;
  };
}

interface GoogleAdsRow {
  customer?: {
    id: string;
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
  };
  campaign?: {
    id: string;
    name: string;
    status: string;
    campaignBudget?: string;
    startDate?: string;
    endDate?: string;
    advertisingChannelType?: string;
    optimizationGoalSetting?: { optimizationGoalTypes?: string[] };
    biddingStrategyType?: string;
    manualCpc?: { enhancedCpcEnabled?: boolean };
    manualCpm?: unknown;
    targetCpa?: { targetCpaMicros?: string };
    targetRoas?: { targetRoas?: number };
    targetSpend?: unknown;
    percentCpc?: { cpcBidCeilingMicros?: string };
    maximizeConversions?: { targetCpaMicros?: string };
    maximizeConversionValue?: { targetRoas?: number };
  };
  adGroup?: {
    id: string;
    name: string;
    status: string;
    campaign: string;
    type?: string;
    cpcBidMicros?: string;
    cpmBidMicros?: string;
    targetingSetting?: { targetRestrictions?: Array<Record<string, unknown>> };
  };
  adGroupAd?: {
    adGroup: string;
    ad: {
      id: string;
      name?: string;
      type?: string;
      finalUrls?: string[];
      displayUrl?: string;
      expandedTextAd?: {
        headline: string;
        headlinePart2?: string;
        description: string;
        description2?: string;
        path1?: string;
        path2?: string;
      };
      responsiveSearchAd?: {
        headlines: Array<{ text: string; pinnedField?: string }>;
        descriptions: Array<{ text: string; pinnedField?: string }>;
        path1?: string;
        path2?: string;
      };
      imageAd?: {
        pixelPageUrl?: string;
        name?: string;
        mediaFile?: string;
        previewImageUrl?: string;
      };
      videoAd?: {
        videoId?: string;
        displayUrl?: string;
        actionHeadline?: string;
      };
      appAd?: unknown;
    };
    status: string;
    adStrength?: string;
    policySummary?: { approvalStatus?: string };
  };
  metrics?: {
    impressions: string;
    clicks: string;
    costMicros: string;
    conversions: string;
    conversionsValue: string;
    conversionRate: number;
    costPerConversion: string;
    ctr: number;
    averageCpc: string;
    averageCpm: string;
    reach?: string;
    frequency?: number;
    videoViews?: string;
    videoViewRate?: number;
    averageCpv?: string;
    allConversions: string;
    allConversionsValue: string;
    conversionValuePerCost: number;
  };
  segments?: {
    date: string;
    dayOfWeek?: string;
    hour?: number;
  };
  campaignBudget?: {
    id: string;
    amountMicros: string;
    deliveryMethod: string;
    period: string;
  };
}

async function googleFetch<T>(
  url: string,
  accessToken: string,
  developerToken: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Developer-Token': developerToken,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = { headers, method: body ? 'POST' : 'GET' };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as GoogleErrorResponse;
    const msg = errorBody.error?.message || `HTTP ${response.status}`;
    const code = errorBody.error?.code || response.status;

    if (code === 401 || code === 403) {
      throw new GoogleAuthError(msg, code);
    }
    throw new GoogleApiError(msg, code, response.status);
  }

  return response.json() as Promise<T>;
}

class GoogleApiError extends Error {
  constructor(
    message: string,
    public apiCode: number,
    public httpStatus: number,
  ) {
    super(`[GoogleAds API] ${message} (code: ${apiCode})`);
    this.name = 'GoogleApiError';
  }
}

class GoogleAuthError extends Error {
  constructor(message: string, public apiCode: number) {
    super(`[GoogleAds Auth] ${message} (code: ${apiCode})`);
    this.name = 'GoogleAuthError';
  }
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
    throw new Error(`Google Ads config not found (id: ${platformId})`);
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

async function refreshTokenIfNeeded(platformId: string): Promise<string> {
  const config = await prisma.adPlatformConnection.findUnique({
    where: { id: platformId },
    include: { tenant: { select: { vaultSeed: true } } },
  });

  if (!config) throw new Error(`Platform connection not found: ${platformId}`);
  if (!config.tenant.vaultSeed) throw new Error('vaultSeed missing');

  const clientId = process.env.ADS_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.ADS_GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('ADS_GOOGLE_CLIENT_ID y ADS_GOOGLE_CLIENT_SECRET requeridos para renovar token');
  }

  const currentRefreshToken = config.refreshToken
    ? VaultService.decrypt(config.refreshToken, config.tenantId, config.tenant.vaultSeed)
    : null;

  if (!currentRefreshToken) {
    throw new GoogleAuthError('No hay refresh token para renovar', 401);
  }

  const tokenResponse = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: currentRefreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResponse.ok) {
    const err = await tokenResponse.json().catch(() => ({}));
    throw new GoogleAuthError(
      `Error refreshing token: ${(err as Record<string, unknown>)?.error_description || tokenResponse.statusText}`,
      tokenResponse.status,
    );
  }

  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

  const newAccessToken = VaultService.encrypt(tokenData.access_token, config.tenantId, config.tenant.vaultSeed);

  await prisma.adPlatformConnection.update({
    where: { id: platformId },
    data: {
      accessToken: newAccessToken,
      tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      status: 'CONNECTED',
    },
  });

  logger.info({ platformId }, 'Google Ads token renovado exitosamente');
  return tokenData.access_token;
}

// ─── GAQL Queries ─────────────────────────────────────────────────────

/**
 * Ejecuta una consulta GAQL y devuelve los resultados paginados.
 */
async function searchGoogleAds(
  customerId: string,
  accessToken: string,
  developerToken: string,
  query: string,
): Promise<GoogleAdsRow[]> {
  const allRows: GoogleAdsRow[] = [];
  let pageToken: string | null = null;

  do {
    const body: Record<string, unknown> = { query };
    if (pageToken) body.pageToken = pageToken;

    const result = await googleFetch<{
      results?: GoogleAdsRow[];
      nextPageToken?: string;
      totalResultsCount?: string;
      fieldMask?: string;
    }>(
      `${BASE_URL}/customers/${customerId}/googleAds:search`,
      accessToken,
      developerToken,
      body,
    );

    if (result.results) {
      allRows.push(...result.results);
    }
    pageToken = result.nextPageToken || null;
  } while (pageToken);

  return allRows;
}

/**
 * Ejecuta una mutación en Google Ads (crear, actualizar, eliminar).
 */
async function mutateGoogleAds<T>(
  customerId: string,
  accessToken: string,
  developerToken: string,
  resource: string,
  operations: Array<Record<string, unknown>>,
): Promise<T> {
  return googleFetch<T>(
    `${BASE_URL}/customers/${customerId}/${resource}/mutate`,
    accessToken,
    developerToken,
    { operations },
  );
}

// ─── Mapeo de tipos Google → Volkern ──────────────────────────────────

const GOOGLE_STATUS_MAP: Record<string, string> = {
  ENABLED: 'ACTIVE',
  PAUSED: 'PAUSED',
  REMOVED: 'ARCHIVED',
  UNKNOWN: 'PAUSED',
};

const GOOGLE_CHANNEL_MAP: Record<string, string> = {
  SEARCH: 'CONVERSIONS',
  DISPLAY: 'AWARENESS',
  VIDEO: 'ENGAGEMENT',
  SHOPPING: 'SALES',
  PERFORMANCE_MAX: 'CONVERSIONS',
  DEMAND_GEN: 'LEAD_GENERATION',
  DISCOVERY: 'AWARENESS',
  LOCAL: 'TRAFFIC',
  TRAFFIC: 'TRAFFIC',
  UNIVERSAL_APP: 'CONVERSIONS',
};

const GOOGLE_BID_STRATEGY_MAP: Record<string, string> = {
  MANUAL_CPC: 'BID_CAP',
  MANUAL_CPM: 'BID_CAP',
  MANUAL_CPV: 'BID_CAP',
  TARGET_CPA: 'TARGET_CPA',
  TARGET_ROAS: 'TARGET_ROAS',
  TARGET_SPEND: 'LOWEST_COST',
  MAXIMIZE_CONVERSIONS: 'LOWEST_COST',
  MAXIMIZE_CONVERSION_VALUE: 'TARGET_ROAS',
  PERCENT_CPC: 'COST_CAP',
  ENHANCED_CPC: 'COST_CAP',
};

// ─── Conector ─────────────────────────────────────────────────────────

export class GoogleAdsConnector implements AdPlatformConnector {
  /**
   * Conecta una cuenta de Google Ads: canjea el auth code por tokens,
   * obtiene el customer ID y guarda la conexión cifrada en Vault.
   */
  async connect(tenantId: string, input: AdConnectionInput): Promise<void> {
    const clientId = process.env.ADS_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.ADS_GOOGLE_CLIENT_SECRET;
    const developerToken = process.env.ADS_GOOGLE_DEVELOPER_TOKEN;
    if (!clientId || !clientSecret || !developerToken) {
      throw new Error('ADS_GOOGLE_CLIENT_ID, ADS_GOOGLE_CLIENT_SECRET y ADS_GOOGLE_DEVELOPER_TOKEN son requeridos en .env');
    }

    // 1. Canjear auth code por tokens
    const tokenResponse = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: input.authCode,
        redirect_uri: input.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.json().catch(() => ({}));
      throw new Error(
        `Error exchanging auth code: ${(err as Record<string, unknown>)?.error_description || tokenResponse.statusText}`,
      );
    }

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

    if (!tokenData.refresh_token) {
      throw new Error(
        'Google Ads: No se recibió refresh_token. Asegúrate de incluir access_type=offline en la URL de autorización.',
      );
    }

    // 2. Listar customers accesibles
    const customersUrl = `https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`;
    const customersData = await googleFetch<{
      resourceNames?: string[];
    }>(customersUrl, tokenData.access_token, developerToken);

    if (!customersData.resourceNames || customersData.resourceNames.length === 0) {
      throw new Error('No se encontraron cuentas de Google Ads accesibles');
    }

    // Extraer customer ID del resourceName: "customers/1234567890"
    const customerResource = customersData.resourceNames[0];
    const customerId = customerResource.replace('customers/', '');
    const loginCustomerId = customerId;

    // 3. Obtener información del customer
    const customerInfoQuery = `
      SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone
      FROM customer
      WHERE customer.id = ${customerId}
    `;
    let customerName = customerId;
    try {
      const customerRows = await searchGoogleAds(customerId, tokenData.access_token, developerToken, customerInfoQuery);
      if (customerRows.length > 0 && customerRows[0].customer) {
        customerName = customerRows[0].customer.descriptiveName || customerId;
      }
    } catch (err) {
      logger.warn({ err }, 'Google Ads: no se pudo obtener nombre del customer, usando ID como nombre');
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
    const encryptedRefreshToken = VaultService.encrypt(tokenData.refresh_token!, tenantId, tenant.vaultSeed);

    await prisma.adPlatformConnection.create({
      data: {
        tenantId,
        platform: 'GOOGLE',
        accountId: customerId,
        accountName: customerName,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        status: 'CONNECTED',
        metadata: {
          developerToken,
          loginCustomerId,
          currencyCode: 'USD',
          timeZone: 'America/Mexico_City',
        },
      },
    });

    logger.info({ tenantId, accountId: customerId }, 'Google Ads conectado exitosamente');
  }

  /**
   * Desconecta la cuenta: revoca tokens y marca como DISCONNECTED.
   */
  async disconnect(tenantId: string, platformId: string): Promise<void> {
    try {
      const { accessToken } = await getDecryptedToken(platformId);
      const clientId = process.env.ADS_GOOGLE_CLIENT_ID;
      if (clientId) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, { method: 'POST' });
      }
    } catch (err) {
      logger.warn({ platformId, err }, 'Error al revocar token de Google Ads (no crítico)');
    }

    await prisma.adPlatformConnection.update({
      where: { id: platformId },
      data: {
        status: 'DISCONNECTED',
        accessToken: '',
        refreshToken: null,
      },
    });

    logger.info({ tenantId, platformId }, 'Google Ads desconectado');
  }

  /**
   * Obtiene la URL de autorización OAuth con access_type=offline para obtener refresh_token.
   */
  async getAuthUrl(tenantId: string, redirectUri: string): Promise<AdConnectionAuthUrl> {
    const clientId = process.env.ADS_GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('ADS_GOOGLE_CLIENT_ID no configurado');

    const scopes = [
      'https://www.googleapis.com/auth/adwords',
    ].join(' ');

    const url = `${OAUTH_AUTH_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&access_type=offline&include_granted_scopes=true&response_type=code&state=${tenantId}&prompt=consent`;

    return { url, platform: 'GOOGLE' };
  }

  /**
   * Sincroniza la estructura completa de campañas, ad groups y anuncios desde Google Ads.
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
      const developerToken = process.env.ADS_GOOGLE_DEVELOPER_TOKEN || '';
      const customerId = accountId;

      // ─── 1. Obtener campañas ─────────────────────────────────────
      const campaignQuery = `
        SELECT
          campaign.id, campaign.name, campaign.status,
          campaign.start_date, campaign.end_date,
          campaign.advertising_channel_type,
          campaign.optimization_goal_setting.optimization_goal_types,
          campaign.bidding_strategy_type,
          campaign_budget.id, campaign_budget.amount_micros,
          campaign_budget.delivery_method, campaign_budget.period
        FROM campaign
        WHERE campaign.status != 'REMOVED'
        ORDER BY campaign.id
        LIMIT 500
      `;

      const campaignRows = await searchGoogleAds(customerId, accessToken, developerToken, campaignQuery);

      for (const row of campaignRows) {
        if (!row.campaign) continue;

        const externalId = row.campaign.id;
        const campaignStatus = GOOGLE_STATUS_MAP[row.campaign.status] || 'ACTIVE';

        let dailyBudget: number | null = null;
        let lifetimeBudget: number | null = null;
        if (row.campaignBudget) {
          const amountMicros = parseFloat(row.campaignBudget.amountMicros || '0');
          const amount = amountMicros / 1_000_000;
          if (row.campaignBudget.period === 'DAILY') {
            dailyBudget = amount;
          } else {
            lifetimeBudget = amount;
          }
        }

        const bidStrategy = GOOGLE_BID_STRATEGY_MAP[row.campaign.biddingStrategyType || ''] || null;
        const objective = GOOGLE_CHANNEL_MAP[row.campaign.advertisingChannelType || ''] || 'CONVERSIONS';

        const campaignData = {
          name: row.campaign.name || 'Sin nombre',
          status: campaignStatus,
          objective,
          dailyBudget,
          lifetimeBudget,
          startDate: row.campaign.startDate ? parseGoogleDate(row.campaign.startDate) : null,
          endDate: row.campaign.endDate ? parseGoogleDate(row.campaign.endDate) : null,
          bidStrategy,
          syncedAt: new Date(),
        };

        const existing = await prisma.adCampaign.findFirst({
          where: { externalId, platformId },
        });

        if (existing) {
          await prisma.adCampaign.update({ where: { id: existing.id }, data: campaignData });
          result.campaignsUpdated++;
        } else {
          await prisma.adCampaign.create({
            data: { ...campaignData, externalId, tenantId, platformId, isVolkernManaged: true },
          });
          result.campaignsCreated++;
        }
      }

      // ─── 2. Obtener ad groups ────────────────────────────────────
      const adGroupQuery = `
        SELECT
          ad_group.id, ad_group.name, ad_group.status,
          ad_group.type, ad_group.campaign,
          ad_group.cpc_bid_micros, ad_group.cpm_bid_micros,
          ad_group.targeting_setting.target_restrictions
        FROM ad_group
        WHERE ad_group.status != 'REMOVED'
        ORDER BY ad_group.id
        LIMIT 500
      `;

      const adGroupRows = await searchGoogleAds(customerId, accessToken, developerToken, adGroupQuery);

      for (const row of adGroupRows) {
        if (!row.adGroup || !row.adGroup.campaign) continue;

        const externalId = row.adGroup.id;
        const campaignResource = row.adGroup.campaign;
        const campaignExternalId = campaignResource.split('/').pop() || '';

        const localCampaign = await prisma.adCampaign.findFirst({
          where: { externalId: campaignExternalId, platformId },
        });
        if (!localCampaign) continue;

        const status = GOOGLE_STATUS_MAP[row.adGroup.status] || 'ACTIVE';
        const bidAmountMicros = parseFloat(row.adGroup.cpcBidMicros || '0');
        const bidAmount = bidAmountMicros > 0 ? bidAmountMicros / 1_000_000 : null;

        let targeting: Record<string, unknown> | null = null;
        if (row.adGroup.targetingSetting?.targetRestrictions) {
          targeting = { targetRestrictions: row.adGroup.targetingSetting.targetRestrictions };
        }

        const setData = {
          name: row.adGroup.name || 'Sin nombre',
          status,
          bidAmount,
          bidStrategy: bidAmount ? 'BID_CAP' : null,
          targeting: targeting as Prisma.JsonValue || undefined,
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
      const adsQuery = `
        SELECT
          ad_group_ad.ad.id, ad_group_ad.ad.name,
          ad_group_ad.ad.type, ad_group_ad.status,
          ad_group_ad.ad.final_urls, ad_group_ad.ad.display_url,
          ad_group_ad.ad.expanded_text_ad.headline,
          ad_group_ad.ad.expanded_text_ad.headline_part2,
          ad_group_ad.ad.expanded_text_ad.description,
          ad_group_ad.ad.expanded_text_ad.path1,
          ad_group_ad.ad.responsive_search_ad.headlines,
          ad_group_ad.ad.responsive_search_ad.descriptions,
          ad_group_ad.ad.responsive_search_ad.path1,
          ad_group_ad.ad.image_ad.name,
          ad_group_ad.ad.image_ad.media_file,
          ad_group_ad.ad.video_ad.video_id,
          ad_group_ad.ad.video_ad.display_url,
          ad_group_ad.ad.video_ad.action_headline,
          ad_group_ad.ad_strength,
          ad_group_ad.policy_summary.approval_status,
          ad_group_ad.ad_group
        FROM ad_group_ad
        WHERE ad_group_ad.status != 'REMOVED'
        ORDER BY ad_group_ad.ad.id
        LIMIT 500
      `;

      const adsRows = await searchGoogleAds(customerId, accessToken, developerToken, adsQuery);

      for (const row of adsRows) {
        if (!row.adGroupAd || !row.adGroupAd.ad) continue;

        const externalId = row.adGroupAd.ad.id;
        const adGroupResource = row.adGroupAd.adGroup || '';
        const adSetExternalId = adGroupResource.split('/').pop() || '';

        const localAdSet = await prisma.adSet.findFirst({
          where: { externalId: adSetExternalId },
        });
        if (!localAdSet) continue;

        const ad = row.adGroupAd.ad;
        let creativeType: string = 'TEXT';
        let headline: string | null = null;
        let primaryText: string | null = null;
        let callToAction: string | null = null;
        let creativeUrl: string | null = null;
        let thumbnailUrl: string | null = null;
        let videoId: string | null = null;
        let destinationUrl: string | null = null;

        if (ad.expandedTextAd) {
          creativeType = 'TEXT';
          headline = ad.expandedTextAd.headline || null;
          if (ad.expandedTextAd.headlinePart2) {
            headline = `${headline} | ${ad.expandedTextAd.headlinePart2}`;
          }
          primaryText = ad.expandedTextAd.description || null;
          destinationUrl = ad.finalUrls?.[0] || ad.displayUrl || null;
        } else if (ad.responsiveSearchAd) {
          creativeType = 'TEXT';
          const headlines = ad.responsiveSearchAd.headlines || [];
          const descriptions = ad.responsiveSearchAd.descriptions || [];
          headline = headlines.map((h: { text: string }) => h.text).join(' | ');
          primaryText = descriptions.map((d: { text: string }) => d.text).join(' - ');
          destinationUrl = ad.finalUrls?.[0] || null;
        } else if (ad.imageAd) {
          creativeType = 'IMAGE';
          headline = ad.imageAd.name || null;
          creativeUrl = ad.imageAd.mediaFile || null;
          destinationUrl = ad.imageAd.pixelPageUrl || null;
        } else if (ad.videoAd) {
          creativeType = 'VIDEO';
          headline = ad.videoAd.actionHeadline || null;
          videoId = ad.videoAd.videoId || null;
          destinationUrl = ad.videoAd.displayUrl || null;
        }

        const status = GOOGLE_STATUS_MAP[row.adGroupAd.status] || 'ACTIVE';

        const adData = {
          name: row.adGroupAd.ad.name || 'Sin nombre',
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

      await prisma.adPlatformConnection.update({
        where: { id: platformId },
        data: { lastSyncedAt: new Date() },
      });

      logger.info(result, 'Google Ads: sincronización de campañas completada');
    } catch (err) {
      if (err instanceof GoogleAuthError) {
        logger.warn({ platformId }, 'Google Ads: token expirado, intentando renovar...');
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
        logger.error({ platformId, err }, 'Google Ads: error en syncCampaigns');
      }
    }

    return result;
  }

  /**
   * Sincroniza las métricas (insights) de un período desde Google Ads.
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
      const developerToken = process.env.ADS_GOOGLE_DEVELOPER_TOKEN || '';
      const customerId = accountId;

      const since = dateFrom.toISOString().split('T')[0];
      const until = dateTo.toISOString().split('T')[0];

      const insightsQuery = `
        SELECT
          campaign.id, campaign.name,
          ad_group.id, ad_group.name,
          ad_group_ad.ad.id, ad_group_ad.ad.name,
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.conversions, metrics.conversions_value,
          metrics.conversion_rate, metrics.cost_per_conversion,
          metrics.ctr, metrics.average_cpc, metrics.average_cpm,
          metrics.reach, metrics.frequency,
          metrics.video_views, metrics.video_view_rate,
          metrics.all_conversions, metrics.all_conversions_value,
          metrics.conversion_value_per_cost,
          segments.date
        FROM ad_group_ad
        WHERE segments.date BETWEEN '${since}' AND '${until}'
          AND ad_group_ad.status != 'REMOVED'
        ORDER BY segments.date
        LIMIT 500
      `;

      const insightRows = await searchGoogleAds(customerId, accessToken, developerToken, insightsQuery);

      for (const row of insightRows) {
        const campaignExternalId = row.campaign?.id || '';
        const adSetExternalId = row.adGroup?.id || '';
        const adExternalId = row.adGroupAd?.ad?.id || '';

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

        const metrics = row.metrics;
        if (!metrics) continue;

        const costMicros = parseFloat(metrics.costMicros || '0');
        const spend = costMicros / 1_000_000;
        const conversions = parseInt(metrics.conversions || '0', 10);
        const conversionsValue = parseFloat(metrics.conversionsValue || '0');

        const insightDate = row.segments?.date || since;
        const dateStart = new Date(insightDate + 'T00:00:00Z');
        const dateEnd = new Date(insightDate + 'T00:00:00Z');

        const insightData = {
          tenantId,
          platformId,
          campaignId: localCampaign?.id || null,
          adSetId: localAdSet?.id || null,
          adId: localAd?.id || null,
          dateStart,
          dateEnd,
          impressions: parseInt(metrics.impressions || '0', 10),
          clicks: parseInt(metrics.clicks || '0', 10),
          spend: Math.round(spend * 100) / 100,
          reach: metrics.reach ? parseInt(metrics.reach, 10) : 0,
          frequency: metrics.frequency || 0,
          cpc: parseFloat(metrics.averageCpc || '0') / 1_000_000,
          cpm: parseFloat(metrics.averageCpm || '0') / 1_000_000,
          ctr: metrics.ctr || 0,
          conversions,
          conversionRate: metrics.conversionRate || 0,
          cpa: conversions > 0 ? spend / conversions : 0,
          roas: metrics.conversionValuePerCost || 0,
          revenue: Math.round(conversionsValue * 100) / 100,
          leads: 0,
          costPerLead: 0,
          qualityRank: null,
          engagementRate: null,
          videoPlays: metrics.videoViews ? parseInt(metrics.videoViews, 10) : null,
          videoAvgWatchTime: null,
          canvas: {
            campaignName: row.campaign?.name || '',
            adSetName: row.adGroup?.name || '',
            adName: row.adGroupAd?.ad?.name || '',
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
        { platformId, from: since, to: until, imported: result.insightsImported },
        'Google Ads: insights sincronizados',
      );
    } catch (err) {
      if (err instanceof GoogleAuthError) {
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
        logger.error({ platformId, err }, 'Google Ads: error en syncInsights');
      }
    }

    return result;
  }

  /**
   * Pausa una campaña en Google Ads mediante mutate.
   */
  async pauseCampaign(campaignId: string, externalId: string): Promise<void> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { platform: true },
    });
    if (!campaign) throw new Error(`Campaña no encontrada: ${campaignId}`);

    const { accessToken, accountId } = await getDecryptedToken(campaign.platformId);
    const developerToken = process.env.ADS_GOOGLE_DEVELOPER_TOKEN || '';

    await mutateGoogleAds<{ results?: Array<Record<string, unknown>> }>(
      accountId,
      accessToken,
      developerToken,
      'campaigns',
      [{
        updateMask: 'status',
        update: {
          resourceName: `customers/${accountId}/campaigns/${externalId}`,
          status: 'PAUSED',
        },
      }],
    );
  }

  /**
   * Reanuda una campaña pausada en Google Ads.
   */
  async resumeCampaign(campaignId: string, externalId: string): Promise<void> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { platform: true },
    });
    if (!campaign) throw new Error(`Campaña no encontrada: ${campaignId}`);

    const { accessToken, accountId } = await getDecryptedToken(campaign.platformId);
    const developerToken = process.env.ADS_GOOGLE_DEVELOPER_TOKEN || '';

    await mutateGoogleAds<{ results?: Array<Record<string, unknown>> }>(
      accountId,
      accessToken,
      developerToken,
      'campaigns',
      [{
        updateMask: 'status',
        update: {
          resourceName: `customers/${accountId}/campaigns/${externalId}`,
          status: 'ENABLED',
        },
      }],
    );
  }

  /**
   * Actualiza el presupuesto diario de una campaña en Google Ads.
   * Google maneja budgets en micros (1 USD = 1,000,000 micros).
   */
  async updateBudget(campaignId: string, externalId: string, budget: number): Promise<void> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { platform: true },
    });
    if (!campaign) throw new Error(`Campaña no encontrada: ${campaignId}`);

    const { accessToken, accountId } = await getDecryptedToken(campaign.platformId);
    const developerToken = process.env.ADS_GOOGLE_DEVELOPER_TOKEN || '';
    const budgetMicros = Math.round(budget * 1_000_000);

    // El externalId es el ID de la campaña, no del presupuesto.
    // Buscamos el campaignBudget real asociado a la campaña.
    const budgetQuery = `
      SELECT campaign.campaignBudget
      FROM campaign
      WHERE campaign.id = '${externalId}'
    `;
    const budgetRows = await searchGoogleAds(accountId, accessToken, developerToken, budgetQuery);
    const budgetResourceName = budgetRows[0]?.campaign?.campaignBudget;
    if (!budgetResourceName) {
      throw new Error(`Campaign budget not found for campaign ${externalId}`);
    }
    const budgetId = budgetResourceName.split('/').pop();

    await mutateGoogleAds<{ results?: Array<Record<string, unknown>> }>(
      accountId,
      accessToken,
      developerToken,
      'campaignBudgets',
      [{
        updateMask: 'amountMicros',
        update: {
          resourceName: `customers/${accountId}/campaignBudgets/${budgetId}`,
          amountMicros: budgetMicros.toString(),
        },
      }],
    );
  }

  /**
   * Crea una campaña en Google Ads junto con su presupuesto y ad group default.
   * La campaña se crea pausada por seguridad.
   */
  async createCampaign(
    tenantId: string,
    platformId: string,
    data: AdCampaignInput,
  ): Promise<AdCampaignOutput> {
    const { accessToken, accountId } = await getDecryptedToken(platformId);
    const developerToken = process.env.ADS_GOOGLE_DEVELOPER_TOKEN || '';
    const customerId = accountId;

    const channelMap: Record<string, string> = {
      CONVERSIONS: 'SEARCH',
      TRAFFIC: 'SEARCH',
      AWARENESS: 'DISPLAY',
      LEAD_GENERATION: 'DEMAND_GEN',
      ENGAGEMENT: 'VIDEO',
      SALES: 'SHOPPING',
    };
    const channelType = channelMap[data.objective || 'CONVERSIONS'] || 'SEARCH';

    // 1. Crear campaign budget
    const dailyBudgetMicros = data.dailyBudget ? Math.round(data.dailyBudget * 1_000_000) : 5_000_000;
    const budgetOperations = [{
      create: {
        name: `Volkern Budget: ${data.name}`,
        amountMicros: dailyBudgetMicros.toString(),
        deliveryMethod: 'STANDARD',
        period: 'DAILY',
        explicitlyShared: false,
      },
    }];

    const budgetResult = await mutateGoogleAds<{
      results?: Array<{ campaignBudget: string }>;
    }>(customerId, accessToken, developerToken, 'campaignBudgets', budgetOperations);

    const budgetResourceName = budgetResult.results?.[0]?.campaignBudget || '';

    // 2. Crear campaña
    const campaignOperations = [{
      create: {
        name: data.name,
        status: 'PAUSED',
        advertisingChannelType: channelType,
        campaignBudget: budgetResourceName,
        optimizationGoalSetting: {
          optimizationGoalTypes: data.objective === 'CONVERSIONS' ? ['CONVERSIONS'] : ['CLICKS'],
        },
        ...(data.startDate && { startDate: data.startDate.toISOString().split('T')[0] }),
        ...(data.endDate && { endDate: data.endDate.toISOString().split('T')[0] }),
      },
    }];

    const campaignResult = await mutateGoogleAds<{
      results?: Array<{ campaign: string }>;
    }>(customerId, accessToken, developerToken, 'campaigns', campaignOperations);

    const campaignResource = campaignResult.results?.[0]?.campaign || '';
    const externalId = campaignResource.split('/').pop() || '';

    // 3. Crear ad group por defecto
    const adGroupOperations = [{
      create: {
        name: `${data.name} - Ad Group`,
        campaign: campaignResource,
        status: 'PAUSED',
        type: 'SEARCH_STANDARD',
      },
    }];

    await mutateGoogleAds(customerId, accessToken, developerToken, 'adGroups', adGroupOperations);

    // 4. Guardar campaña localmente
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
  // v1: stub. La implementación completa de Google Ads requiere:
  //  1. Subir el asset (imagen/video) a AssetService
  //  2. Crear un AdGroupAd que referencie el asset + textos (responsiveSearchAd)
  //  3. Manejar policy reviews (Google pone los ads en 'UNDER_REVIEW' inicialmente)

  async publishPublication(input: PublishPublicationInput): Promise<PublishPublicationResult> {
    const { publicationId, socialPostId } = input;
    let { creative } = input;
    const { accessToken, accountId } = await getDecryptedToken(input.platformId);
    const developerToken = process.env.ADS_GOOGLE_DEVELOPER_TOKEN || '';
    const customerId = accountId;

    // 1. Local publication lookup (for campaign + adGroup target)
    const publication = await prisma.adsCampaignPublication.findUnique({
      where: { id: publicationId },
      include: {
        campaign: { include: { adSets: { take: 1, orderBy: { createdAt: 'asc' } } } },
        creative: true,
      },
    });
    if (!publication) throw new Error(`Publicación no encontrada: ${publicationId}`);
    if (!publication.campaign) throw new Error(`Publicación ${publicationId} sin campaign asociada`);

    // 1b. Boost fallback: si no hay creative o no trae mediaUrl pero sí socialPostId,
    //     cargar el SocialPost para usar su contenido como creative.
    if ((!creative || !creative.mediaUrl) && socialPostId) {
      const sp = await prisma.socialPost.findUnique({
        where: { id: socialPostId },
        select: { content: true, mediaUrls: true },
      });
      if (sp) {
        const socialPostMedia = sp.mediaUrls?.[0];
        const looksLikeVideo =
          !!socialPostMedia &&
          (socialPostMedia.includes('youtube.com') ||
            socialPostMedia.includes('youtu.be') ||
            /\.(mp4|mov|webm)$/i.test(socialPostMedia));
        const boostHeadline =
          sp.content && sp.content.length > 0
            ? sp.content.split('\n')[0].slice(0, 30)
            : undefined;
        const boostBody =
          sp.content && sp.content.length > 0 ? sp.content.slice(0, 90) : undefined;
        creative = {
          mediaUrl: socialPostMedia,
          mediaType: socialPostMedia ? (looksLikeVideo ? 'VIDEO' : 'IMAGE') : 'IMAGE',
          bodyText: boostBody,
          headline: boostHeadline,
          landingUrl: creative?.landingUrl,
        };
        logger.info(
          { publicationId, socialPostId, hasMedia: !!socialPostMedia },
          'Google Ads: boost desde SocialPost',
        );
      } else {
        logger.warn(
          { publicationId, socialPostId },
          'Google Ads: socialPostId no encontrado, continuando sin creative media',
        );
      }
    }

    // 2. Subir asset si hay creative con mediaUrl
    let assetResourceName: string | undefined;
    if (creative?.mediaUrl && (creative.mediaType === 'IMAGE' || creative.mediaType === 'VIDEO')) {
      const buffer = await fetch(creative.mediaUrl).then((r) => {
        if (!r.ok) throw new Error(`No se pudo descargar mediaUrl (${r.status})`);
        return r.arrayBuffer();
      });
      const base64Data = Buffer.from(buffer).toString('base64');
      const assetType = creative.mediaType === 'VIDEO' ? 'YOUTUBE_VIDEO' : 'IMAGE';
      const imageAsset =
        creative.mediaType === 'IMAGE' ? { data: base64Data } : undefined;
      const youtubeVideoAsset =
        creative.mediaType === 'VIDEO' ? { youtubeVideoId: creative.mediaUrl.split('v=').pop()?.split('&')[0] || '' } : undefined;

      const assetResult = await mutateGoogleAds<{
        results?: Array<{ resourceName: string }>;
      }>(customerId, accessToken, developerToken, 'assets', [
        {
          create: {
            name: `Volkern_${publicationId}_${Date.now()}`,
            type: assetType,
            ...(imageAsset && { imageAsset }),
            ...(youtubeVideoAsset && { youtubeVideoAsset }),
          },
        },
      ]);
      assetResourceName = assetResult.results?.[0]?.resourceName;
      logger.info({ publicationId, assetResourceName }, 'Google Ads: asset uploaded');
    }

    // 3. Construir payload del AdGroupAd
    const adSetExternalId = publication.campaign.adSets[0]?.externalId;
    if (!adSetExternalId) {
      throw new Error(
        `Campaign ${publication.campaign.name} no tiene AdSets en Google Ads. Ejecuta syncCampaigns primero.`,
      );
    }
    const adGroupResourceName = `customers/${customerId}/adGroups/${adSetExternalId}`;
    const finalUrls = (creative?.landingUrl ? [creative.landingUrl] : []) as string[];

    // RSA requiere ≥3 headlines y ≥2 descriptions
    const safe = (s: string | undefined, max: number, fallback: string): string =>
      (s && s.trim().length > 0 ? s : fallback).slice(0, max);
    const headlines = [
      safe(creative?.headline, 30, 'Volkern — descubre tu próxima propiedad'),
      safe(creative?.bodyText, 30, 'Asesoría inmobiliaria profesional'),
      'Visítanos hoy mismo',
    ];
    const descriptions = [
      safe(creative?.bodyText, 90, 'Encuentra propiedades exclusivas con el equipo de Volkern.'),
      'Más de 15 años ayudando a tu familia a invertir bien.',
    ];

    const adPayload: Record<string, unknown> = creative?.mediaType === 'VIDEO'
      ? {
          finalUrls,
          videoAd: {
            name: `VolkernPub_${publicationId}`,
            video: assetResourceName,
          },
        }
      : creative?.mediaType === 'IMAGE' && assetResourceName
      ? {
          finalUrls,
          imageAd: {
            name: `VolkernPub_${publicationId}`,
            imageAsset: assetResourceName,
          },
        }
      : {
          finalUrls,
          responsiveSearchAd: {
            headlines: headlines.map((text) => ({ text })),
            descriptions: descriptions.map((text) => ({ text })),
            path1: 'volkern',
          },
        };

    // 4. Crear AdGroupAd (siempre arranca PAUSED — se activa según policySummary)
    const opCreate = adGroupResourceName
      ? {
          create: {
            adGroup: adGroupResourceName,
            status: 'PAUSED',
            ad: {
              name: `VolkernPub_${publicationId}`,
              ...adPayload,
            },
          },
        }
      : null;
    if (!opCreate) {
      throw new Error('Internal: create operation no construido');
    }

    const adGroupAdResult = await mutateGoogleAds<{
      results?: Array<{ resourceName: string }>;
    }>(customerId, accessToken, developerToken, 'adGroupAds', [opCreate]);

    const adGroupAdResourceName = adGroupAdResult.results?.[0]?.resourceName;
    if (!adGroupAdResourceName) {
      throw new Error('Google Ads: respuesta mutate sin resourceName');
    }

    // 5. Consultar policySummary.approvalStatus del AdGroupAd recién creado
    const policyQuery = `
      SELECT ad_group_ad.status, ad_group_ad.policy_summary.approval_status
      FROM ad_group_ad
      WHERE ad_group_ad.resource_name = '${adGroupAdResourceName}'
    `;
    const policyRows = await searchGoogleAds(customerId, accessToken, developerToken, policyQuery);
    const rawStatus = policyRows[0]?.adGroupAd?.status ?? 'PAUSED';
    const rawApproval = policyRows[0]?.adGroupAd?.policySummary?.approvalStatus ?? null;

    // 6. Activar AdGroupAd si Google lo aprobó inicialmente
    const mapper = (s: string | null): 'ACTIVE' | 'IN_REVIEW' | 'REJECTED' => {
      switch (s) {
        case 'APPROVED':
        case 'APPROVED_LIMITED':
          return 'ACTIVE';
        case 'UNDER_REVIEW':
        case 'PENDING_REVIEW':
        case 'AREA_OF_INTEREST_ONLY':
          return 'IN_REVIEW';
        case 'DISAPPROVED':
        case 'APPROVED_WITH_REVIEW':
        case 'PENDING_RICH_MEDIA_REVIEW':
        case 'PENDING_VIDEO_REVIEW':
          return 'IN_REVIEW';
        default:
          return 'IN_REVIEW';
      }
    };
    const volkernStatus = mapper(rawApproval);

    if (volkernStatus === 'ACTIVE' && rawStatus !== 'ENABLED') {
      await mutateGoogleAds<{ results?: Array<Record<string, unknown>> }>(
        customerId,
        accessToken,
        developerToken,
        'adGroupAds',
        [
          {
            updateMask: 'status',
            update: { resourceName: adGroupAdResourceName, status: 'ENABLED' },
          },
        ],
      );
      logger.info({ publicationId, resourceName: adGroupAdResourceName }, 'Google Ads: activado tras aprobación');
    }

    logger.info(
      { publicationId, externalAdId: adGroupAdResourceName, estado: volkernStatus, rawApproval },
      'Google Ads publicación creada',
    );

    return {
      externalAdId: adGroupAdResourceName,
      status: volkernStatus,
      externalStatusRaw: rawApproval ?? rawStatus,
      ...(volkernStatus === 'REJECTED' && { errorMessage: `Política Google: ${rawApproval}` }),
    };
  }

  async pausePublication(input: { externalAdId: string; platformId: string }): Promise<void> {
    const { accessToken, accountId } = await getDecryptedToken(input.platformId);
    const developerToken = process.env.ADS_GOOGLE_DEVELOPER_TOKEN || '';
    await mutateGoogleAds<{ results?: Array<Record<string, unknown>> }>(
      accountId,
      accessToken,
      developerToken,
      'adGroupAds',
      [
        {
          updateMask: 'status',
          update: { resourceName: input.externalAdId, status: 'PAUSED' },
        },
      ],
    );
  }

  async resumePublication(input: { externalAdId: string; platformId: string }): Promise<void> {
    const { accessToken, accountId } = await getDecryptedToken(input.platformId);
    const developerToken = process.env.ADS_GOOGLE_DEVELOPER_TOKEN || '';
    await mutateGoogleAds<{ results?: Array<Record<string, unknown>> }>(
      accountId,
      accessToken,
      developerToken,
      'adGroupAds',
      [
        {
          updateMask: 'status',
          update: { resourceName: input.externalAdId, status: 'ENABLED' },
        },
      ],
    );
  }

  /**
   * Re-queries Google Ads policy approval status for an existing ad.
   * Used by `lib/cron/ads-publication-repoll` to flip PROGRAMADA →
   * PUBLICADA when Google's policy review returns APPROVED, or
   * PROGRAMADA → ERROR if DISAPPROVED.
   *
   * Read-only: does not mutate the ad. The flip is performed by
   * subsequent `resumePublication` + `AdsCampaignPublication.update`.
   *
   * Aware of token-expiry path: if `GoogleAuthError` is thrown,
   * refreshes the token and retries once. Critical for unattended
   * cron runs — otherwise a tenant whose token expired mid-batch
   * would silently fail forever.
   *
   * Expects `externalAdId` to be the `ad_group_ad` resource name
   * (e.g. `customers/{cid}/adGroupAds/{agid}~{adid}`), as returned by
   * `publishPublication`. Falls back to UNKNOWN if the format is missing.
   */
  async recheckGooglePolicy(input: {
    externalAdId: string;
    platformId: string;
  }): Promise<{
    approvalStatus: string;
    adGroupAdStatus: string | null;
  }> {
    const developerToken = process.env.ADS_GOOGLE_DEVELOPER_TOKEN || '';

    const execute = async (): Promise<GoogleAdsRow[]> => {
      const { accessToken, accountId } = await getDecryptedToken(input.platformId);
      const customerId = accountId;

      if (!input.externalAdId?.includes('~')) {
        logger.warn(
          { externalAdId: input.externalAdId },
          'GoogleAds: recheckGooglePolicy needs an ad_group_ad resource name (with tilde)',
        );
        return [];
      }

      const query = `
        SELECT
          ad_group_ad.resource_name,
          ad_group_ad.status,
          ad_group_ad.policy_summary.approval_status
        FROM ad_group_ad
        WHERE ad_group_ad.resource_name = '${input.externalAdId}'
        LIMIT 1
      `;
      return await searchGoogleAds(customerId, accessToken, developerToken, query);
    };

    let rows: GoogleAdsRow[];
    try {
      rows = await execute();
    } catch (err: any) {
      if (err instanceof GoogleAuthError || err?.name === 'GoogleAuthError') {
        logger.warn(
          { platformId: input.platformId },
          'GoogleAds: token expired during recheck, refreshing + retrying once',
        );
        await refreshTokenIfNeeded(input.platformId);
        rows = await execute();
      } else {
        throw err;
      }
    }

    if (rows.length === 0 || !rows[0].adGroupAd) {
      return { approvalStatus: 'UNKNOWN', adGroupAdStatus: null };
    }
    return {
      approvalStatus: rows[0].adGroupAd.policySummary?.approvalStatus || 'UNKNOWN',
      adGroupAdStatus: rows[0].adGroupAd.status,
    };
  }

  async deletePublication(input: { externalAdId: string; platformId: string }): Promise<void> {
    const { accessToken, accountId } = await getDecryptedToken(input.platformId);
    const developerToken = process.env.ADS_GOOGLE_DEVELOPER_TOKEN || '';
    await mutateGoogleAds<{ results?: Array<Record<string, unknown>> }>(
      accountId,
      accessToken,
      developerToken,
      'adGroupAds',
      [
        {
          updateMask: 'status',
          update: { resourceName: input.externalAdId, status: 'REMOVED' },
        },
      ],
    );
  }
}

// ─── Helpers de formato ───────────────────────────────────────────────

/**
 * Convierte fecha YYYY-MM-DD de Google Ads a Date.
 */
function parseGoogleDate(dateStr: string): Date | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}
