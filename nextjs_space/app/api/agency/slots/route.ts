export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

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
    const { client_name, admin_email, modules_enabled } = await req.json();

    if (!client_name || !admin_email) {
      return NextResponse.json({ error: 'Nombre de cliente y email de admin son requeridos' }, { status: 400 });
    }

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
        enabledModules: modules_enabled || ['CRM'],
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
