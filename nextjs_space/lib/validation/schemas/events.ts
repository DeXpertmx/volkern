import { z } from 'zod';

// ─── Event Engine ───────────────────────────────────────────

export const EventCreateSchema = z.object({
  event: z.string().min(1, 'event is required'),
  data: z.record(z.unknown()).optional().default({}),
  sync: z.boolean().optional().default(true),
});

export type EventCreateInput = z.infer<typeof EventCreateSchema>;

export const EventPackSaveSchema = z.object({
  pack: z.object({
    pack: z.string().min(1),
    triggers: z.array(z.unknown()).min(1, 'triggers required'),
  }).refine(
    p => p.pack && p.triggers?.length > 0,
    { message: 'pack and triggers required' }
  ),
});

export type EventPackSaveInput = z.infer<typeof EventPackSaveSchema>;

export const EventPackConfigSchema = z.object({
  pack_id: z.string().optional(),
  custom_pack: z.record(z.unknown()).optional(),
}).refine(
  data => data.pack_id || data.custom_pack,
  { message: 'pack_id or custom_pack required' }
);

export type EventPackConfigInput = z.infer<typeof EventPackConfigSchema>;

const MARKETPLACE_ACTIONS = ['publish', 'download'] as const;

export const EventPackMarketplaceSchema = z.object({
  action: z.enum(MARKETPLACE_ACTIONS),
  pack_id: z.string().optional(),
  source_tenant_id: z.string().optional(),
}).refine(
  data => data.action !== 'download' || !!data.source_tenant_id,
  { message: 'source_tenant_id required for download action', path: ['source_tenant_id'] }
);

export type EventPackMarketplaceInput = z.infer<typeof EventPackMarketplaceSchema>;

export const EventPackTemplateApplySchema = z.object({
  pack_id: z.string().min(1, 'pack_id is required'),
  apply_now: z.boolean().optional().default(false),
});

export type EventPackTemplateApplyInput = z.infer<typeof EventPackTemplateApplySchema>;

// ─── Video ──────────────────────────────────────────────────

export const VideoValidateSchema = z.object({
  url: z.string().url('URL de video requerida').min(1, 'URL de video requerida'),
});

export type VideoValidateInput = z.infer<typeof VideoValidateSchema>;
