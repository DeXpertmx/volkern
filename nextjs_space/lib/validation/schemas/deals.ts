import { z } from 'zod';
import { CommonSchemas } from '../common';

/**
 * Schema para crear un Deal
 */
export const DealCreateSchema = z.object({
  leadId: CommonSchemas.id.optional().nullable(),
  contactId: CommonSchemas.id.optional().nullable(),
  titulo: z.string().min(1, 'Título requerido').max(500),
  descripcion: CommonSchemas.descripcion,
  valor: CommonSchemas.montoPositivo,
  moneda: CommonSchemas.moneda,
  etapa: z.string().max(100).default('calificacion'),
  probabilidad: z.coerce.number().int().min(0).max(100).default(25),
  prioridad: z.enum(['baja', 'media', 'alta', 'urgente']).default('media'),
  estado: z.enum(['activo', 'ganado', 'perdido', 'pausado']).default('activo'),
  fechaEstimadaCierre: z.string().datetime().optional().nullable(),
  origen: z.string().max(255).optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
  usuarioAsignadoId: CommonSchemas.id.optional().nullable(),
  catalogoItemId: CommonSchemas.id.optional().nullable(),
  pipelineId: CommonSchemas.id.optional().nullable(),
  newContact: z.object({
    nombre: CommonSchemas.nombre,
    email: CommonSchemas.email,
    telefono: CommonSchemas.telefono,
    tipo: z.enum(['person', 'company']).optional().default('person'),
    cargo: z.string().max(255).optional().nullable(),
    ubicacion: z.string().max(255).optional().nullable(),
    linkedin: z.string().url().optional().nullable(),
    notas: z.string().max(5000).optional().nullable(),
    tags: z.string().max(500).optional().nullable(),
    companyId: CommonSchemas.id.optional().nullable(),
  }).optional(),
});

export type DealCreateInput = z.infer<typeof DealCreateSchema>;

/**
 * Schema para actualizar un Deal
 */
export const DealUpdateSchema = z.object({
  titulo: z.string().min(1).max(500).optional(),
  descripcion: z.string().max(5000).optional().nullable(),
  valor: z.coerce.number().min(0).optional(),
  moneda: z.string().length(3).optional(),
  etapa: z.string().max(100).optional(),
  probabilidad: z.coerce.number().int().min(0).max(100).optional(),
  prioridad: z.enum(['baja', 'media', 'alta', 'urgente']).optional(),
  estado: z.enum(['activo', 'ganado', 'perdido', 'pausado']).optional(),
  fechaEstimadaCierre: z.string().datetime().optional().nullable(),
  fechaCierre: z.string().datetime().optional().nullable(),
  razonPerdida: z.string().max(2000).optional().nullable(),
  competidor: z.string().max(255).optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
  usuarioAsignadoId: z.string().optional().nullable(),
  catalogoItemId: z.string().optional().nullable(),
  notasInternas: z.string().max(10000).optional().nullable(),
});

export type DealUpdateInput = z.infer<typeof DealUpdateSchema>;

/**
 * Schema para crear una actividad de Deal
 */
export const DealActivitySchema = z.object({
  tipo: z.string().min(1, 'Tipo requerido').max(100),
  titulo: z.string().max(500).optional().nullable(),
  descripcion: z.string().max(5000).optional().nullable(),
  resultado: z.string().max(5000).optional().nullable(),
  duracion: z.coerce.number().int().min(0).optional(),
  fechaActividad: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * Schema para crear un archivo adjunto de Deal
 */
export const DealAttachmentSchema = z.object({
  nombre: z.string().min(1).max(255),
  tipoArchivo: z.string().max(100),
  tamano: z.number().int().min(1),
  cloud_storage_path: z.string().min(1),
  descripcion: z.string().max(2000).optional().nullable(),
  categoria: z.string().max(100).optional().nullable(),
});

/**
 * Schema para consulta de forecast
 */
export const DealForecastQuerySchema = z.object({
  fechaInicio: z.string().datetime().optional(),
  fechaFin: z.string().datetime().optional(),
  etapa: z.string().optional(),
  usuarioAsignadoId: z.string().optional(),
});
