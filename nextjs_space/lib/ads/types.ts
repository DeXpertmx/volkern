/**
 * Tipos compartidos para el módulo de ADS (Anuncios Pagados)
 * 
 * Define las interfaces para la comunicación entre conectores,
 * motor de sincronización, watchdog y recomendaciones.
 */

// ─── Plataformas soportadas ───────────────────────────────────────────

export type AdPlatform = 'META' | 'GOOGLE' | 'LINKEDIN' | 'TIKTOK';

export const VALID_AD_PLATFORMS: AdPlatform[] = ['META', 'GOOGLE', 'LINKEDIN', 'TIKTOK'];

// ─── Estados ──────────────────────────────────────────────────────────

export type AdConnectionStatus = 'CONNECTED' | 'EXPIRED' | 'DISCONNECTED' | 'ERROR';

export type AdCampaignStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED';

export type AdSetStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export type AdStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'REJECTED';

export type AdBudgetAction = 'PAUSE' | 'REDUCE_BUDGET_PERCENTAGE' | 'NOTIFY_ONLY';

export type AdBudgetActionResult = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export type AdRecommendationType = 'BUDGET' | 'TARGETING' | 'CREATIVE' | 'BID' | 'SCHEDULE' | 'PLATFORM';

export type AdImpact = 'HIGH' | 'MEDIUM' | 'LOW';

export type AdBuyType = 'AUCTION' | 'FIXED_CPM' | 'REACH' | 'TARGETED';

export type AdObjective = 'CONVERSIONS' | 'TRAFFIC' | 'AWARENESS' | 'LEAD_GENERATION' | 'ENGAGEMENT' | 'SALES';

export type AdCreativeType = 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'COLLECTION' | 'TEXT';

export type AdBidStrategy = 'LOWEST_COST' | 'COST_CAP' | 'BID_CAP' | 'TARGET_CPA' | 'TARGET_ROAS';

// ─── Interfaces de conexión ───────────────────────────────────────────

export interface AdConnectionInput {
  platform: AdPlatform;
  authCode: string;
  redirectUri: string;
}

export interface AdConnectionAuthUrl {
  url: string;
  platform: AdPlatform;
}

export interface SyncResult {
  platformId: string;
  campaignsCreated: number;
  campaignsUpdated: number;
  adSetsCreated: number;
  adSetsUpdated: number;
  adsCreated: number;
  adsUpdated: number;
  errors: string[];
}

export interface InsightSyncResult {
  platformId: string;
  insightsImported: number;
  dateFrom: Date;
  dateTo: Date;
  errors: string[];
}

// ─── Interfaces de campañas ───────────────────────────────────────────

export interface AdCampaignInput {
  name: string;
  objective?: AdObjective;
  dailyBudget?: number;
  lifetimeBudget?: number;
  startDate?: Date;
  endDate?: Date;
  bidStrategy?: AdBidStrategy;
  bidAmount?: number;
  optimizationGoal?: string;
  trackingTemplate?: string;
  isVolkernManaged?: boolean;
}

export interface AdCampaignOutput {
  externalId: string;
  name: string;
  status: AdCampaignStatus;
  objective?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  startDate?: Date;
  endDate?: Date;
  bidStrategy?: string;
  bidAmount?: number;
}

// ─── Interfaces de watchdog ───────────────────────────────────────────

export interface WatchdogCondition {
  metric: string;      // cpa, roas, ctr, cpc, conversionRate, impressions, frequency
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=';
  value: number;
  window: string;      // 1h, 6h, 12h, 24h, 3d, 7d, 14d, 30d
}

export interface RuleEvaluation {
  ruleId: string;
  ruleName: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  condition: WatchdogCondition;
  metricCurrent: number;
  metricThreshold: number;
  action: AdBudgetAction;
  actionValue?: number;
  triggered: boolean;
}

// ─── Interfaces de predicción ─────────────────────────────────────────

export interface MetricPrediction {
  value: number;
  range: [number, number]; // Intervalo de confianza [min, max]
}

export interface CampaignPrediction {
  campaignId: string;
  predictions: {
    nextDay: Record<string, MetricPrediction>;
    nextWeek: Record<string, MetricPrediction>;
    nextMonth: Record<string, MetricPrediction>;
  };
  confidence: number;   // 0-1
  anomalyScore: number; // 0-1
}

