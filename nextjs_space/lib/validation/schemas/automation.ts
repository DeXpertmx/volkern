import { z } from 'zod';

// ─── Pipeline Stages ──────────────────────────────────────────

export const PipelineStageCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  descripcion: z.string().optional(),
  probabilidad: z.coerce.number().int().min(0).max(100).optional().default(50),
  color: z.string().optional().default('#3b82f6'),
  requiereAprobacion: z.boolean().optional().default(false),
});

export const PipelineStageUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  probabilidad: z.coerce.number().int().min(0).max(100).optional(),
  color: z.string().optional(),
  requiereAprobacion: z.boolean().optional(),
  activo: z.boolean().optional(),
});

export const PipelineStageReorderSchema = z.object({
  stages: z.array(
    z.object({
      id: z.string().min(1),
      orden: z.number().int().min(0),
    })
  ).min(1, 'Se requiere al menos una etapa'),
});

// ─── Automation Scheduler ─────────────────────────────────────

export const AutomationSchedulerCreateJobSchema = z.object({
  action: z.literal('create_job'),
  name: z.string().min(1),
  schedule: z.string().min(1),
  event: z.string().min(1),
  data: z.record(z.unknown()).optional().default({}),
  activo: z.boolean().optional().default(true),
});

export const AutomationSchedulerDeleteJobSchema = z.object({
  action: z.literal('delete_job'),
  jobId: z.string().min(1),
});

export const AutomationSchedulerScanRecoverySchema = z.object({
  action: z.literal('scan_recovery'),
  hours: z.coerce.number().int().positive().optional().default(48),
  stages: z.array(z.string()).optional().default(['calificado', 'propuesta', 'negociacion']),
});

export const AutomationSchedulerRecoverLeadSchema = z.object({
  action: z.literal('recover_lead'),
  leadId: z.string().min(1),
});

export const AutomationSchedulerActionSchema = z.discriminatedUnion('action', [
  AutomationSchedulerCreateJobSchema,
  AutomationSchedulerDeleteJobSchema,
  AutomationSchedulerScanRecoverySchema,
  AutomationSchedulerRecoverLeadSchema,
]);

// ─── External Workflows (n8n) ─────────────────────────────────

export const AutomationWorkflowCreateSchema = z.object({
  n8nWorkflowId: z.string().min(1, 'n8nWorkflowId requerido'),
  nombre: z.string().min(1, 'Nombre requerido'),
  descripcion: z.string().optional(),
  trigger: z.string().min(1, 'Trigger requerido'),
  configPayload: z.record(z.unknown()).optional(),
  webhookUrl: z.string().url().optional().or(z.literal('')),
});

export const AutomationWorkflowUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  trigger: z.string().min(1).optional(),
  configPayload: z.record(z.unknown()).optional(),
  webhookUrl: z.string().url().optional().or(z.literal('')),
  activo: z.boolean().optional(),
});

export const AutomationExternalExecuteSchema = z.object({
  workflowId: z.string().min(1, 'workflowId es requerido'),
  payload: z.record(z.unknown()).optional().default({}),
  timeout: z.number().int().positive().optional().default(30000),
  retryCount: z.number().int().min(0).optional().default(3),
  trigger: z.string().optional().default('manual'),
});
