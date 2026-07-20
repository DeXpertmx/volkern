/**
 * Conector para LinkedIn Ads API (Marketing API v2)
 *
 * Implementa AdPlatformConnector para sincronizar campañas, grupos de anuncios
 * (ad creatives groups), anuncios (ad creatives) e insights desde LinkedIn Ads
 * hacia el modelo unificado de Volkern.
 *
 * Autenticación:
 *   - OAuth 2.0 con refresh token (long-lived)
 *   - Soporte para 2FA (verificación en dos pasos)
 *   - Tokens cifrados en Vault del tenant
 *
 * Endpoints principales:
 *   GET  /adAccountsV2                              → Lista de cuentas
 *   GET  /adCampaignsV2?q=search&search.account=... → Campañas
 *   GET  /adCreativesV2?q=search&search.account=... → Creativos (anuncios)
 *   POST /adAnalyticsV2                             → Métricas
 *
 * Identificación: LinkedIn usa URNs (Uniform Resource Names)
 *   Ej: "urn:li:sponsoredAccount:123456", "urn:li:sponsoredCampaign:789"
 *
 * Rate Limits: 100 llamadas/día por usuario (100 QPS en ráfaga)
 *
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/overview
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
} from '../types';

const API_VERSION = 'v2';
const BASE_URL = `https://api.linkedin.com/${API_VERSION}`;
const OAUTH_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const OAUTH_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const AD_ACCOUNTS_URL = 'https://api.linkedin.com/v2/adAccountsV2';


// ─── Types & Interfaces ──────────────────────────────────────────────

interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

interface LinkedInErrorResponse {
  code?: number;
  message?: string;
  status?: number;
  error?: string;
  error_description?: string;
}

interface LinkedInAdAccount {
  id: string;
  name?: string;
  status?: string;
  type?: string;
  currency?: string;
  accountId?: string;
}

interface LinkedInCampaign {
  id: string;
  name?: string;
  status?: string;
  campaignGroup?: string;
  account?: string;
  type?: string;
  dailyBudget?: {
    amount: string;
    currencyCode: string;
  };
  unitCost?: {
    amount: string;
    currencyCode: string;
  };
  objectiveType?: string;
  associatedEntity?: string;
  optimizationTargetType?: string;
  startDate?: number;
  endDate?: number;
  createdAt?: number;
  lastModified?: number;
  locale?: {
    country: string;
    language: string;
  };
  offsiteDeliveryEnabled?: boolean;
  version?: {
    versionId: number;
    versionTag: string;
  };
}

interface LinkedInCreativeGroup {
  id: string;
  name?: string;
  status?: string;
  campaign?: string;
  account?: string;
  type?: string;
  splitTest?: {
    enabled: boolean;
    variable: string;
  };
  createdAt?: number;
  lastModified?: number;
}

interface LinkedInCreative {
  id: string;
  name?: string;
  status?: string;
  campaign?: string;
  account?: string;
  creativeGroup?: string;
  type?: string;
  variables?: Record<string, unknown>;
  callToAction?: {
    type: string;
    clickUri: string;
  };
  introText?: string;
  description?: string;
  headline?: string;
  landingPageUrl?: string;
  media?: Array<Record<string, unknown>>;
}

interface LinkedInAdAnalyticsItem {
  date: string;
  externalWebsiteConversions?: number;
  adUnitClicks?: number;
  clicks?: number;
  costInLocalCurrency?: {
    amount: string;
    currencyCode: string;
  };
  impressions?: number;
  leadGenerationMailContactInfoMultiLead?: number;
  oneClickLeadFormsOpened?: number;
  oneClickLeadFormsFilledOut?: number;
  opens?: number;
  sends?: number;
  videoCompletions?: number;
  videoFirstQuartileCompletions?: number;
  videoMidpointCompletions?: number;
  videoThirdQuartileCompletions?: number;
  videoViews?: number;
  landingPageClicks?: number;
  conversionValueInLocalCurrency?: {
    amount: string;
    currencyCode: string;
  };
  actionCardClicks?: number;
  jobApplications?: number;
  jobPostClicks?: number;
  otherEngagements?: number;
  textUrlClicks?: number;
}

// ─── Helper Functions ────────────────────────────────────────────────

async function linkedinFetch<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as LinkedInErrorResponse;
    const msg = errorBody.message || errorBody.error_description || `HTTP ${response.status}`;
    const code = errorBody.status || errorBody.code || response.status;

    // LinkedIn errors: 401 Unauthorized, 403 Forbidden (token expired/invalid)
    if (response.status === 401 || response.status === 403) {
      throw new LinkedInAuthError(msg, response.status);
    }

    throw new LinkedInApiError(msg, code, response.status);
  }

  return response.json() as Promise<T>;
}

class LinkedInApiError extends Error {
  constructor(
    message: string,
    public apiCode: number,
    public httpStatus: number,
  ) {
    super(`[LinkedInAds API] ${message} (code: ${apiCode})`);
    this.name = 'LinkedInApiError';
  }
}

class LinkedInAuthError extends Error {
  constructor(message: string, public httpCode: number) {
    super(`[LinkedInAds Auth] ${message} (http: ${httpCode})`);
    this.name = 'LinkedInAuthError';
  }
}

/**
 * Extrae el ID numérico de un URN de LinkedIn.
 * Ejemplo: "urn:li:sponsoredAccount:123456" → "123456"
 */
