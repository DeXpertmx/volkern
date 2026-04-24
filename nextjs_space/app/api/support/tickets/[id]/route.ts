import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import { SupportService, TicketStatus } from '@/lib/support/support-service';

/**
 * GET /api/support/tickets/[id] - Obtener detalle de un ticket
 */
export const GET = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id } = params;
    const tenantId = auth.tenant!.id;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id, tenantId },
      include: {
        creator: { select: { name: true, email: true } },
        assignee: { select: { name: true, email: true } },
        timeline: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 });
    }

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('[SupportAPI] Error fetching ticket:', error);
    return NextResponse.json({ error: 'Error al obtener ticket' }, { status: 500 });
  }
});

/**
 * PATCH /api/support/tickets/[id] - Actualizar estado o asignación
 */
export const PATCH = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id } = params;
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const body = await request.json();

    let result;

    if (body.status) {
      result = await SupportService.updateStatus(id, tenantId, userId, body.status as TicketStatus, body.note);
    } else if (body.assignedId) {
      result = await SupportService.assignTicket(id, tenantId, userId, body.assignedId);
    } else {
      return NextResponse.json({ error: 'Faltan parámetros de actualización' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[SupportAPI] Error updating ticket:', error);
    return NextResponse.json({ error: 'Error al actualizar ticket' }, { status: 500 });
  }
});
