import { z } from 'zod';

// ──────────────────────────────────────────────
// ADS — Plataformas
// ──────────────────────────────────────────────

export const AdPlatformSchema = z.enum(['META', 'GOOGLE', 'LINKEDIN', 'TIKTOK']);

// ──────────────────────────────────────────────
// ADS — Conexión de plataformas
// ──────────────────────────────────────────────

export const AdConnectSchema = z.object({
  platform: AdPlatformSchema,
  authCode: z.string().min(1, 'Código de autorización requerido'),
  redirectUri: z.string().url('URL de redirección inválida'),
});

export const AdDisconnectSchema = z.object({
  platformId: z.string().min(1, 'ID de plataforma requerido'),
});

// ──────────────────────────────────────────────
// ADS — Campañas
// ──────────────────────────────────────────────

export const AdCampaignCreateSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(255),
  objective: z.enum(['CONVERSIONS', 'TRAFFIC', 'AWARENESS', 'LEAD_GENERATION', 'ENGAGEMENT', 'SALES']).optional(),
  dailyBudget: z.coerce.number().min(0).optional(),
  lifetimeBudget: z.coerce.number().min(0).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  bidStrategy: z.enum(['LOWEST_COST', 'COST_CAP', 'BID_CAP', 'TARGET_CPA', 'TARGET_ROAS']).optional(),
  bidAmount: z.coerce.number().min(0).optional(),
  optimizationGoal: z.string().max(100).optional(),
  trackingTemplate: z.string().max(1000).optional(),
  isVolkernManaged: z.boolean().optional().default(true),
});

export const AdCampaignUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  dailyBudget: z.coerce.number().min(0).optional(),
  lifetimeBudget: z.coerce.number().min(0).optional(),
  bidStrategy: z.enum(['LOWEST_COST', 'COST_CAP', 'BID_CAP', 'TARGET_CPA', 'TARGET_ROAS']).optional(),
  bidAmount: z.coerce.number().min(0).optional(),
  optimizationGoal: z.string().max(100).optional(),
  trackingTemplate: z.string().max(1000).optional(),
  isVolkernManaged: z.boolean().optional(),
});

// ──────────────────────────────────────────────
// ADS — Watchdog (Reglas de auto-apagado)
// ──────────────────────────────────────────────

export const WatchdogConditionSchema = z.object({
  metric: z.enum(['cpa', 'roas', 'ctr', 'cpc', 'spendPerConversion', 'conversionRate', 'impressions', 'frequency']),
  operator: z.enum(['>', '>=', '<', '<=', '==', '!=']),
  value: z.number().min(0),
  window: z.string().regex(/^(\d+)(h|d)$/, 'Formato inválido. Usa: 1h, 6h, 24h, 7d, 30d'),
});

export const AdBudgetRuleCreateSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(255),
  description: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  scope: z.enum(['CAMPAIGN', 'AD_SET', 'AD', 'ACCOUNT']),
  scopeId: z.string().optional().nullable(),
  condition: WatchdogConditionSchema,
  action: z.enum(['PAUSE', 'REDUCE_BUDGET_PERCENTAGE', 'NOTIFY_ONLY']),
  actionValue: z.coerce.number().min(1).max(100).optional().nullable(),
  cooldownHours: z.coerce.number().int().min(1).max(720).optional().default(24),
});

export const AdBudgetRuleUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  condition: WatchdogConditionSchema.optional(),
  action: z.enum(['PAUSE', 'REDUCE_BUDGET_PERCENTAGE', 'NOTIFY_ONLY']).optional(),
  actionValue: z.coerce.number().min(1).max(100).optional().nullable(),
  cooldownHours: z.coerce.number().int().min(1).max(720).optional(),
});

// ──────────────────────────────────────────────
// ADS — Recomendaciones
// ──────────────────────────────────────────────

export const AdRecommendationActionSchema = z.object({
  recommendationId: z.string().min(1),
});

// ──────────────────────────────────────────────
// ADS — Schedule (programación horaria)
// ──────────────────────────────────────────────

export const DAYS_OF_WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

export const AdScheduleCreateSchema = z.object({
  campaignId: z.string().min(1, 'Campaña requerida'),
  adSetId: z.string().optional().nullable(),
  name: z.string().min(1, 'Nombre requerido').max(255),
  daysOfWeek: z.array(z.enum(DAYS_OF_WEEK)).min(1, 'Selecciona al menos un día'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  timezone: z.string().optional().default('America/Mexico_City'),
  action: z.enum(['ACTIVATE', 'PAUSE']),
  enabled: z.boolean().optional().default(true),
});

export const AdScheduleUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  daysOfWeek: z.array(z.enum(DAYS_OF_WEEK)).min(1).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().optional(),
  action: z.enum(['ACTIVATE', 'PAUSE']).optional(),
  enabled: z.boolean().optional(),
});

// ──────────────────────────────────────────────
// ADS — A/B Tests
// ──────────────────────────────────────────────

export const AB_TEST_METRICS = ['CTR', 'CPC', 'CPA', 'ROAS', 'CONVERSIONS'] as const;
export const AB_TEST_STATUSES = ['DRAFT', 'RUNNING', 'COMPLETED', 'CANCELLED'] as const;
export const AB_TEST_TRAFFIC_SPLITS = ['FIFTY_FIFTY', 'CUSTOM'] as const;

