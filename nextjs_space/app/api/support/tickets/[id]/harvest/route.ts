export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import { KnowledgeService } from '@/lib/knowledge/knowledge-service';

/**
 * POST /api/support/tickets/[id]/harvest - Convertir resolución en artículo de conocimiento
 */
export const POST = withTenantAuth(async (request, auth, context) => {
  try {
    const { id } = await context.params;
    const tenantId = auth.tenant!.id;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id, tenantId },
      include: { timeline: true }
    });

    if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 });

    // 1. Extraer la "sabiduría" de la resolución
    const resolutionNotes = ticket.timeline
      .filter(t => t.action === 'STATUS_CHANGE' && (t.metadata as any)?.newStatus === 'RESOLVED')
      .map(t => t.note)
      .join('\n');

    const content = `
      PROBLEMA: ${ticket.subject}
      
      DESCRIPCIÓN ORIGINAL:
      ${ticket.description}
      
      RESOLUCIÓN APLICADA:
      ${resolutionNotes || 'Ver timeline del ticket para detalles técnicos.'}
    `;

    // 2. Crear el artículo usando el servicio (con asistencia de Gemma)
    const article = await KnowledgeService.createArticle(tenantId, {
      title: `SOP: Resolución de ${ticket.subject}`,
      content,
      category: 'TECHNICAL',
      tags: ['TASKFORCE_HARVEST', ticket.priority],
      authorId: auth.user!.id
    });

    // 3. Marcar el ticket como cosechado (Opcional, agregamos una nota)
    await prisma.ticketTimeline.create({
      data: {
        ticketId: id,
        actorId: auth.user!.id,
        action: 'KNOWLEDGE_HARVEST',
        note: `Resolución convertida en artículo de conocimiento: ${article.id}`
      }
    });

    return NextResponse.json(article);
  } catch (error: any) {
    console.error('[HarvestAPI] Error:', error);
    return NextResponse.json({ error: 'Error al cosechar conocimiento' }, { status: 500 });
  }
}, ['knowledge:write', 'erp:read']);
