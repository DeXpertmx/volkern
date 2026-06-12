export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { AccountingSlotCreateSchema } from '@/lib/validation/schemas/misc';
import { AccountingInitializer } from '@/lib/accounting/initializer';

/**
 * GET /api/accounting/slots
 * Lista todos los clientes gestionados por el despacho contable
 */
export const GET = withTenantAuth(async (req, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
  if (auth.user?.accountType !== 'AGENCY' && !isSuperadmin) {
    return NextResponse.json({ error: 'Solo disponible para cuentas de Asesoría o Administradores' }, { status: 403 });
  }

  const slots = await prisma.tenant.findMany({
    where: { parentId: auth.tenant!.id },
    select: {
      id: true,
      nombre: true,
      slug: true,
      plan: true,
      estado: true,
      fechaCreacion: true,
      dbUrl: true,
      enabledModules: true,
      _count: {
        select: {
          leads: true,
          users: true
        }
      }
    }
  });

  return NextResponse.json(slots);
});

/**
 * POST /api/accounting/slots
 * Provee un nuevo slot de cliente contable
 * Nota: showPoweredBy siempre se fuerza a true en el branding heredado
 */
export const POST = withTenantAuth(async (req, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
  if (auth.user?.accountType !== 'AGENCY' && !isSuperadmin) {
    return NextResponse.json({ error: 'Solo disponible para cuentas de Asesoría o Administradores' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const validation = AccountingSlotCreateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        error: 'Datos del slot inválidos',
        details: validation.error.format()
      }, { status: 400 });
    }

    const { client_name, admin_email, modules_enabled, accounting_plan_type, sector } = validation.data;

    // Normalizar nombres de módulos a uppercase
    const normalizedModules = modules_enabled?.map(m => m.toUpperCase()) || ['CRM'];

    // 1. Verificar límite de slots
    const agency = await prisma.tenant.findUnique({
      where: { id: auth.tenant!.id },
      select: { maxSlots: true, brandingConfig: true }
    });

    const currentSlots = await prisma.tenant.count({
      where: { parentId: auth.tenant!.id }
    });

    if (currentSlots >= (agency?.maxSlots || 0)) {
      return NextResponse.json({ 
        error: `Límite de clientes alcanzado (${agency?.maxSlots}). Contacta a soporte para ampliar.` 
      }, { status: 403 });
    }

    // 2. Crear el Tenant Hijo
    const slug = client_name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // Heredar branding PERO forzar showPoweredBy = true
    const inheritedBranding = agency?.brandingConfig 
      ? { ...(agency.brandingConfig as any), showPoweredBy: true }
      : { showPoweredBy: true };

    const effectiveSector = sector === 'NINGUNO' ? null : sector;

    const newSlot = await prisma.tenant.create({
      data: {
        nombre: client_name,
        slug: `${slug}-${Math.random().toString(36).substring(7)}`,
        accountType: 'BUSINESS',
        parentId: auth.tenant!.id,
        billingEmail: admin_email,
        brandingConfig: inheritedBranding, // Hereda branding + showPoweredBy forzado a true
        enabledModules: normalizedModules,
        plan: 'accounting-slot',
        estado: 'activo',
        accountingPlanType: accounting_plan_type,
        sector: effectiveSector,
      }
    });

    await AccountingInitializer.initializeTenant(newSlot.id, accounting_plan_type, sector as any);

    console.log(`[Accounting] Slot '${client_name}' creado por despacho ${auth.tenant!.nombre} (plan: ${accounting_plan_type}, sector: ${sector})`);

    return NextResponse.json(newSlot, { status: 201 });

  } catch (error: any) {
    console.error('[Accounting Slots] Error al crear slot:', error);
    return NextResponse.json({ error: 'Error al crear el slot del cliente' }, { status: 500 });
  }
});
