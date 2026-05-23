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

/**
 * Schema para crear una tarea asociada a un Lead
 */
export const LeadTaskSchema = z.object({
  tipo: z.enum(['llamada', 'email', 'reunion', 'recordatorio']),
  titulo: z.string().min(1, 'Título requerido').max(500),
  descripcion: z.string().max(5000).optional().nullable(),
  fechaVencimiento: CommonSchemas.fechaISO,
  asignadoA: CommonSchemas.id.optional().nullable(),
});

/**
 * Schema para crear un archivo adjunto de Lead
 */
export const LeadAttachmentSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido').max(255),
  tipoArchivo: z.string().min(1, 'Tipo de archivo requerido').max(100),
  tamano: z.number().int().min(1, 'Tamaño debe ser mayor a 0'),
  cloud_storage_path: z.string().min(1, 'Path de almacenamiento requerido'),
  descripcion: z.string().max(2000).optional().nullable(),
});

/**
 * Schema para enriquecer leads con Hunter.io
 */
export const LeadEnrichSchema = z.object({
  leadIds: z.array(z.string().min(1)).min(1, 'Al menos un lead requerido').max(100, 'Máximo 100 leads'),
});

/**
 * Schema para crear/actualizar un campo personalizado
 */
export const CustomFieldSchema = z.object({
  id: z.string().optional(),
  fieldKey: z.string().min(1, 'fieldKey requerido').max(100).regex(/^[a-z_][a-z0-9_]*$/, 'Solo letras minúsculas, números y guion bajo'),
  label: z.string().min(1, 'Label requerido').max(255),
  type: z.enum(['text', 'number', 'date', 'select', 'multiselect', 'boolean', 'email', 'phone', 'url']),
  required: z.boolean().optional().default(false),
  options: z.array(z.string()).optional().nullable(),
  orden: z.number().int().min(0).optional(),
  placeholder: z.string().max(255).optional().nullable(),
  valorDefecto: z.any().optional().nullable(),
});

/**
 * Schema para guardar una búsqueda externa
 */
export const SavedSearchSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(255),
  source: z.string().min(1, 'Fuente requerida').max(100),
  criteria: z.record(z.any()),
  resultsCount: z.number().int().min(0).optional().default(0),
});

/**
 * Schema para guardar configuración de asignación de leads
 * (pass-through genérico)
 */
export const AssignmentConfigSchema = z.record(z.any());

/**
 * Schema para crear interacción vía endpoint general leads/interacciones
 */
export const LeadGeneralInteractionSchema = z.object({
  leadId: CommonSchemas.id,
  tipo: z.string().min(1, 'Tipo requerido').max(100),
  titulo: z.string().max(500).optional().nullable(),
  descripcion: z.string().max(5000).optional().nullable(),
  metadata: z.record(z.any()).optional(),
  resultado: z.string().max(5000).optional().nullable(),
});

/**
 * Criterios de búsqueda externa reutilizables
 */
export const ExternalSearchCriteriaSchema = z.object({
  cargo: z.string().optional(),
  ubicacion: z.string().optional(),
  empresa: z.string().optional(),
  palabrasClave: z.string().optional(),
  escuela: z.string().optional(),
  industria: z.string().optional(),
  senioridad: z.string().optional(),
  tamanoEmpresa: z.string().optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

/**
 * Schema para búsqueda en LinkedIn
 */
export const LinkedInSearchSchema = z.object({
  criterios: ExternalSearchCriteriaSchema,
  saveSearch: z.boolean().optional().default(false),
  searchName: z.string().max(255).optional(),
});

/**
 * Schema para búsqueda en Hunter.io
 */
export const HunterSearchSchema = z.object({
  domain: z.string().optional(),
  company: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
  type: z.string().optional(),
  offset: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(100).optional().default(10),
  saveSearch: z.boolean().optional().default(false),
  searchName: z.string().max(255).optional(),
}).refine(data => data.domain || data.company, {
  message: 'Debes proporcionar un dominio o nombre de empresa',
  path: ['domain']
});

/**
 * Schema para búsqueda en Apollo.io
 */
export const ApolloSearchSchema = z.object({
  criterios: ExternalSearchCriteriaSchema,
  saveSearch: z.boolean().optional().default(false),
  searchName: z.string().max(255).optional(),
});