export interface HistoricalDataPoint {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  cpc: number;
  cpm: number;
  ctr: number;
  cpa: number;
  roas: number;
}

// ─── Interfaces de recomendaciones ────────────────────────────────────

export interface RecommendationResult {
  type: AdRecommendationType;
  title: string;
  description: string;
  impact: AdImpact;
  confidence: number;
  metric: string;
  projectedValue: number;
  currentValue: number;
  implementation?: Record<string, unknown>;
}

export interface BudgetAllocationSuggestion {
  campaignId: string;
  campaignName: string;
  currentBudget: number;
  suggestedBudget: number;
  reason: string;
  projectedRoas: number;
}

export interface AudienceSuggestion {
  type: string;          // LOOKALIKE, INTEREST, BEHAVIOR, DEMOGRAPHIC
  description: string;
  estimatedReach: number;
  relevanceScore: number;
}

export interface AdCopyResult {
  platform: AdPlatform;
  headline: string;
  primaryText: string;
  callToAction: string;
  variations: string[];
}

// ─── Interfaz base del conector ───────────────────────────────────────

export interface AdPlatformConnector {
  /** Inicia el flujo OAuth y guarda la conexión */
  connect(tenantId: string, input: AdConnectionInput): Promise<void>;

  /** Desconecta y revoca tokens */
  disconnect(tenantId: string, platformId: string): Promise<void>;

  /** Obtiene la URL de autorización OAuth para iniciar el flujo */
  getAuthUrl(tenantId: string, redirectUri: string): Promise<AdConnectionAuthUrl>;

  /** Sincroniza la estructura de campañas, ad sets y ads */
  syncCampaigns(tenantId: string, platformId: string): Promise<SyncResult>;

  /** Sincroniza las métricas de un período */
  syncInsights(tenantId: string, platformId: string, dateFrom: Date, dateTo: Date): Promise<InsightSyncResult>;

  /** Pausa una campaña en la plataforma */
  pauseCampaign(campaignId: string, externalId: string): Promise<void>;

  /** Reanuda una campaña pausada */
  resumeCampaign(campaignId: string, externalId: string): Promise<void>;

  /** Actualiza el presupuesto diario de una campaña */
  updateBudget(campaignId: string, externalId: string, budget: number): Promise<void>;

  /** Crea una campaña en la plataforma */
  createCampaign(tenantId: string, platformId: string, data: AdCampaignInput): Promise<AdCampaignOutput>;

  // ─── Publicaciones ADS ────────────────────────────────────────────

  /** Publica una unidad creativa como ad (o boostea un SocialPost) */
  publishPublication(input: PublishPublicationInput): Promise<PublishPublicationResult>;

  /** Pausa una publicación ya creada en la plataforma */
  pausePublication(externalAdId: string): Promise<void>;

  /** Reactiva una publicación pausada */
  resumePublication(externalAdId: string): Promise<void>;

  /** Archiva/elimina una publicación según lo permita la plataforma */
  deletePublication(externalAdId: string): Promise<void>;
}

// ─── Tipos para el registro de conectores ─────────────────────────────

export interface ConnectorConstructor {
  new (): AdPlatformConnector;
}

// ─── Tipos para Publicaciones ADS ───────────────────────────────────

export interface PublishPublicationInput {
  publicationId: string;
  // Solo cuando NO es boost y la creatividad viene del AdsCreative propio
  creative?: {
    mediaUrl: string;
    mediaType: 'IMAGE' | 'VIDEO';
    bodyText?: string;
    headline?: string;
    callToAction?: string;
    landingUrl?: string;
  };
  // Solo para boost: id de la publicación SocialPost que se está boosteando
  socialPostId?: string;
  // Página de Facebook (Meta requiere para publicar)
  metaPageId?: string;
  // AdSetId existente en el que colgar el creativo (Meta → adcreative + ad)
  adSetId?: string;
  // Presupuesto diario (en moneda del tenant)
  budgetDaily?: number;
  budgetTotal?: number;
  currency?: string;
}

export interface PublishPublicationResult {
  externalAdId: string;
  status: 'ACTIVE' | 'IN_REVIEW' | 'PAUSED' | 'REJECTED';
  externalStatusRaw?: string;
}
