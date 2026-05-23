import { z } from 'zod';
import { CommonSchemas } from '../common';

// ──────────────────────────────────────────────
// Campaign — Mensajes (Campaign + CampaignMessage)
// ──────────────────────────────────────────────

export const CampaignMessageSchema = z.object({
  canal: z.string().min(1, 'Canal requerido').max(50),
  asunto: z.string().max(500).optional().nullable(),
  contenido: z.string().min(1, 'Contenido requerido'),
  mediaUrl: z.string().url('URL inválida').optional().nullable(),
  orden: z.coerce.number().int().min(0).optional().default(0),
  delayMinutos: z.coerce.number().int().min(0).optional().nullable(),
  variante: z.string().max(50).optional().nullable(),
  porcentajeTrafico: z.coerce.number().min(0).max(100).optional().nullable(),
});

export const CampaignCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido').max(255),
  descripcion: z.string().max(5000).optional().nullable(),
  tipo: z.string().max(50).optional().default('manual'),
  canales: z.array(z.string()).optional().default([]),
  targetType: z.string().max(50).optional().default('todos'),
  targetConfig: z.record(z.unknown()).optional().default({}),
  fechaProgramada: z.string().datetime().optional().nullable(),
  frecuencia: z.string().max(50).optional().nullable(),
  fechaFin: z.string().datetime().optional().nullable(),
  mensajes: z.array(CampaignMessageSchema).optional().default([]),
});

export const CampaignUpdateSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  descripcion: z.string().max(5000).optional().nullable(),
  tipo: z.string().max(50).optional(),
  canales: z.array(z.string()).optional(),
  targetType: z.string().max(50).optional(),
  targetConfig: z.record(z.unknown()).optional(),
  fechaProgramada: z.string().datetime().optional().nullable(),
  frecuencia: z.string().max(50).optional().nullable(),
  fechaFin: z.string().datetime().optional().nullable(),
  mensajes: z.array(CampaignMessageSchema).optional(),
});

// ──────────────────────────────────────────────
// Marketing AI
// ──────────────────────────────────────────────

export const MarketingAiGenerateSchema = z.object({
  prompt: z.string().min(1, 'Prompt requerido'),
  platform: z.string().max(50).optional().default('general'),
});

export const MarketingAiGenerateSeoSchema = z.object({
  pageTitle: z.string().min(1, 'Título requerido').max(500),
  contentSnippet: z.string().max(5000).optional().default(''),
});

export const MarketingAiGenerateBlockSchema = z.object({
  description: z.string().min(1, 'Descripción requerida').max(2000),
  category: z.string().max(100).optional().default('General'),
});

// ──────────────────────────────────────────────
// Marketing Automation — Rules
// ──────────────────────────────────────────────

export const AutomationRuleCreateSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(255),
  description: z.string().max(5000).optional().nullable(),
  trigger: z.string().min(1, 'Trigger requerido').max(100),
  conditions: z.record(z.unknown()).optional().default({}),
  actions: z.array(z.record(z.unknown())).optional().default([]),
  isActive: z.boolean().optional().default(true),
  priority: z.coerce.number().int().min(0).optional().default(0),
});

export const AutomationRuleUpdateSchema = z.object({
  id: z.string().min(1, 'ID requerido'),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional().nullable(),
  trigger: z.string().max(100).optional(),
  conditions: z.record(z.unknown()).optional(),
  actions: z.array(z.record(z.unknown())).optional(),
  isActive: z.boolean().optional(),
  priority: z.coerce.number().int().min(0).optional(),
});

export const AutomationSimulateSchema = z.object({
  rule: z.object({
    conditions: z.record(z.unknown()).optional().default({}),
    actions: z.array(z.record(z.unknown())).optional().default([]),
  }),
  entityData: z.record(z.unknown()).optional().default({}),
});

// ──────────────────────────────────────────────
// Marketing Compliance — Suppressions
// ──────────────────────────────────────────────

export const MarketingSuppressionSchema = z.object({
  email: CommonSchemas.email,
  reason: z.string().max(500).optional().nullable(),
});

// ──────────────────────────────────────────────
// Marketing Social — Publish
// ──────────────────────────────────────────────

export const SocialPublishSchema = z.object({
  platform: z.string().min(1, 'Plataforma requerida').max(50),
  content: z.string().min(1, 'Contenido requerido').max(5000),
  mediaUrls: z.array(z.string().url('URL inválida')).optional().default([]),
  scheduledAt: z.string().datetime().optional().nullable(),
});

// ──────────────────────────────────────────────
// Marketing Web — Form Submit
// ──────────────────────────────────────────────

export const WebFormSubmitSchema = z.object({
  formId: z.string().min(1, 'formId requerido'),
  payload: z.record(z.unknown()),
});

// ──────────────────────────────────────────────
// Marketing Queues — Retry
// ──────────────────────────────────────────────

export const QueueRetrySchema = z.object({
  queueName: z.string().min(1, 'queueName requerido').max(255),
  jobId: z.string().min(1, 'jobId requerido').max(255),
});

// ──────────────────────────────────────────────
// Email Campaigns
// ──────────────────────────────────────────────

