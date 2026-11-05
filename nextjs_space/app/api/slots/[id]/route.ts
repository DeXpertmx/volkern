export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { SlotManager } from '@/lib/slot-manager';
import { z } from 'zod';

// ─── Validation ──────────────────────────────────────────────────────────────

const SlotUpdateSchema = z.object({
  action: z.enum(['activate', 'deactivate']).optional(),
  nombre: z.string().min(1).optional(),
  admin_email: z.string().email().optional(),
  modules_enabled: z.array(z.string()).optional(),
});

const ALLOWED_ACCOUNT_TYPES = ['AGENCY'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Verifica que el slot pertenezca al tenant actual (sea hijo del padre autenticado)
 */
async function assertSlotOwnership(slotId: string, parentTenantId: string): Promise<{ id: string; nombre: string; estado: string } | null> {
  return prisma.tenant.findFirst({
    where: { id: slotId, parentId: parentTenantId },
    select: { id: true, nombre: true, estado: true },
  });
}

// ─── GET /api/slots/[id] ─────────────────────────────────────────────────────

export const GET = withTenantAuth(async (_req, auth, { params }) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';

  if (!ALLOWED_ACCOUNT_TYPES.includes(auth.user?.accountType || '') && !isSuperadmin) {
    return NextResponse.json(
      { error: 'Solo disponible para cuentas de Agencia o Administradores' },
      { status: 403 }
    );
  }

  const slot = await assertSlotOwnership(params.id, auth.tenant!.id);
  if (!slot) {
    return NextResponse.json(
      { error: 'Slot no encontrado o no pertenece a esta cuenta' },
      { status: 404 }
    );
  }

  const detail = await SlotManager.getSlot(params.id);
  return NextResponse.json(detail);
}, ['team:read']);

// ─── PATCH /api/slots/[id] ───────────────────────────────────────────────────

export const PATCH = withTenantAuth(async (req, auth, { params }) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';

  if (!ALLOWED_ACCOUNT_TYPES.includes(auth.user?.accountType || '') && !isSuperadmin) {
    return NextResponse.json(
      { error: 'Solo disponible para cuentas de Agencia o Administradores' },
      { status: 403 }
    );
  }

  const slot = await assertSlotOwnership(params.id, auth.tenant!.id);
  if (!slot) {
    return NextResponse.json(
      { error: 'Slot no encontrado o no pertenece a esta cuenta' },
      { status: 404 }
    );
  }

  try {
    const body = await req.json();
    const validation = SlotUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { action, nombre, admin_email, modules_enabled } = validation.data;

    // Ejecutar acción (activate/deactivate) si se especifica
    if (action === 'activate') {
      if (slot.estado === 'activo') {
        return NextResponse.json({ message: 'El slot ya está activo' });
      }
      await SlotManager.activateSlot(params.id);
    } else if (action === 'deactivate') {
      if (slot.estado === 'inactivo') {
        return NextResponse.json({ message: 'El slot ya está inactivo' });
      }
      await SlotManager.deactivateSlot(params.id);
    }

    // Actualizar metadata si se proporciona
    if (nombre || admin_email || modules_enabled) {
      await SlotManager.updateSlot(params.id, {
        nombre,
        billingEmail: admin_email,
        enabledModules: modules_enabled,
      });
    }

    // Devolver el slot actualizado
    const updated = await SlotManager.getSlot(params.id);
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[Slots API] Error al actualizar slot:', error);
    return NextResponse.json({ error: 'Error al actualizar el slot' }, { status: 500 });
  }
}, ['team:write']);

// ─── DELETE /api/slots/[id] ──────────────────────────────────────────────────

export const DELETE = withTenantAuth(async (_req, auth, { params }) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';

  if (!ALLOWED_ACCOUNT_TYPES.includes(auth.user?.accountType || '') && !isSuperadmin) {
    return NextResponse.json(
      { error: 'Solo disponible para cuentas de Agencia o Administradores' },
      { status: 403 }
    );
  }

  const slot = await assertSlotOwnership(params.id, auth.tenant!.id);
  if (!slot) {
    return NextResponse.json(
      { error: 'Slot no encontrado o no pertenece a esta cuenta' },
      { status: 404 }
    );
  }

  try {
    await SlotManager.deleteSlot(params.id);
    return NextResponse.json({ success: true, message: `Slot "${slot.nombre}" eliminado correctamente` });
  } catch (error: any) {
    console.error('[Slots API] Error al eliminar slot:', error);
    return NextResponse.json({ error: 'Error al eliminar el slot' }, { status: 500 });
  }
}, ['team:write']);
