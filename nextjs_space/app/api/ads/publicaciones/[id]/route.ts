export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { AdPublicationUpdateSchema } from '@/lib/validation/schemas/ads';
import { isValidTransition } from '../route';

export const GET = withTenantAuth(async (_req, auth, { params }: any) => {
  try {
    const { id } = params;
    const pub = await prisma.adsCampaignPublication.findUnique({
      where: { id },
      include: {
        creative: true,
        campaign: { select: { id: true, name: true, externalId: true } },
        socialPost: { select: { id: true, content: true, publishedAt: true, platforms: true } },
        schedules: { orderBy: { scheduledFor: 'asc' } },
      },
    });
    if (!pub || pub.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }
    return NextResponse.json({ data: pub });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

export const PATCH = withTenantAuth(async (req, auth, { params }: any) => {
  try {
    const { id } = params;
    const existing = await prisma.adsCampaignPublication.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }

    const raw = await req.json();
    const body = validateBody(AdPublicationUpdateSchema, raw);
    if (body instanceof Response) return body;

    if (body.estado && !isValidTransition(existing.estado, body.estado)) {
      return NextResponse.json(
        { error: `Transición de estado inválida: ${existing.estado} → ${body.estado}` },
        { status: 409 },
      );
    }

    const updated = await prisma.adsCampaignPublication.update({
      where: { id },
      data: {
        ...(body.nombre !== undefined && { nombre: body.nombre }),
        ...(body.scheduledFor !== undefined && {
          scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
        }),
        ...(body.campaignId !== undefined && { campaignId: body.campaignId }),
        ...(body.budgetDaily !== undefined && { budgetDaily: body.budgetDaily }),
        ...(body.budgetTotal !== undefined && { budgetTotal: body.budgetTotal }),
        ...(body.estado !== undefined && { estado: body.estado }),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

// DELETE: solo BORRADOR puede borrarse de la BD. PUBLICADA -> pausar + archivar en estado.
export const DELETE = withTenantAuth(async (_req, auth, { params }: any) => {
  try {
    const { id } = params;
    const existing = await prisma.adsCampaignPublication.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }

    if (existing.estado === 'BORRADOR') {
      await prisma.adsCampaignPublication.delete({ where: { id } });
      return NextResponse.json({ success: true, deleted: true });
    }

    if (existing.estado === 'PUBLICADA' || existing.estado === 'PAUSADA' || existing.estado === 'PROGRAMADA') {
      // Soft-delete: marcar como BORRADOR con errorMessage indicando archivado.
      // No borramos la fila para preservar métricas y auditoría.
      await prisma.adsCampaignPublication.update({
        where: { id },
        data: { estado: 'BORRADOR', errorMessage: 'Archivado por el usuario. Métricas preservadas.' },
      });
      return NextResponse.json({ success: true, archived: true });
    }

    return NextResponse.json(
      { error: `No se puede eliminar una publicación en estado ${existing.estado}` },
      { status: 409 },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