export const EmailCampaignCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido').max(255),
  asunto: z.string().min(1, 'Asunto requerido').max(500),
  remitente: z.string().max(255).optional(),
  remitenteEmail: z.string().email('Email inválido').max(255).optional(),
  responderA: z.string().email('Email inválido').max(255).optional(),
  contenidoHTML: z.string().min(1, 'Contenido HTML requerido'),
  contenidoTexto: z.string().optional().nullable(),
  plantillaId: z.string().optional().nullable(),
  audienciaId: z.string().optional().nullable(),
  filtrosJSON: z.record(z.unknown()).optional(),
  tipoProgramacion: z.string().max(50).optional().default('inmediato'),
  fechaEnvio: z.string().datetime().optional().nullable(),
});

export const EmailCampaignUpdateSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  asunto: z.string().min(1).max(500).optional(),
  remitente: z.string().max(255).optional(),
  remitenteEmail: z.string().email().max(255).optional(),
  responderA: z.string().email().max(255).optional(),
  contenidoHTML: z.string().min(1).optional(),
  contenidoTexto: z.string().optional().nullable(),
  plantillaId: z.string().optional().nullable(),
  audienciaId: z.string().optional().nullable(),
  filtrosJSON: z.record(z.unknown()).optional(),
  tipoProgramacion: z.string().max(50).optional(),
  fechaEnvio: z.string().datetime().optional().nullable(),
});

// ──────────────────────────────────────────────
// Email Campaign Audiences
// ──────────────────────────────────────────────

export const AudienceCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido').max(255),
  descripcion: z.string().max(5000).optional().nullable(),
  filtros: z.object({
    tags: z.array(z.string()).optional(),
    scoreMin: z.coerce.number().min(0).optional(),
    scoreMax: z.coerce.number().max(1000).optional(),
    estado: z.string().optional(),
  }).optional().default({}),
});

export const AudienceUpdateSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  descripcion: z.string().max(5000).optional().nullable(),
  filtros: z.object({
    tags: z.array(z.string()).optional(),
    scoreMin: z.coerce.number().min(0).optional(),
    scoreMax: z.coerce.number().max(1000).optional(),
    estado: z.string().optional(),
  }).optional(),
});

// ──────────────────────────────────────────────
// Email Campaign Templates
// ──────────────────────────────────────────────

export const EmailTemplateCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido').max(255),
  descripcion: z.string().max(5000).optional().nullable(),
  categoria: z.string().max(100).optional().default('general'),
  asuntoPorDefecto: z.string().max(500).optional().default(''),
  contenidoHTML: z.string().min(1, 'Contenido HTML requerido'),
  contenidoTexto: z.string().optional().nullable(),
  variablesDisponibles: z.array(z.string()).optional(),
});

// ──────────────────────────────────────────────
// Social Platform Config
// ──────────────────────────────────────────────

export const SocialConfigSchema = z.object({
  platform: z.string().min(1, 'Plataforma requerida').max(50),
  accessToken: z.string().min(1, 'Token requerido'),
  profileId: z.string().optional().nullable(),
  profileName: z.string().max(255).optional().nullable(),
  profileImage: z.string().url('URL inválida').optional().nullable(),
});

// ──────────────────────────────────────────────
// Social Post Create
// ──────────────────────────────────────────────

export const SocialPostCreateSchema = z.object({
  content: z.string().min(1, 'Contenido requerido').max(5000),
  mediaUrls: z.array(z.string().url('URL inválida')).optional().default([]),
  platforms: z.array(z.string().min(1)).min(1, 'Al menos una plataforma requerida'),
  scheduledFor: z.string().datetime().optional().nullable(),
  immediate: z.boolean().optional().default(false),
});

// ──────────────────────────────────────────────
// Email Campaign — Declarar Ganador AB Test
// ──────────────────────────────────────────────

export const EmailCampaignDeclararGanadorSchema = z.object({
  ganador: z.enum(['A', 'B'], { message: 'Ganador inválido, debe ser A o B' }),
});

// ──────────────────────────────────────────────
// Email Campaign — Registrar Conversión
// ──────────────────────────────────────────────

export const EmailCampaignConversionSchema = z.object({
  recipientId: z.string().min(1, 'recipientId es requerido'),
  valorConversion: z.coerce.number().optional().nullable(),
});

// ──────────────────────────────────────────────
// Email Campaign — Preview con lead
// ──────────────────────────────────────────────

export const EmailCampaignPreviewSchema = z.object({
  leadId: z.string().optional().nullable(),
});

// ──────────────────────────────────────────────
// Email Campaign — Preview sin campaña
// ──────────────────────────────────────────────

export const EmailCampaignPreviewDataSchema = z.object({
  contenidoHTML: z.string().optional().default(''),
  asunto: z.string().optional().default(''),
});

// ──────────────────────────────────────────────
// Email Campaign — Track Conversion from email
// ──────────────────────────────────────────────

export const EmailCampaignTrackConversionSchema = z.object({
  valor: z.coerce.number().optional().nullable(),
  tipo: z.string().optional().nullable(),
});

// ──────────────────────────────────────────────
// Business Email Account Create
// ──────────────────────────────────────────────

export const BusinessEmailAccountCreateSchema = z.object({
  domainId: z.string().min(1, 'domainId es requerido'),
  username: z.string().min(1, 'username es requerido'),
  fullName: z.string().optional(),
  password: z.string().min(1, 'password es requerido'),
});

// ──────────────────────────────────────────────
// Business Email Config
// ──────────────────────────────────────────────

export const BusinessEmailConfigSchema = z.object({
  enabled: z.boolean(),
});

// ──────────────────────────────────────────────
// Business Email Domain
// ──────────────────────────────────────────────

export const BusinessEmailDomainSchema = z.object({
  domain: z.string().min(1, 'Dominio es requerido'),
});
