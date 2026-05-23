import { z } from 'zod';

// ─── AI Engine ────────────────────────────────────────────────

export const AiChatSchema = z.object({
  prompt: z.string().min(1, 'prompt es requerido'),
  model: z.string().optional(),
});

export const AiGeneratorSchema = z.object({
  prompt: z.string().min(1, 'Prompt requerido'),
  style: z.string().optional(),
});

// ─── AI Skill Handler ─────────────────────────────────────────

export const SkillRequestSchema = z.object({
  action_name: z.string().min(1),
  payload: z.record(z.unknown()),
  target_account_id: z.string().optional(),
});

// ─── Scoring ──────────────────────────────────────────────────

export const ScoringConversationSchema = z.object({
  conversationId: z.string().min(1, 'ID de conversación requerido'),
});

export const ScoringCalculateSchema = z.object({
  leadId: z.string().min(1),
  evento: z.string().min(1),
  categoria: z.string().min(1),
  detalles: z.record(z.unknown()).optional(),
});

export const ScoreCategoryCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  etiqueta: z.string().min(1, 'Etiqueta requerida'),
  descripcion: z.string().optional(),
  puntuacionMin: z.coerce.number(),
  puntuacionMax: z.coerce.number(),
  color: z.string().optional(),
  icono: z.string().optional(),
  orden: z.number().int().optional().default(0),
});

export const ScoreCategoryUpdateSchema = z.object({
  id: z.string().min(1, 'ID requerido'),
  nombre: z.string().min(1).optional(),
  etiqueta: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  puntuacionMin: z.coerce.number().optional(),
  puntuacionMax: z.coerce.number().optional(),
  color: z.string().optional(),
  icono: z.string().optional(),
  orden: z.number().int().optional(),
}).passthrough(); // Allow extra fields for flexible Prisma update

export const ScoringRuleCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  descripcion: z.string().optional(),
  categoria: z.string().min(1, 'Categoría requerida'),
  evento: z.string().min(1, 'Evento requerido'),
  puntos: z.coerce.number(),
  condiciones: z.record(z.unknown()).optional().default({}),
  activo: z.boolean().optional().default(true),
  orden: z.number().int().optional().default(0),
});

export const ScoringRuleUpdateSchema = z.object({
  id: z.string().min(1, 'ID requerido'),
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  categoria: z.string().min(1).optional(),
  evento: z.string().min(1).optional(),
  puntos: z.coerce.number().optional(),
  condiciones: z.record(z.unknown()).optional(),
  activo: z.boolean().optional(),
  orden: z.number().int().optional(),
}).passthrough();

// ─── Gemma ────────────────────────────────────────────────────

export const GemmaExecuteActionSchema = z.object({
  actionId: z.string().min(1, 'actionId requerido'),
  operatorNote: z.string().min(1, 'Nota del operador requerida'),
});

export const GemmaNotifySchema = z.object({
  tenantId: z.string().min(1),
  event: z.string().optional(),
  requestPayload: z.record(z.unknown()).optional(),
  gemmaOutput: z.record(z.unknown(), { required_error: 'gemmaOutput requerido' }),
});

// ─── MCP ──────────────────────────────────────────────────────

export const MCPRequestSchema = z.object({
  method: z.string().optional(),
  params: z.record(z.unknown()).optional(),
  tool: z.string().optional(),
  name: z.string().optional(),
  arguments: z.record(z.unknown()).optional(),
  payload: z.record(z.unknown()).optional(),
  id: z.union([z.string(), z.number()]).optional(),
}).passthrough();
