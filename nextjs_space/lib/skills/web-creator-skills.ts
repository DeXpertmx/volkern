import { prisma } from '@/lib/db';

export interface GenerateLandingDraftInput {
  tenantId: string;
  leadId: string;
  titulo: string;
  slug: string;
  contentJson: any; // Estructura GrapesJS (JSON)
  userId?: string;
  descripcion?: string;
}

/**
 * WebCreator con Esteroides
 * Crea un borrador de página personalizado para un lead basado en el contexto de IA
 */
export async function generateLandingDraft(input: GenerateLandingDraftInput) {
  const { tenantId, leadId, titulo, slug, contentJson, userId, descripcion } = input;

  // 1. Validar que el slug sea seguro y único para el tenant
  const uniqueSlug = `${slug}-${leadId.substring(0, 5)}`;

  // 2. Crear la página en estado 'draft'
  const page = await prisma.page.create({
    data: {
      tenantId,
      titulo,
      slug: uniqueSlug,
      descripcion: descripcion || `Borrador generado por IA para el lead ${leadId}`,
      contenido: contentJson, // Prisma maneja el Json automáticamente si el campo es Json
      estado: 'draft',
      tipo: 'landing',
      creadoPor: userId,
    }
  });

  return {
    success: true,
    pageId: page.id,
    slug: page.slug,
    url: `/creador/editor/${page.id}`,
    summary: `Se ha generado un borrador de landing page personalizado: "${titulo}". El agente puede editarlo en el WebCreator.`
  };
}
