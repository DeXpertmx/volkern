export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import { callGemma } from '@/lib/ai/gemma-client';
import { GEMMA_SLA_SYSTEM_PROMPT, getGemmaSLAPrompt } from '@/lib/support/gemma-sla-prompts';

export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id } = params;
    const tenantId = auth.tenant!.id;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id, tenantId },
      include: { creator: true }
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 });
    }

    // Llamar a Gemma Copilot
    const gemmaResponse = await callGemma([
      { role: 'system', content: GEMMA_SLA_SYSTEM_PROMPT },
      { role: 'user', content: getGemmaSLAPrompt({
        tenantId,
        eventType: 'RESOLUTION_COILOT',
        ticketId: id,
        timestamp: new Date().toISOString(),
        contextSnapshot: {
          ticket: {
            subject: ticket.subject,
            description: ticket.description,
            entityType: ticket.entityType,
            entityId: ticket.entityId
          }
        },
        policy: { allowed_actions: ['apply_fix'], critical: ticket.priority === 'CRITICAL' }
      }) }
    ]);

    if (gemmaResponse.content) {
      const cleanContent = gemmaResponse.content.replace(/```json|```/g, '').trim();
      const suggestion = JSON.parse(cleanContent);

      // Registrar la sugerencia en el timeline
      await prisma.ticketTimeline.create({
        data: {
          ticketId: id,
          actorType: 'GEMMA',
          action: 'RESOLUTION_SUGGESTION',
          note: `SUGERENCIA DE GEMMA: ${suggestion.message}`,
          metadata: suggestion
        }
      });

      return NextResponse.json(suggestion);
    }

    return NextResponse.json({ error: 'Gemma no pudo generar una sugerencia' }, { status: 500 });
  } catch (error) {
    console.error('[SupportAIHelp] Error:', error);
    return NextResponse.json({ error: 'Error al consultar a Gemma' }, { status: 500 });
  }
}, ['support:write']);
