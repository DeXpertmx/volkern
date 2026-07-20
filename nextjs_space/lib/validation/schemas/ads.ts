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
