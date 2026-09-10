export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { HOSPITALITY_TRIGGERS, HOSPITALITY_ACTION_TYPES } from '../route';

/** PATCH /api/hospitality/automatizaciones/[id] — editar/activar/desactivar. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { id } = await params;
    const tenantId = auth.tenant!.id;

    const existente = await prisma.automationRule.findFirst({
      where: { id, tenantId, triggerType: { in: HOSPITALITY_TRIGGERS } },
    });
    if (!existente) {
      return NextResponse.json({ error: 'Automatización no encontrada en este tenant' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, description, triggerType, conditions, actions, isActive } = body;

    if (triggerType !== undefined && !HOSPITALITY_TRIGGERS.includes(triggerType)) {
      return NextResponse.json({ error: 'triggerType inválido. Debe ser un trigger de Hospitality' }, { status: 400 });
    }
    if (actions !== undefined) {
      if (!Array.isArray(actions) || actions.length === 0) {
        return NextResponse.json({ error: 'actions debe ser un arreglo no vacío' }, { status: 400 });
      }
      for (const a of actions) {
        if (!a?.type || !HOSPITALITY_ACTION_TYPES.includes(a.type)) {
          return NextResponse.json({ error: 'acción inválida' }, { status: 400 });
        }
      }
    }

    const rule = await prisma.automationRule.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description: description ? String(description).trim() : null } : {}),
        ...(triggerType !== undefined ? { triggerType } : {}),
        ...(conditions !== undefined ? { conditions: conditions && typeof conditions === 'object' ? conditions : {} } : {}),
        ...(actions !== undefined ? { actions } : {}),
        ...(isActive !== undefined ? { isActive: !!isActive } : {}),
      },
    });

    return NextResponse.json({ regla: rule });
  } catch (error) {
    console.error('Error actualizando automatización de Hospitality:', error);
    return NextResponse.json({ error: 'Error al actualizar la automatización' }, { status: 500 });
  }
}

/** DELETE /api/hospitality/automatizaciones/[id] — eliminar una regla del tenant. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { id } = await params;
    const tenantId = auth.tenant!.id;

    const existente = await prisma.automationRule.findFirst({
      where: { id, tenantId, triggerType: { in: HOSPITALITY_TRIGGERS } },
    });
    if (!existente) {
      return NextResponse.json({ error: 'Automatización no encontrada en este tenant' }, { status: 404 });
    }

    await prisma.automationRule.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error eliminando automatización de Hospitality:', error);
    return NextResponse.json({ error: 'Error al eliminar la automatización' }, { status: 500 });
  }
}