import { z } from 'zod';
import { MONEDA_PLATAFORMA } from '@/lib/moneda';

// ─── Tenants ───────────────────────────────────────────────

export const TenantCreateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  slug: z.string().min(1, 'El slug es obligatorio').regex(/^[a-z0-9-]+$/, 'Slug inválido: solo minúsculas, números y guiones'),
  plan: z.string().optional().default('trial'),
  dominio: z.string().optional(),
  billingEmail: z.string().email('Email de facturación inválido').optional().or(z.literal('')),
  // Una cuenta nueva nace con la divisa con la que Volkern factura sus planes.
  moneda: z.string().optional().default(MONEDA_PLATAFORMA),
  estado: z.enum(['activo', 'inactivo', 'suspendido', 'trial']).optional().default('activo'),
  limites: z.record(z.unknown()).optional(),
  trialDays: z.coerce.number().int().min(1).optional(),
  autoProvision: z.boolean().optional().default(true),
});

export const TenantUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug inválido').optional(),
  plan: z.string().optional(),
  estado: z.enum(['activo', 'inactivo', 'suspendido', 'trial']).optional(),
  dominio: z.string().optional(),
  billingEmail: z.string().email().optional().or(z.literal('')),
  stripeCustomerId: z.string().optional(),
  mrr: z.coerce.number().optional(),
  moneda: z.string().optional(),
  limites: z.record(z.unknown()).optional(),
  configuracion: z.record(z.unknown()).optional(),
});

export const TenantModuleUpdateSchema = z.object({
  moduleId: z.string().min(1, 'moduleId es requerido'),
  habilitado: z.boolean(),
  razon: z.string().optional(),
});

export const TenantPlanAssignSchema = z.object({
  plan: z.string().min(1, 'El plan es requerido'),
});

// ─── Operations ────────────────────────────────────────────

const operationTypes = [
  'provision_db', 'extend_trial', 'suspend', 'reactivate',
  'toggle_industrial_license', 'toggle_feature', 'assign_plan',
] as const;

export const TenantOperationSchema = z.object({
  operation: z.enum(operationTypes).optional(),
  type: z.enum(operationTypes).optional(),
  params: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.operation || data.type,
  { message: 'Se requiere operation o type' }
);

// ─── Plans ──────────────────────────────────────────────────

export const PlanCreateSchema = z.object({
  nombre: z.string().min(1, 'El nombre del plan es obligatorio'),
  precio: z.coerce.number({ invalid_type_error: 'El precio debe ser un número válido' }),
  // Los planes son el catálogo de Volkern y se publican en la divisa de la
  // plataforma: su precio no se factura en pesos por no indicarlo.
  moneda: z.string().optional().default(MONEDA_PLATAFORMA),
  intervalo: z.string().optional().default('mensual'),
  limiteUsuarios: z.coerce.number().int().optional().default(0),
  limiteLeads: z.coerce.number().int().optional().default(0),
  limiteStorage: z.coerce.number().int().optional().default(0),
  limiteCursos: z.coerce.number().int().optional().default(0),
  limiteEstudiantes: z.coerce.number().int().optional().default(0),
  stripePriceId: z.string().optional(),
  activo: z.boolean().optional(),
  esPublico: z.boolean().optional(),
  esPopular: z.boolean().optional().default(false),
  ui_features: z.array(z.string()).optional(),
  modules: z.array(z.string()).optional(),
});

export const PlanUpdateSchema = z.object({
  nombre: z.string().optional(),
  precio: z.coerce.number().optional(),
  moneda: z.string().optional(),
  limiteUsuarios: z.coerce.number().int().optional(),
  limiteLeads: z.coerce.number().int().optional(),
  limiteStorage: z.coerce.number().int().optional(),
  limiteCursos: z.coerce.number().int().optional(),
  limiteEstudiantes: z.coerce.number().int().optional(),
  modules: z.array(z.string()).optional(),
  stripePriceId: z.string().optional(),
  ui_features: z.array(z.string()).optional(),
  activo: z.boolean().optional(),
  esPublico: z.boolean().optional(),
  esPopular: z.boolean().optional(),
  ordenamiento: z.coerce.number().int().optional(),
});

// ─── Settings ───────────────────────────────────────────────

export const AdminSettingsUpdateSchema = z.record(z.unknown());

// ─── SaaS Metrics ───────────────────────────────────────────

export const SaasMetricsActionSchema = z.object({
  action: z.enum(['record', 'snapshot', 'recalculate']),
  tenantId: z.string().optional(),
});

export const SaasMetricsSnapshotSchema = z.object({
  force: z.boolean().optional().default(false),
});

// ─── Backup ─────────────────────────────────────────────────

export const BackupCreateSchema = z.object({
  status: z.string().min(1, 'El status es obligatorio'),
  fileName: z.string().optional(),
  fileSize: z.string().optional(), // BigInt se representa como string en JSON
  storageProvider: z.string().optional().default('S3'),
  checksum: z.string().optional(),
  errorMessage: z.string().optional(),
});

// ─── Audit ──────────────────────────────────────────────────

export const AuditCreateSchema = z.object({
  action: z.string().min(1, 'action es requerido'),
  entity: z.string().min(1, 'entity es requerido'),
  entityId: z.string().min(1, 'entityId es requerido'),
  description: z.string().min(1, 'description es requerido'),
  tenantId: z.string().min(1, 'tenantId es requerido'),
  userId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  changesBefore: z.unknown().optional(),
  changesAfter: z.unknown().optional(),
});

export const AuditAlertResolveSchema = z.object({
  alertId: z.string().min(1, 'alertId es requerido'),
  note: z.string().min(20, 'La justificación debe tener al menos 20 caracteres'),
  reactivateModule: z.boolean().optional(),
  auditId: z.string().optional(),
});

export const AuditModuleControlSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().min(10, 'La justificación debe tener al menos 10 caracteres'),
});

export const GdprAnonymizeSchema = z.object({
  userId: z.string().min(1, 'userId es requerido'),
  tenantId: z.string().min(1, 'tenantId es requerido'),
});

// ─── Templates ──────────────────────────────────────────────

export const TemplateCreateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  descripcion: z.string().optional(),
  categoria: z.string().min(1, 'La categoría es obligatoria'),
  etiquetas: z.array(z.string()).optional(),
  imagenPreview: z.string().optional(),
});

export const TemplateUpdateSchema = z.object({
  nombre: z.string().optional(),
  descripcion: z.string().optional(),
  categoria: z.string().optional(),
  etiquetas: z.array(z.string()).optional(),
  contenido: z.record(z.unknown()).optional(),
  configuracionDefecto: z.record(z.unknown()).optional(),
  imagenPreview: z.string().optional(),
  esPublica: z.boolean().optional(),
});

// ─── Impersonate & Data Deletion ────────────────────────────

export const ImpersonateActionSchema = z.object({
  tenantId: z.string().optional(),
  action: z.enum(['start', 'stop']),
});

export const DataDeletionActionSchema = z.object({
  requestId: z.string().min(1, 'requestId es requerido'),
  action: z.enum(['process', 'reject']),
  reason: z.string().optional(),
});