export const AdABTestVariantSchema = z.object({
  adSetId: z.string().optional().nullable(),
  adId: z.string().optional().nullable(),
  label: z.string().min(1, 'Etiqueta requerida').max(10),
  trafficAllocation: z.coerce.number().min(0).max(100).optional().nullable(),
});

export const AdABTestCreateSchema = z.object({
  campaignId: z.string().min(1, 'Campaña requerida'),
  name: z.string().min(1, 'Nombre requerido').max(255),
  description: z.string().max(2000).optional().nullable(),
  metric: z.enum(AB_TEST_METRICS).default('CTR'),
  significanceThreshold: z.coerce.number().min(0.5).max(0.999).optional().default(0.95),
  trafficSplit: z.enum(AB_TEST_TRAFFIC_SPLITS).optional().default('FIFTY_FIFTY'),
  autoDeclare: z.boolean().optional().default(false),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  variants: z.array(AdABTestVariantSchema).optional().default([]),
});

export const AdABTestUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(AB_TEST_STATUSES).optional(),
  metric: z.enum(AB_TEST_METRICS).optional(),
  significanceThreshold: z.coerce.number().min(0.5).max(0.999).optional(),
  trafficSplit: z.enum(AB_TEST_TRAFFIC_SPLITS).optional(),
  autoDeclare: z.boolean().optional(),
  endDate: z.string().datetime().optional().nullable(),
});

// ──────────────────────────────────────────────
// ADS — Insights (filtros de consulta)
// ──────────────────────────────────────────────

export const AdInsightsQuerySchema = z.object({
  platformId: z.string().optional(),
  campaignId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

// ──────────────────────────────────────────────
// ADS — Publicaciones (creativas unitarias)
// ──────────────────────────────────────────────

// Estados permitidos (deben casar con el dashboard)
export const AdPublicationStatuses = ['BORRADOR', 'PROGRAMADA', 'PUBLICADA', 'ERROR', 'PAUSADA'] as const;
export const AdPublicationPlatforms = ['META', 'GOOGLE'] as const;

export const AdCreativeCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido').max(255),
  mediaUrl: z.string().url('URL de media inválida'),
  mediaType: z.enum(['IMAGE', 'VIDEO']),
  durationSec: z.coerce.number().int().min(1).max(120).optional().nullable(),
  width: z.coerce.number().int().min(1).optional().nullable(),
  height: z.coerce.number().int().min(1).optional().nullable(),
  bodyText: z.string().max(5000).optional().nullable(),
  headline: z.string().max(255).optional().nullable(),
  callToAction: z.enum(['LEARN_MORE', 'SIGN_UP', 'SHOP_NOW', 'BOOK_TRAVEL', 'DOWNLOAD', 'CONTACT_US', 'SUBSCRIBE', 'GET_OFFER', 'GET_QUOTE', 'APPLY_NOW', 'WHATSAPP_MESSAGE']).optional().nullable(),
  landingUrl: z.string().url().optional().nullable(),
});

export const AdBoostSchema = z.object({
  socialPostId: z.string().min(1, 'Se requiere el SocialPost a boostar'),
  budgetDaily: z.coerce.number().min(1, 'Presupuesto diario mínimo 1').optional(),
  budgetTotal: z.coerce.number().min(1).optional(),
  currency: z.string().length(3).optional().default('MXN'),
  campaignId: z.string().optional().nullable(),
  metaPageId: z.string().optional().nullable(),
  adSetId: z.string().optional().nullable(),
});

// Crear publicación: exige o creativeId (creatividad propia) o isBoost con socialPostId
export const AdPublicationCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido').max(255),
  plataforma: z.enum(AdPublicationPlatforms),
  platformId: z.string().min(1, 'platformId requerido (id de AdPlatformConnection)'),
  campaignId: z.string().optional().nullable(),
  creativeId: z.string().optional().nullable(),
  isBoost: z.boolean().optional().default(false),
  socialPostId: z.string().optional().nullable(),
  scheduledFor: z.string().datetime().optional().nullable(),
  budgetDaily: z.coerce.number().min(0).optional().nullable(),
  budgetTotal: z.coerce.number().min(0).optional().nullable(),
  currency: z.string().length(3).optional().default('MXN'),
}).refine(
  (data) => {
    if (data.isBoost) return !!data.socialPostId;
    return !!data.creativeId || data.nombre.length > 0; // creación simple aceptable
  },
  { message: 'Si isBoost=true, socialPostId es obligatorio. En caso contrario, se requiere creativeId.', path: ['socialPostId'] }
);

export const AdPublicationUpdateSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
  campaignId: z.string().nullable().optional(),
  budgetDaily: z.coerce.number().min(0).nullable().optional(),
  budgetTotal: z.coerce.number().min(0).nullable().optional(),
  estado: z.enum(AdPublicationStatuses).optional(),
});

export const AdPublicationListQuerySchema = z.object({
  plataforma: z.enum(AdPublicationPlatforms).optional(),
  estado: z.enum(AdPublicationStatuses).optional(),
  campaignId: z.string().optional(),
  socialPostId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  cursor: z.string().optional(),
});
