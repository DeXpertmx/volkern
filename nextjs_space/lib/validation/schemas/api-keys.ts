import { z } from 'zod';
import { AVAILABLE_SCOPES } from '@/lib/api-keys';

// Convertir el array as const a tupla para z.enum()
const ScopeSchema = z.enum(AVAILABLE_SCOPES);

/**
 * Schema para crear API key
 */
export const ApiKeyCreateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(200),
  descripcion: z.string().max(500).optional(),
  scopes: z.array(ScopeSchema).min(1, 'Debe seleccionar al menos un scope'),
  expiraEn: z.string().datetime().optional().nullable(),
});

export type ApiKeyCreateInput = z.infer<typeof ApiKeyCreateSchema>;

/**
 * Schema para actualizar API key
 */
export const ApiKeyUpdateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(200).optional(),
  descripcion: z.string().max(500).optional().nullable(),
  scopes: z.array(ScopeSchema).min(1, 'Debe tener al menos un scope').optional(),
  activo: z.boolean().optional(),
  expiraEn: z.string().datetime().optional().nullable(),
});

export type ApiKeyUpdateInput = z.infer<typeof ApiKeyUpdateSchema>;
