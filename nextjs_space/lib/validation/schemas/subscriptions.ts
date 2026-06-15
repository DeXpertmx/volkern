import { z } from 'zod';
import { CommonSchemas } from '../common';

/**
 * Planes válidos del sistema (sin depender de lib/plans para evitar imports circulares)
 */
const VALID_PLANS = [
  'trial', 'esencial', 'profesional', 'infinity',
  'basico',
  'agency-slot', 'pro-agency', 'accounting-slot', 'pro-accounting'
] as const;

const VALID_FEATURES = [
  'leads', 'users', 'contacts', 'emails_per_month',
  'automation_runs', 'whatsapp_messages', 'sms_messages',
  'courses', 'students', 'storage_gb', 'ai_image_generations',
  'business_emails', 'business_domains', 'business_email_gb',
  'automations_count', 'pages'
] as const;

// ─────────────────────────────────────────────
// Subscripciones
// ─────────────────────────────────────────────

/**
 * Schema para crear una suscripción (genera checkout de Stripe)
 */
export const SubscriptionCreateSchema = z.object({
  planId: z.enum(VALID_PLANS, {
    errorMap: () => ({ message: 'Plan inválido' })
  }),
});

export type SubscriptionCreateInput = z.infer<typeof SubscriptionCreateSchema>;

/**
 * Schema para actualizar/cambiar de plan
 */
export const SubscriptionUpdateSchema = z.object({
  newPlanId: z.enum(VALID_PLANS, {
    errorMap: () => ({ message: 'Plan inválido' })
  }),
});

export type SubscriptionUpdateInput = z.infer<typeof SubscriptionUpdateSchema>;

/**
 * Schema para verificar límite de feature
 */
export const FeatureLimitCheckSchema = z.object({
  feature: z.enum(VALID_FEATURES, {
    errorMap: () => ({ message: 'Feature name inválido' })
  }),
  amount: z.coerce.number().int().min(1).optional().default(1),
});

export type FeatureLimitCheckInput = z.infer<typeof FeatureLimitCheckSchema>;

/**
 * Schema para incrementar uso de feature
 */
export const FeatureUsageIncrementSchema = z.object({
  feature: z.enum(VALID_FEATURES, {
    errorMap: () => ({ message: 'Feature name inválido' })
  }),
  increment: z.coerce.number().int().min(1).optional().default(1),
});

export type FeatureUsageIncrementInput = z.infer<typeof FeatureUsageIncrementSchema>;

// ─────────────────────────────────────────────
// Checkout / Pagos
// ─────────────────────────────────────────────

/**
 * Schema para crear sesión de checkout (pago de cita)
 */
export const CheckoutCreateSchema = z.object({
  citaId: CommonSchemas.id,
});

export type CheckoutCreateInput = z.infer<typeof CheckoutCreateSchema>;

// ─────────────────────────────────────────────
// Cupones (Coupons)
// ─────────────────────────────────────────────

/**
 * Schema para redimir un cupón (público/registro)
 */
export const CouponRedeemSchema = z.object({
  code: z.string().min(1, 'Código requerido').max(20),
  email: CommonSchemas.email,
  tenantId: z.string().min(1, 'Tenant ID requerido'),
});

export type CouponRedeemInput = z.infer<typeof CouponRedeemSchema>;

/**
 * Schema para validar un cupón
 */
export const CouponValidateSchema = z.object({
  code: z.string().min(1, 'Código requerido').max(20),
  email: CommonSchemas.email.optional(),
});

export type CouponValidateInput = z.infer<typeof CouponValidateSchema>;

/**
 * Schema para crear un cupón (admin)
 */
export const AdminCouponCreateSchema = z.object({
  descripcion: z.string().max(500).optional(),
  justification: z.string().min(1, 'Justificación requerida').max(2000),
  durationDays: z.coerce.number().int().min(1, 'Duración mínima 1 día').max(365, 'Duración máxima 365 días').optional().default(30),
  discountPercent: z.coerce.number().min(0, 'Descuento mínimo 0%').max(100, 'Descuento máximo 100%').optional().default(0),
  modules: z.array(z.string()).optional(),
  limiteLeads: z.coerce.number().int().min(1).optional().default(1000),
  limiteUsuarios: z.coerce.number().int().min(1).optional().default(5),
  maxUses: z.coerce.number().int().min(1).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type AdminCouponCreateInput = z.infer<typeof AdminCouponCreateSchema>;

/**
 * Schema para actualizar un cupón (admin - PUT)
 */
export const AdminCouponUpdateSchema = z.object({
  id: z.string().min(1, 'ID del cupón requerido'),
  action: z.enum(['toggle', 'extend']).optional(),
  days: z.coerce.number().int().min(1).optional(),
  descripcion: z.string().max(500).optional(),
  justification: z.string().max(2000).optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  limiteLeads: z.coerce.number().int().min(1).optional(),
  limiteUsuarios: z.coerce.number().int().min(1).optional(),
  maxUses: z.coerce.number().int().min(1).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  modules: z.array(z.string()).optional(),
});

export type AdminCouponUpdateInput = z.infer<typeof AdminCouponUpdateSchema>;

// ─────────────────────────────────────────────
// Banking (Plaid)
// ─────────────────────────────────────────────

/**
 * Schema para intercambiar public_token de Plaid por access_token
 */
export const PlaidExchangeTokenSchema = z.object({
  publicToken: z.string().min(1, 'public_token requerido'),
  metadata: z.record(z.any()).optional(),
});

export type PlaidExchangeTokenInput = z.infer<typeof PlaidExchangeTokenSchema>;

/**
 * Schema para conectar banco (Stripe Financial Connections)
 */
export const BankingConnectSchema = z.object({
  tenantId: z.string().min(1, 'Tenant ID requerido'),
});

export type BankingConnectInput = z.infer<typeof BankingConnectSchema>;
