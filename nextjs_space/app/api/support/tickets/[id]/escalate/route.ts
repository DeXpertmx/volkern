export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/audit-service';

export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id } = params;
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const body = await request.json();

    if (!body.note) {
      return NextResponse.json({ error: 'La nota de escalado es obligatoria' }, { status: 400 });
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Marcar como escalado
      const ticket = await tx.supportTicket.update({
        where: { id, tenantId },
        data: { escalatedTo: 'OWNER' }
      });

      // 2. Registrar en Timeline
      await tx.ticketTimeline.create({
        data: {
          ticketId: id,
          actorId: userId,
          action: 'ESCALATION',
          note: `Ticket escalado manualmente a OWNER. Razón: ${body.note}`,
          metadata: { escalatedBy: userId }
        }
      });

      // 3. Sello de Auditoría (Protocolo de Confianza)
      await AuditService.log({
        tenantId,
        userId,
        action: 'SUPPORT_TICKET_ESCALATE',
        resourceType: 'SupportTicket',
        resourceId: id,
        details: `Escalado manual ejecutado por ${auth.user?.name}. Nota: ${body.note}`
      } as any);

      return NextResponse.json(ticket);
    });
  } catch (error) {
    console.error('[SupportEscalate] Error:', error);
    return NextResponse.json({ error: 'Error al escalar ticket' }, { status: 500 });
  }
}, ['support:write']);
