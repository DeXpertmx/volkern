export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { SlotManager, type SlotType } from '@/lib/slot-manager';
import { z } from 'zod';

// ─── Validation ──────────────────────────────────────────────────────────────

const SlotCreateSchema = z.object({
  client_name: z.string().min(1, 'Nombre de cliente requerido'),
  admin_email: z.string().email('Email de admin inválido'),
  modules_enabled: z.array(z.string()).optional(),
  accounting_plan_type: z.enum(['NORMAL', 'PYMES', 'MICRO']).optional().default('NORMAL'),
  sector: z.string().optional().default('NINGUNO'),
});

const ALLOWED_ACCOUNT_TYPES = ['AGENCY'];

// ─── GET /api/slots ──────────────────────────────────────────────────────────
// Lista todos los slots (hijos) del tenant actual
// Query params:
//   ?type=agency     → solo slots AGENCY_SLOT
//   ?type=accounting → solo slots ACCOUNTING_SLOT
//   (sin type)       → todos los slots

export const GET = withTenantAuth(async (req, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';

  if (!ALLOWED_ACCOUNT_TYPES.includes(auth.user?.accountType || '') && !isSuperadmin) {
    return NextResponse.json(
      { error: 'Solo disponible para cuentas de Agencia o Administradores' },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type') as 'agency' | 'accounting' | null;

  const slots = await SlotManager.listSlots(auth.tenant!.id, type || undefined);
  return NextResponse.json(slots);
}, ['team:read']);

// ─── POST /api/slots ─────────────────────────────────────────────────────────
// Crea un nuevo slot (tenant hijo)

export const POST = withTenantAuth(async (req, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';

  if (!ALLOWED_ACCOUNT_TYPES.includes(auth.user?.accountType || '') && !isSuperadmin) {
    return NextResponse.json(
      { error: 'Solo disponible para cuentas de Agencia o Administradores' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const validation = SlotCreateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos del slot inválidos', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { client_name, admin_email, modules_enabled, accounting_plan_type, sector } = validation.data;

    // Determinar el tipo de slot según el plan del padre
    const parentPlan = auth.tenant?.plan || '';
    const slotType: SlotType = parentPlan.includes('accounting') || parentPlan.includes('contable')
      ? 'accounting'
      : 'agency';

    const newSlot = await SlotManager.createSlot(auth.tenant!.id, slotType, {
      clientName: client_name,
      adminEmail: admin_email,
      modulesEnabled: modules_enabled,
      accountingPlanType: accounting_plan_type,
      sector: sector as any,
    });

    return NextResponse.json(newSlot, { status: 201 });
  } catch (error: any) {
    console.error('[Slots API] Error al crear slot:', error);
    const message = error.message || 'Error al crear el slot';
    const status = error.message?.includes('Límite') || error.message?.includes('alcanzado') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}, ['team:write']);
