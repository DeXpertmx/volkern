import { z } from 'zod';
import { CommonSchemas } from '../common';

/**
 * Schema para crear/actualizar un Lead
 */
export const LeadCreateSchema = z.object({
  nombre: CommonSchemas.nombre,
  email: CommonSchemas.email,
  telefono: CommonSchemas.telefono,
  empresa: z.string().max(255).optional().nullable(),
  cargo: z.string().max(255).optional().nullable(),
  ubicacion: z.string().max(255).optional().nullable(),
  linkedin: z.string().url('LinkedIn URL inválida').optional().nullable(),
  notas: z.string().max(10000).optional().nullable(),
  fuente: z.string().max(100).optional().nullable(),
  etapa: z.string().max(50).optional().nullable(),
  scoreValue: z.number().int().optional(),
  contextoProyecto: z.string().max(5000).optional().nullable(),
  metadataExterna: z.record(z.any()).optional(),
  tags: z.string().max(500).optional().nullable(),
});

export type LeadCreateInput = z.infer<typeof LeadCreateSchema>;

/**
 * Schema para actualizar un Lead (todos los campos opcionales)
 */
export const LeadUpdateSchema = LeadCreateSchema.partial();

export type LeadUpdateInput = z.infer<typeof LeadUpdateSchema>;

/**
 * Schema para cambiar el estado/etapa de un Lead
 */
export const LeadStageSchema = z.object({
  etapa: z.string().min(1, 'Etapa requerida'),
  notas: z.string().max(2000).optional().nullable(),
});

/**
 * Schema para asignar un Lead a un usuario
 */
export const LeadAssignSchema = z.object({
  usuarioId: CommonSchemas.id,
});

/**
 * Schema para crear una nota en un Lead
 */
export const LeadNoteSchema = z.object({
  contenido: z.string().min(1, 'Contenido requerido').max(10000),
  sentimiento: z.enum(['positivo', 'negativo', 'neutral']).optional(),
});

/**
 * Schema para crear una interacción en un Lead
 */
export const LeadInteractionSchema = z.object({
  tipo: z.string().min(1, 'Tipo requerido').max(100),
  contenido: z.string().min(1, 'Contenido requerido').max(10000),
  resultado: z.string().max(5000).optional().nullable(),
  metadatos: z.record(z.any()).optional(),
});

/**
 * Schema para buscar leads externamente
 */
export const ExternalSearchSchema = z.object({
  query: z.string().min(1, 'Búsqueda requerida').max(500),
  fuente: z.enum(['apollo', 'hunter', 'linkedin']).optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

/**
 * Schema para importar leads externos
 */
export const ExternalLeadImportSchema = z.object({
  leads: z.array(z.object({
    nombre: z.string().min(1),
    email: z.string().email().optional().nullable(),
    telefono: z.string().optional().nullable(),
    empresa: z.string().optional().nullable(),
    cargo: z.string().optional().nullable(),
    fuente: z.string().optional(),
  })).min(1, 'Al menos un lead requerido').max(500, 'Máximo 500 leads por importación'),
});

/**
 * Schema para convertir un Lead a Contact
 */
export const LeadConvertSchema = z.object({
  tipo: z.enum(['person', 'company']).optional().default('person'),
  cargo: z.string().max(255).optional().nullable(),
});