function extractIdFromUrn(urn: string): string {
  const parts = urn.split(':');
  return parts[parts.length - 1] || urn;
}

/**
 * Construye un URN de cuenta de LinkedIn a partir del ID numérico.
 * Ejemplo: "123456" → "urn:li:sponsoredAccount:123456"
 */
function buildAccountUrn(accountId: string): string {
  if (accountId.startsWith('urn:li:')) return accountId;
  return `urn:li:sponsoredAccount:${accountId}`;
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
    throw new Error(`LinkedIn Ads config not found (id: ${platformId})`);
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

  const clientId = process.env.ADS_LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.ADS_LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('ADS_LINKEDIN_CLIENT_ID y ADS_LINKEDIN_CLIENT_SECRET requeridos para renovar token');
  }

  const currentRefreshToken = config.refreshToken
    ? VaultService.decrypt(config.refreshToken, config.tenantId, config.tenant.vaultSeed)
    : null;

  if (!currentRefreshToken) {
    throw new LinkedInAuthError('No hay refresh token para renovar', 401);
  }

  const tokenResponse = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenResponse.ok) {
    const err = (await tokenResponse.json().catch(() => ({}))) as LinkedInErrorResponse;
    throw new LinkedInAuthError(
      `Error refreshing token: ${err.error_description || tokenResponse.statusText}`,
      tokenResponse.status,
    );
  }

  const tokenData = (await tokenResponse.json()) as LinkedInTokenResponse;

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

  logger.info({ platformId }, 'LinkedIn Ads token renovado exitosamente');
  return tokenData.access_token;
}

// ─── Mapeo de tipos LinkedIn → Volkern ───────────────────────────────

const LINKEDIN_STATUS_MAP: Record<string, string> = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
  DRAFT: 'PAUSED',
  CANCELED: 'ARCHIVED',
  COMPLETED: 'ARCHIVED',
};

const LINKEDIN_OBJECTIVE_MAP: Record<string, string> = {
  BRAND_AWARENESS: 'AWARENESS',
  WEBSITE_VISITS: 'TRAFFIC',
  LEAD_GENERATION: 'LEAD_GENERATION',
  ENGAGEMENT: 'ENGAGEMENT',
  VIDEO_VIEW: 'ENGAGEMENT',
  WEBSITE_CONVERSIONS: 'CONVERSIONS',
  JOB_APPLICATIONS: 'CONVERSIONS',
  CONTENT_DOWNLOAD: 'LEAD_GENERATION',
  EVENT_RESPONSES: 'ENGAGEMENT',
  FOLLOWERS: 'AWARENESS',
  CAROUSEL_ENGAGEMENT: 'ENGAGEMENT',
  TEXT_AD: 'AWARENESS',
  DYNAMIC_ADS: 'CONVERSIONS',
  SPOTLIGHT_ADS: 'AWARENESS',
  AD_WITH_LEAD_GEN: 'LEAD_GENERATION',
};

