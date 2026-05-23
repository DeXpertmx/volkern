import { z } from 'zod';

// ─── Complaints ─────────────────────────────────────────────

export const EqualityComplaintCreateSchema = z.object({
  description: z.string().min(1, 'La descripción es obligatoria'),
  isAnonymous: z.boolean().optional().default(false),
  category: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

export type EqualityComplaintCreateInput = z.infer<typeof EqualityComplaintCreateSchema>;

export const EqualityComplaintUpdateSchema = z.object({
  status: z.string().min(1, 'status es requerido'),
  resolutionNote: z.string().optional(),
});

export type EqualityComplaintUpdateInput = z.infer<typeof EqualityComplaintUpdateSchema>;

// ─── Config ─────────────────────────────────────────────────

export const EqualityConfigSaveSchema = z.object({
  responsibleId: z.string().optional(),
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type EqualityConfigSaveInput = z.infer<typeof EqualityConfigSaveSchema>;

// ─── Config Test ────────────────────────────────────────────

export const EqualityConfigTestSchema = z.object({
  token: z.string().min(1, 'Token es requerido'),
  chatId: z.string().min(1, 'Chat ID es requerido'),
});

export type EqualityConfigTestInput = z.infer<typeof EqualityConfigTestSchema>;
