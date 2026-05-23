import { z } from 'zod';

// ─── Skills ─────────────────────────────────────────────────

export const SkillExecuteSchema = z.object({
  skill: z.string().min(1, 'skill es requerido'),
  payload: z.record(z.unknown()).optional().default({}),
});

export type SkillExecuteInput = z.infer<typeof SkillExecuteSchema>;

// ─── Automatizaciones ──────────────────────────────────────

export const AutomationCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre es requerido'),
  descripcion: z.string().optional(),
  trigger: z.string().min(1, 'Trigger es requerido'),
  flowData: z.record(z.unknown()).optional().default({ nodes: [], edges: [] }),
});

export type AutomationCreateInput = z.infer<typeof AutomationCreateSchema>;

export const AutomationUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  trigger: z.string().min(1).optional(),
  flowData: z.record(z.unknown()).optional(),
  activo: z.boolean().optional(),
});

export type AutomationUpdateInput = z.infer<typeof AutomationUpdateSchema>;

export const AutomationTestContextSchema = z.object({
  context: z.record(z.unknown()),
});

export type AutomationTestContextInput = z.infer<typeof AutomationTestContextSchema>;

export const AutomationTestRunSchema = z.object({
  automationId: z.string().min(1, 'automationId es requerido'),
  mockContext: z.record(z.unknown()).optional(),
});

export type AutomationTestRunInput = z.infer<typeof AutomationTestRunSchema>;

export const AutomationFromTemplateSchema = z.object({
  templateId: z.string().min(1, 'templateId es requerido'),
  nombre: z.string().optional(),
  personalizar: z.record(z.unknown()).optional(),
});

export type AutomationFromTemplateInput = z.infer<typeof AutomationFromTemplateSchema>;

// ─── Volkern Execute ───────────────────────────────────────

export const VolkernExecuteSchema = z.object({
  userId: z.string().min(1, 'userId es requerido'),
  tool: z.string().min(1, 'tool es requerido'),
  arguments: z.record(z.unknown()).optional().default({}),
});

export type VolkernExecuteInput = z.infer<typeof VolkernExecuteSchema>;