const LINKEDIN_BID_STRATEGY_MAP: Record<string, string> = {
  MAX_CLICKS: 'LOWEST_COST',
  MAX_IMPRESSIONS: 'LOWEST_COST',
  TARGET_CPA: 'TARGET_CPA',
  MANUAL_CPC: 'BID_CAP',
  BID_BUDGET_OPTIMIZED: 'COST_CAP',
};

// ─── Conector ─────────────────────────────────────────────────────────

export class LinkedInAdsConnector implements AdPlatformConnector {
  /**
   * Conecta una cuenta de LinkedIn Ads: canjea el auth code por tokens,
   * obtiene el ad account y guarda la conexión cifrada en Vault.
   */
  async connect(tenantId: string, input: AdConnectionInput): Promise<void> {
    const clientId = process.env.ADS_LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.ADS_LINKEDIN_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('ADS_LINKEDIN_CLIENT_ID y ADS_LINKEDIN_CLIENT_SECRET son requeridos en .env');
    }

    // 1. Canjear auth code por tokens
    const tokenResponse = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.authCode,
        redirect_uri: input.redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const err = (await tokenResponse.json().catch(() => ({}))) as LinkedInErrorResponse;
      throw new Error(
        `Error exchanging auth code: ${err.error_description || err.error || tokenResponse.statusText}`,
      );
    }

    const tokenData = (await tokenResponse.json()) as LinkedInTokenResponse;

    // 2. Obtener ad accounts del usuario
    const accountsData = await linkedinFetch<{
      elements?: LinkedInAdAccount[];
      start?: number;
    }>(AD_ACCOUNTS_URL, tokenData.access_token);

    if (!accountsData.elements || accountsData.elements.length === 0) {
      throw new Error('No se encontraron ad accounts de LinkedIn Ads para este usuario');
    }

    // Tomar el primer ad account
    const primaryAccount = accountsData.elements[0];
    const accountId = extractIdFromUrn(primaryAccount.id);

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
        platform: 'LINKEDIN',
        accountId,
        accountName: primaryAccount.name || primaryAccount.id,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        status: 'CONNECTED',
        metadata: {
          accountUrn: primaryAccount.id,
          currency: primaryAccount.currency || 'USD',
        },
      },
    });

    logger.info({ tenantId, accountId }, 'LinkedIn Ads conectado exitosamente');
  }

  /**
   * Desconecta la cuenta: revoca tokens y marca como DISCONNECTED.
   */
  async disconnect(tenantId: string, platformId: string): Promise<void> {
    try {
      const { accessToken } = await getDecryptedToken(platformId);
      // LinkedIn revoca tokens via DELETE /oauth/v2/accessToken
      const clientId = process.env.ADS_LINKEDIN_CLIENT_ID;
      const clientSecret = process.env.ADS_LINKEDIN_CLIENT_SECRET;
      if (clientId && clientSecret) {
        await fetch(`${OAUTH_TOKEN_URL}?client_id=${clientId}&client_secret=${clientSecret}&access_token=${accessToken}`, {
          method: 'DELETE',
        });
      }
    } catch (err) {
      logger.warn({ platformId, err }, 'Error al revocar token de LinkedIn Ads (no crítico)');
    }

    await prisma.adPlatformConnection.update({
      where: { id: platformId },
      data: {
        status: 'DISCONNECTED',
        accessToken: '',
        refreshToken: null,
      },
    });

    logger.info({ tenantId, platformId }, 'LinkedIn Ads desconectado');
  }

  /**
   * Obtiene la URL de autorización OAuth.
   */
  async getAuthUrl(tenantId: string, redirectUri: string): Promise<AdConnectionAuthUrl> {
    const clientId = process.env.ADS_LINKEDIN_CLIENT_ID;
    if (!clientId) throw new Error('ADS_LINKEDIN_CLIENT_ID no configurado');

    // LinkedIn scopes for Marketing API
    const scopes = [
      'rw_ads',
      'r_ads',
      'r_ads_reporting',
      'r_emailaddress',
      'r_liteprofile',
      'w_member_social',
    ].join(' ');

    const url = `${OAUTH_AUTH_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${tenantId}`;

    return { url, platform: 'LINKEDIN' };
  }

  /**
   * Sincroniza la estructura completa de campañas, grupos de anuncios
   * (ad creatives groups) y anuncios (ad creatives) desde LinkedIn Ads.
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
      const accountUrn = buildAccountUrn(accountId);

      // ─── 1. Obtener campañas ─────────────────────────────────────
      const allCampaigns: LinkedInCampaign[] = [];
      let start = 0;
      const count = 100;
      while (true) {
        const campaignsUrl = `${BASE_URL}/adCampaignsV2?q=search&search.account=${encodeURIComponent(accountUrn)}&start=${start}&count=${count}`;
        const campaignsData = await linkedinFetch<{
          elements?: LinkedInCampaign[];
          start?: number;
        }>(campaignsUrl, accessToken);
        allCampaigns.push(...(campaignsData.elements || []));
        if (!campaignsData.elements || campaignsData.elements.length === 0) break;
        start += count;
      }

      for (const camp of allCampaigns) {
        const externalId = camp.id;
        const status = LINKEDIN_STATUS_MAP[camp.status || ''] || 'ACTIVE';
        const objective = LINKEDIN_OBJECTIVE_MAP[camp.objectiveType || ''] || 'CONVERSIONS';
        const bidStrategy = LINKEDIN_BID_STRATEGY_MAP[camp.optimizationTargetType || ''] || null;

        // LinkedIn budgets are in a nested object with amount as string
        let dailyBudget: number | null = null;
        let lifetimeBudget: number | null = null;
        if (camp.dailyBudget?.amount) {
          dailyBudget = parseFloat(camp.dailyBudget.amount);
        }

        const campaignData = {
          name: camp.name || 'Sin nombre',
          status,
          objective,
          dailyBudget,
          lifetimeBudget,
          startDate: camp.startDate ? new Date(camp.startDate) : null,
          endDate: camp.endDate ? new Date(camp.endDate) : null,
          bidStrategy,
          syncedAt: new Date(),
        };

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

      // ─── 2. Obtener ad creatives groups (ad sets) ────────────────
      // LinkedIn no tiene un endpoint directo de creative groups por cuenta.
      // Los creative groups se obtienen a través de la campaña.
      // Intentamos obtenerlos de cada campaña activa.
      const localCampaigns = await prisma.adCampaign.findMany({
        where: { platformId, status: 'ACTIVE' },
        select: { externalId: true, id: true },
      });

      for (const localCamp of localCampaigns) {
        if (!localCamp.externalId) continue;

        try {
          // LinkedIn ad creative groups endpoint
          const allGroups: LinkedInCreativeGroup[] = [];
          let groupStart = 0;
          const groupCount = 100;
          while (true) {
            const groupsUrl = `${BASE_URL}/adCreativesV2?q=search&search.campaign=${encodeURIComponent('urn:li:sponsoredCampaign:' + localCamp.externalId)}&start=${groupStart}&count=${groupCount}`;
            const groupsData = await linkedinFetch<{
              elements?: LinkedInCreativeGroup[];
            }>(groupsUrl, accessToken);
            allGroups.push(...(groupsData.elements || []));
            if (!groupsData.elements || groupsData.elements.length === 0) break;
            groupStart += groupCount;
          }

          for (const group of allGroups) {
            const groupExternalId = group.id;
            const status = LINKEDIN_STATUS_MAP[group.status || ''] || 'PAUSED';

            const setData = {
              name: group.name || 'Creative Group ' + groupExternalId,
              status,
            };

            const existing = await prisma.adSet.findFirst({
              where: { externalId: groupExternalId, campaignId: localCamp.id },
            });

            if (existing) {
              await prisma.adSet.update({ where: { id: existing.id }, data: setData });
              result.adSetsUpdated++;
            } else {
              await prisma.adSet.create({
                data: {
                  ...setData,
                  externalId: groupExternalId,
                  campaignId: localCamp.id,
                },
              });
              result.adSetsCreated++;
            }
          }
        } catch (err) {
          logger.warn({ campaignId: localCamp.id, err }, 'LinkedIn: error fetching creative groups');
        }
      }

      // ─── 3. Obtener anuncios (ad creatives) ──────────────────────
      const allCreatives: LinkedInCreative[] = [];
      let creativeStart = 0;
      const creativeCount = 100;
      try {
        while (true) {
          const creativesUrl = `${BASE_URL}/adCreativesV2?q=search&search.account=${encodeURIComponent(accountUrn)}&start=${creativeStart}&count=${creativeCount}`;
          const creativesData = await linkedinFetch<{
            elements?: LinkedInCreative[];
          }>(creativesUrl, accessToken);
          allCreatives.push(...(creativesData.elements || []));
          if (!creativesData.elements || creativesData.elements.length === 0) break;
          creativeStart += creativeCount;
        }

        for (const creative of allCreatives) {
          const externalId = creative.id;
          const creativeGroupExternalId = creative.creativeGroup || '';

          // Encontrar el ad set local asociado a este creative group
          let localAdSet = null;
          if (creativeGroupExternalId) {
            // The creativeGroup can be a URN like "urn:li:sponsoredCreativeGroup:456"
            const groupId = extractIdFromUrn(creativeGroupExternalId);
            localAdSet = await prisma.adSet.findFirst({
              where: { externalId: groupId },
            });
          }

          // Si no encontramos el ad set, buscar por campaña
          if (!localAdSet && creative.campaign) {
            const campaignExternalId = extractIdFromUrn(creative.campaign);
            const localCamp = await prisma.adCampaign.findFirst({
              where: { externalId: campaignExternalId, platformId },
              select: { id: true },
            });
            if (localCamp) {
              // Crear un ad set por defecto para esta campaña si no existe
              const defaultSetName = 'Default Ad Group - ' + creative.name;
              const existingSet = await prisma.adSet.findFirst({
                where: { campaignId: localCamp.id, name: defaultSetName },
              });
              if (existingSet) {
                localAdSet = existingSet;
              } else {
                localAdSet = await prisma.adSet.create({
                  data: {
                    name: defaultSetName,
                    status: 'ACTIVE',
                    externalId: 'li_default_' + creative.id,
                    campaignId: localCamp.id,
                  },
                });
                result.adSetsCreated++;
              }
            }
          }

          if (!localAdSet) continue;

          // Determinar tipo de creativo
          let creativeType: 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'COLLECTION' | 'TEXT' = 'TEXT';
          let headline: string | null = null;
          let primaryText: string | null = null;
          let callToAction: string | null = null;
          let destinationUrl: string | null = null;
          let creativeUrl: string | null = null;
          let thumbnailUrl: string | null = null;
          let videoId: string | null = null;

          if (creative.variables) {
            const vars = creative.variables;
            headline = (vars.headline as string) || null;
            primaryText = (vars.description as string) || (vars.introText as string) || null;
            callToAction = creative.callToAction?.type || null;
            destinationUrl = creative.callToAction?.clickUri || (vars.landingPageUrl as string) || null;

            if (vars.spotlightImageUrl || vars.imageUrl) {
              creativeType = 'IMAGE';
              creativeUrl = (vars.spotlightImageUrl as string) || (vars.imageUrl as string) || null;
            } else if (vars.videoUrl) {
              creativeType = 'VIDEO';
              creativeUrl = vars.videoUrl as string;
              videoId = vars.videoId as string || null;
            } else if (vars.carouselUrl) {
              creativeType = 'CAROUSEL';
              creativeUrl = vars.carouselUrl as string;
            }
          }

          if (!headline && creative.headline) headline = creative.headline;
          if (!primaryText && (creative.introText || creative.description)) {
            primaryText = creative.introText || creative.description || null;
          }
          if (!destinationUrl && creative.landingPageUrl) {
            destinationUrl = creative.landingPageUrl;
          }

          const adData = {
            name: creative.name || 'Sin nombre',
            status: LINKEDIN_STATUS_MAP[creative.status || ''] || 'ACTIVE',
            creativeType,
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
      } catch (err) {
        logger.warn({ platformId, err }, 'LinkedIn: error fetching ad creatives');
        result.errors.push('Error fetching ad creatives: ' + (err instanceof Error ? err.message : 'Unknown'));
      }

      // Actualizar lastSyncedAt en la conexión
      await prisma.adPlatformConnection.update({
        where: { id: platformId },
        data: { lastSyncedAt: new Date() },
      });

      logger.info(result, 'LinkedIn Ads: sincronización de campañas completada');
    } catch (err) {
      if (err instanceof LinkedInAuthError) {
        logger.warn({ platformId }, 'LinkedIn Ads: token expirado, intentando renovar...');
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
        logger.error({ platformId, err }, 'LinkedIn Ads: error en syncCampaigns');
      }
    }

    return result;
  }

  /**
   * Sincroniza las métricas (insights) de un período desde LinkedIn Ads.
   *
   * LinkedIn Analytics API v2 requiere un POST con el cuerpo de la consulta.
   * Endpoint: POST /adAnalyticsV2
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
      const accountUrn = buildAccountUrn(accountId);

      // Formato de fechas: YYYY-MM-DD (LinkedIn requiere este formato)
      const since = dateFrom.toISOString().split('T')[0];
      const until = dateTo.toISOString().split('T')[0];

      // LinkedIn Analytics API v2 - POST body
      const analyticsBody = {
        query: {
          dateRange: {
            start: { day: dateFrom.getDate(), month: dateFrom.getMonth() + 1, year: dateFrom.getFullYear() },
            end: { day: dateTo.getDate(), month: dateTo.getMonth() + 1, year: dateTo.getFullYear() },
          },
          accounts: [accountUrn],
          fields: [
            'date',
            'impressions',
            'clicks',
            'costInLocalCurrency',
            'externalWebsiteConversions',
            'landingPageClicks',
            'oneClickLeadFormsFilledOut',
            'leadGenerationMailContactInfoMultiLead',
            'videoViews',
            'videoCompletions',
            'videoFirstQuartileCompletions',
            'videoMidpointCompletions',
            'videoThirdQuartileCompletions',
            'opens',
            'sends',
            'conversionValueInLocalCurrency',
          ],
        },
      };

      const analyticsUrl = `${BASE_URL}/adAnalyticsV2`;
      const analyticsData = await linkedinFetch<{
        elements?: LinkedInAdAnalyticsItem[];
        start?: number;
        total?: number;
      }>(analyticsUrl, accessToken, {
        method: 'POST',
        body: JSON.stringify(analyticsBody),
      });

      for (const item of analyticsData.elements || []) {
        // Las métricas de LinkedIn son agregadas a nivel de cuenta,
        // no tienen desglose por campaña/anuncio individual en analytics básico.
        // Usamos datos agregados por día.
        const insightDate = item.date || since;
        const dateStart = new Date(insightDate + 'T00:00:00Z');
        const dateEnd = new Date(insightDate + 'T00:00:00Z');

        const spendAmount = item.costInLocalCurrency?.amount
          ? parseFloat(item.costInLocalCurrency.amount)
          : 0;
        const revenueAmount = item.conversionValueInLocalCurrency?.amount
          ? parseFloat(item.conversionValueInLocalCurrency.amount)
          : 0;
        const conversions = (item.externalWebsiteConversions || 0)
          + (item.oneClickLeadFormsFilledOut || 0)
          + (item.leadGenerationMailContactInfoMultiLead || 0);
        const clicks = item.clicks || item.landingPageClicks || item.adUnitClicks || 0;
        const impressions = item.impressions || 0;
        const leads = (item.oneClickLeadFormsFilledOut || 0)
          + (item.leadGenerationMailContactInfoMultiLead || 0);

        const cpc = clicks > 0 && spendAmount > 0 ? spendAmount / clicks : 0;
        const cpm = impressions > 0 && spendAmount > 0 ? (spendAmount / impressions) * 1000 : 0;
        const ctr = impressions > 0 && clicks > 0 ? (clicks / impressions) * 100 : 0;
        const cpa = conversions > 0 ? spendAmount / conversions : 0;
        const costPerLead = leads > 0 ? spendAmount / leads : 0;
        const roas = spendAmount > 0 && revenueAmount > 0 ? revenueAmount / spendAmount : 0;

        const insightData = {
          tenantId,
          platformId,
          campaignId: null,
          adSetId: null,
          adId: null,
          dateStart,
          dateEnd,
          impressions,
          clicks,
          spend: Math.round(spendAmount * 100) / 100,
          reach: 0,
          frequency: 0,
          cpc: Math.round(cpc * 100) / 100,
          cpm: Math.round(cpm * 100) / 100,
          ctr: Math.round(ctr * 100) / 100,
          conversions,
          conversionRate: impressions > 0 && conversions > 0 ? (conversions / impressions) * 100 : 0,
          cpa: Math.round(cpa * 100) / 100,
          roas: Math.round(roas * 100) / 100,
          revenue: Math.round(revenueAmount * 100) / 100,
          leads,
          costPerLead: Math.round(costPerLead * 100) / 100,
          qualityRank: null,
          engagementRate: null,
          videoPlays: item.videoViews || null,
          videoAvgWatchTime: null,
          canvas: {
            campaignName: '',
            adSetName: '',
            adName: '',
          },
        };

        // Upsert: evitar duplicados para el mismo día
        const existingInsight = await prisma.adInsight.findFirst({
          where: {
            platformId,
            campaignId: null,
            adSetId: null,
            adId: null,
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
        'LinkedIn Ads: insights sincronizados',
      );
    } catch (err) {
      if (err instanceof LinkedInAuthError) {
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
        logger.error({ platformId, err }, 'LinkedIn Ads: error en syncInsights');
      }
    }

    return result;
  }

  /**
   * Pausa una campaña en LinkedIn Ads.
   * LinkedIn actualiza campañas mediante PATCH al URN del recurso.
   */
  async pauseCampaign(campaignId: string, externalId: string): Promise<void> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { platform: true },
    });
    if (!campaign) throw new Error(`Campaña no encontrada: ${campaignId}`);

    const { accessToken } = await getDecryptedToken(campaign.platformId);

    const campaignUrn = `urn:li:sponsoredCampaign:${externalId}`;
    await linkedinFetch(
      `${BASE_URL}/adCampaignsV2/${encodeURIComponent(campaignUrn)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          patch: {
            $set: { status: 'PAUSED' },
          },
        }),
      },
    );
  }

  /**
   * Reanuda una campaña pausada en LinkedIn Ads.
   */
  async resumeCampaign(campaignId: string, externalId: string): Promise<void> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { platform: true },
    });
    if (!campaign) throw new Error(`Campaña no encontrada: ${campaignId}`);

    const { accessToken } = await getDecryptedToken(campaign.platformId);

    const campaignUrn = `urn:li:sponsoredCampaign:${externalId}`;
    await linkedinFetch(
      `${BASE_URL}/adCampaignsV2/${encodeURIComponent(campaignUrn)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          patch: {
            $set: { status: 'ACTIVE' },
          },
        }),
      },
    );
  }

  /**
   * Actualiza el presupuesto diario de una campaña en LinkedIn Ads.
   * LinkedIn maneja budgets en formato { amount: "string", currencyCode: "USD" }.
   */
  async updateBudget(campaignId: string, externalId: string, budget: number): Promise<void> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { platform: true },
    });
    if (!campaign) throw new Error(`Campaña no encontrada: ${campaignId}`);

    const { accessToken } = await getDecryptedToken(campaign.platformId);

    // Obtener metadatos para la moneda
    const platformConfig = await prisma.adPlatformConnection.findUnique({
      where: { id: campaign.platformId },
      select: { metadata: true },
    });
    const metadata = platformConfig?.metadata as Record<string, unknown> | null;
    const currency = (metadata?.currency as string) || 'USD';

    const campaignUrn = `urn:li:sponsoredCampaign:${externalId}`;
    await linkedinFetch(
      `${BASE_URL}/adCampaignsV2/${encodeURIComponent(campaignUrn)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          patch: {
            $set: {
              dailyBudget: {
                amount: String(budget),
                currencyCode: currency,
              },
            },
          },
        }),
      },
    );
  }

  /**
   * Crea una campaña en LinkedIn Ads.
   */
  async createCampaign(
    tenantId: string,
    platformId: string,
    data: AdCampaignInput,
  ): Promise<AdCampaignOutput> {
    const { accessToken, accountId } = await getDecryptedToken(platformId);
    const accountUrn = buildAccountUrn(accountId);

    // Obtener metadatos para la moneda
    const platformConfig = await prisma.adPlatformConnection.findUnique({
      where: { id: platformId },
      select: { metadata: true },
    });
    const metadata = platformConfig?.metadata as Record<string, unknown> | null;
    const currency = (metadata?.currency as string) || 'USD';

    // Mapear objetivo Volkern → LinkedIn
    const objectiveMapReverse: Record<string, string> = {
      CONVERSIONS: 'WEBSITE_CONVERSIONS',
      TRAFFIC: 'WEBSITE_VISITS',
      AWARENESS: 'BRAND_AWARENESS',
      LEAD_GENERATION: 'LEAD_GENERATION',
      ENGAGEMENT: 'ENGAGEMENT',
      SALES: 'WEBSITE_CONVERSIONS',
    };
    const liObjective = objectiveMapReverse[data.objective || 'CONVERSIONS'] || 'WEBSITE_CONVERSIONS';

    const body: Record<string, unknown> = {
      name: data.name,
      objectiveType: liObjective,
      status: 'PAUSED', // Crear pausada por seguridad
      account: accountUrn,
      type: 'SPONSORED_INMAIL',
      dailyBudget: {
        amount: String(data.dailyBudget || 0),
        currencyCode: currency,
      },
    };

    if (data.startDate) {
      body.startDate = data.startDate.getTime();
    }
    if (data.endDate) {
      body.endDate = data.endDate.getTime();
    }
    if (data.bidStrategy) {
      const bidMapReverse: Record<string, string> = {
        LOWEST_COST: 'MAX_CLICKS',
        TARGET_CPA: 'TARGET_CPA',
        BID_CAP: 'MANUAL_CPC',
        COST_CAP: 'BID_BUDGET_OPTIMIZED',
        TARGET_ROAS: 'MAX_CLICKS',
      };
      body.optimizationTargetType = bidMapReverse[data.bidStrategy] || 'MAX_CLICKS';
    }

    const response = await linkedinFetch<{ id: string }>(
      `${BASE_URL}/adCampaignsV2`,
      accessToken,
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
