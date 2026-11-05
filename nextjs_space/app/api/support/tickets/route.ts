export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import { SupportService } from '@/lib/support/support-service';
import { GemmaSupportService } from '@/lib/support/gemma-support-service';
import { AdoptionTelemetry } from '@/lib/telemetry/adoption-kpis';

/**
 * GET /api/support/tickets - Listar tickets del tenant
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    
    // Telemetry
    AdoptionTelemetry.trackHubView(tenantId, auth.user!.id, 'SUPPORT').catch(() => {});

    const tickets = await prisma.supportTicket.findMany({
      where: {
        tenantId,
        status: (status || undefined) as any,
        priority: (priority || undefined) as any
      },
      include: {
        creator: { select: { name: true, email: true } },
        assignee: { select: { name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(tickets);
  } catch (error) {
    console.error('[SupportAPI] Error listing tickets:', error);
    return NextResponse.json({ error: 'Error al listar tickets' }, { status: 500 });
  }
}, ['support:read']);

/**
 * POST /api/support/tickets - Crear un nuevo ticket
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const body = await request.json();

    if (!body.subject || !body.description) {
      return NextResponse.json({ error: 'Asunto y descripción son obligatorios' }, { status: 400 });
    }

    const ticket = await SupportService.createTicket({
      tenantId,
      creatorId: userId,
      subject: body.subject,
      description: body.description,
      priority: body.priority,
      source: body.source,
      channelId: body.channelId,
      entityType: body.entityType,
      entityId: body.entityId
    });

    // Triage automático en segundo plano (no bloquea el response)
    GemmaSupportService.triageTicket(ticket.id, tenantId).catch(console.error);

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('[SupportAPI] Error creating ticket:', error);
    return NextResponse.json({ error: 'Error al crear ticket' }, { status: 500 });
  }
}, ['support:write']);
