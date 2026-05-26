export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { AgencySlotCreateSchema } from '@/lib/validation/schemas/misc';

/**
 * GET /api/agency/slots
 * Lista todos los sub-tenants gestionados por la agencia
 */
export const GET = withTenantAuth(async (req, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
  if (auth.user?.accountType !== 'AGENCY' && !isSuperadmin) {
    return NextResponse.json({ error: 'Solo disponible para cuentas de Agencia o Administradores' }, { status: 403 });
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
 * POST /api/agency/slots
 * Provee un nuevo slot de cliente
 */
export const POST = withTenantAuth(async (req, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
  if (auth.user?.accountType !== 'AGENCY' && !isSuperadmin) {
    return NextResponse.json({ error: 'Solo disponible para cuentas de Agencia o Administradores' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const validation = AgencySlotCreateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        error: 'Datos del slot inválidos',
        details: validation.error.format()
      }, { status: 400 });
    }

    const { client_name, admin_email, modules_enabled } = validation.data;

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
        error: `Límite de slots alcanzado (${agency?.maxSlots}). Contacta a soporte para ampliar.` 
      }, { status: 403 });
    }

    // 2. Crear el Tenant Hijo
    const slug = client_name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // NOTA: En un entorno real, aquí se orquestaría la creación de la DB secundaria si aplica.
    // Por ahora, usaremos la misma DB (Shared Schema logic) o asignaremos una URL si está en el body.
    
    const newSlot = await prisma.tenant.create({
      data: {
        nombre: client_name,
        slug: `${slug}-${Math.random().toString(36).substring(7)}`,
        accountType: 'BUSINESS',
        parentId: auth.tenant!.id,
        billingEmail: admin_email,
        brandingConfig: agency?.brandingConfig || {}, // Hereda branding inicial
        enabledModules: normalizedModules,
        plan: 'agency-slot',
        estado: 'activo'
      }
    });

    // 3. Crear el usuario administrador del Slot
    // Aquí podrías enviar un email de invitación
    console.log(`[Agency] Slot '${client_name}' creado por agencia ${auth.tenant!.nombre}`);

    return NextResponse.json(newSlot, { status: 201 });

  } catch (error: any) {
    console.error('[Agency Slots] Error al crear slot:', error);
    return NextResponse.json({ error: 'Error al crear el slot del cliente' }, { status: 500 });
  }
});
