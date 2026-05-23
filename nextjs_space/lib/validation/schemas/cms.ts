import { z } from 'zod';

// ─────────────────────────────────────────────
// Pages (Web Creator)
// ─────────────────────────────────────────────

/**
 * Schema para crear página (web creator)
 */
export const PageCreateSchema = z.object({
  titulo: z.string().min(1, 'Título requerido').max(255),
  slug: z.string().max(255).optional(),
  descripcion: z.string().max(500).optional(),
  contenido: z.record(z.unknown()).optional().default({ components: [] }),
  tipo: z.enum(['landing', 'web', 'blog', 'product', 'service', 'checkout', 'thankyou', 'custom'])
    .optional().default('landing'),
  plantillaId: z.string().max(100).optional(),
  metaTitulo: z.string().max(255).optional(),
  metaDescripcion: z.string().max(500).optional(),
  metaImagen: z.string().max(500).optional(),
  configuracionBranding: z.record(z.unknown()).optional(),
  servicioId: z.string().optional(),
  cursoId: z.string().optional(),
});

export type PageCreateInput = z.infer<typeof PageCreateSchema>;

/**
 * Schema para actualizar página (web creator)
 */
export const PageUpdateSchema = z.object({
  titulo: z.string().min(1).max(255).optional(),
  slug: z.string().max(255).optional(),
  descripcion: z.string().max(500).optional(),
  contenido: z.record(z.unknown()).optional(),
  tipo: z.enum(['landing', 'web', 'blog', 'product', 'service', 'checkout', 'thankyou', 'custom']).optional(),
  estado: z.enum(['draft', 'published', 'archived']).optional(),
  metaTitulo: z.string().max(255).optional(),
  metaDescripcion: z.string().max(500).optional(),
  metaImagen: z.string().max(500).optional().nullable(),
  metaKeywords: z.string().max(500).optional(),
  configuracionBranding: z.record(z.unknown()).optional(),
  cssPersonalizado: z.string().optional(),
  scriptsHead: z.string().optional(),
  scriptsBody: z.string().optional(),
  configuracionResponsive: z.record(z.unknown()).optional(),
  servicioId: z.string().optional().nullable(),
  cursoId: z.string().optional().nullable(),
});

export type PageUpdateInput = z.infer<typeof PageUpdateSchema>;

/**
 * Schema para publicar página
 */
export const PagePublishSchema = z.object({
  subdominio: z.string()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Subdominio inválido')
    .max(63)
    .optional(),
  dominioPersonalizado: z.string().max(255).optional(),
  generarEmbed: z.boolean().optional(),
});

export type PagePublishInput = z.infer<typeof PagePublishSchema>;

// ─────────────────────────────────────────────
// CMS Pages (Puck Editor)
// ─────────────────────────────────────────────

/**
 * Schema para crear página CMS (Puck)
 */
export const CmsPageCreateSchema = z.object({
  titulo: z.string().min(1, 'Título requerido').max(255),
  slug: z.string().max(255).optional(),
  tipo: z.string().optional().default('landing'),
  contenido: z.record(z.unknown()).optional(),
  global: z.boolean().optional(),
  template: z.string().optional(),
});

export type CmsPageCreateInput = z.infer<typeof CmsPageCreateSchema>;

/**
 * Schema para actualizar página CMS (Puck)
 */
export const CmsPageUpdateSchema = z.object({
  titulo: z.string().min(1).max(255).optional(),
  contenido: z.record(z.unknown()).optional(),
  estado: z.enum(['draft', 'published', 'archived']).optional(),
  cssPersonalizado: z.string().optional(),
  metaTitulo: z.string().max(255).optional(),
  metaDescripcion: z.string().max(500).optional(),
  metaImagen: z.string().max(500).optional(),
  metaKeywords: z.string().max(500).optional(),
  scriptsHead: z.string().optional(),
  scriptsBody: z.string().optional(),
});

export type CmsPageUpdateInput = z.infer<typeof CmsPageUpdateSchema>;

/**
 * Schema para AI suggest en CMS
 */
export const AiSuggestSchema = z.object({
  prompt: z.string().min(1, 'Prompt requerido'),
  context: z.string().optional(),
  componentType: z.enum(['Hero', 'Features', 'FAQ', 'Testimonial', 'Pricing', 'Heading', 'Text']).optional(),
});

export type AiSuggestInput = z.infer<typeof AiSuggestSchema>;

// ─────────────────────────────────────────────
// CMS Templates (Email & Document)
// ─────────────────────────────────────────────

/**
 * Schema para crear/actualizar plantilla CMS
 */
export const CmsTemplateSchema = z.object({
  type: z.enum(['email', 'document']),
  nombre: z.string().max(255).optional(),
  projectData: z.record(z.unknown()).optional(),
  html: z.string().optional(),
  css: z.string().optional(),
  id: z.string().optional(),
  category: z.string().max(100).optional(),
});

export type CmsTemplateInput = z.infer<typeof CmsTemplateSchema>;

// ─────────────────────────────────────────────
// Knowledge
// ─────────────────────────────────────────────

/**
 * Schema para crear artículo de knowledge
 */
export const KnowledgeCreateSchema = z.object({
  title: z.string().min(1, 'Título requerido').max(500),
  content: z.string().min(1, 'Contenido requerido'),
  category: z.string().max(100).optional().default('SOP'),
  tags: z.array(z.string().max(100)).optional(),
  isPublic: z.boolean().optional(),
});

export type KnowledgeCreateInput = z.infer<typeof KnowledgeCreateSchema>;

/**
 * Schema para actualizar artículo de knowledge
 */
export const KnowledgeUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(100)).optional(),
  isPublic: z.boolean().optional(),
}).passthrough(); // Allow extra fields for Prisma update

export type KnowledgeUpdateInput = z.infer<typeof KnowledgeUpdateSchema>;
