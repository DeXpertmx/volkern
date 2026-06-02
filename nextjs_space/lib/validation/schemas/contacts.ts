import { z } from 'zod';
import { CommonSchemas } from '../common';

/**
 * Schema para crear un Contact
 */
export const ContactCreateSchema = z.object({
  nombre: CommonSchemas.nombre,
  email: CommonSchemas.email,
  telefono: CommonSchemas.telefono,
  tipo: z.enum(['person', 'company']).default('person'),
  companyId: CommonSchemas.id.optional().nullable(),
  cargo: z.string().max(255).optional().nullable(),
  ubicacion: z.string().max(255).optional().nullable(),
  linkedin: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.string().url('LinkedIn URL inválida').optional()
  ),
  notas: z.string().max(10000).optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
});

/** Schema para crear empresa (company) - same as ContactCreateSchema but with tipo forced */
export const CompanyCreateSchema = ContactCreateSchema.extend({
  tipo: z.literal('company'),
  linkedin: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.string().url('LinkedIn URL inválida').optional()
  ),
});

export type ContactCreateInput = z.infer<typeof ContactCreateSchema>;

/**
 * Schema para actualizar un Contact
 */
export const ContactUpdateSchema = ContactCreateSchema.partial();

export type ContactUpdateInput = z.infer<typeof ContactUpdateSchema>;

/**
 * Schema para crear una nota de Contact
 */
export const ContactNoteSchema = z.object({
  contenido: z.string().min(1, 'Contenido requerido').max(10000),
  metadata: z.record(z.any()).optional(),
});

/**
 * Schema para crear una interacción de Contact
 */
export const ContactInteractionSchema = z.object({
  tipo: z.string().min(1, 'Tipo requerido').max(100),
  contenido: z.string().min(1, 'Contenido requerido').max(10000),
  resultado: z.string().max(5000).optional().nullable(),
  metadatos: z.record(z.any()).optional(),
});

/**
 * Schema para crear un archivo adjunto de Contact
 */
export const ContactAttachmentSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido').max(255),
  tipoArchivo: z.string().min(1, 'Tipo de archivo requerido').max(100),
  tamano: z.number().int().min(1, 'Tamaño debe ser mayor a 0'),
  cloud_storage_path: z.string().min(1, 'Path de almacenamiento requerido'),
  descripcion: z.string().max(2000).optional().nullable(),
});

/**
 * Schema para crear una tarea asociada a un Contact
 */
export const ContactTaskSchema = z.object({
  tipo: z.string().min(1, 'Tipo requerido').max(100),
  titulo: z.string().min(1, 'Título requerido').max(500),
  descripcion: z.string().max(5000).optional().nullable(),
  fechaVencimiento: CommonSchemas.fechaISO,
  asignadoA: CommonSchemas.id.optional().nullable(),
});

/**
 * Schema para importar contactos
 */
export const ContactImportSchema = z.object({
  contacts: z.array(z.object({
    nombre: z.string().min(1),
    email: z.string().email(),
    telefono: z.string().optional().nullable(),
    tipo: z.enum(['person', 'company']).optional().default('person'),
    empresa: z.string().optional().nullable(),
    cargo: z.string().optional().nullable(),
    tags: z.string().optional().nullable(),
  })).min(1, 'Al menos un contacto requerido').max(500, 'Máximo 500 contactos por importación'),
});
