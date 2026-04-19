import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

/**
 * POST /api/admin/impersonate
 * Permite a un Superadmin suplantar la identidad de un Tenant
 * Body: { tenantId: string | null, action: 'start' | 'stop' }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // 1. Validar que el usuario esté autenticado
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2. Validar que el usuario sea Superadmin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { 
        role: true,
        tenant: { select: { id: true, accountType: true } }
      }
    });

    const isSuperadmin = user?.role?.nombre === 'Superadmin';
    const isAgency = user?.tenant?.accountType === 'AGENCY';

    if (!isSuperadmin && !isAgency) {
      return NextResponse.json({ error: 'Prohibido: Se requiere rol Superadmin o cuenta de Agencia' }, { status: 403 });
    }

    const body = await req.json();
    const { tenantId, action } = body;

    const cookieStore = cookies();

    if (action === 'stop') {
      // Eliminar cookie de suplantación
      cookieStore.delete('volkern_impersonate_id');
      return NextResponse.json({ message: 'Suplantación finalizada' });
    }

    if (action === 'start') {
      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId es requerido para iniciar suplantación' }, { status: 400 });
      }

      // Validar que el tenant existe
      const targetTenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, nombre: true, parentId: true }
      });

      if (!targetTenant) {
        return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
      }

      // Validar permisos de la agencia
      if (isAgency && targetTenant.parentId !== user?.tenant?.id) {
        return NextResponse.json({ error: 'Este tenant no pertenece a tu agencia' }, { status: 403 });
      }

      // Establecer cookie segura (HttpOnly por defecto en Next.js cookies())
      // La duracion es corta para evitar suplantaciones olvidadas (p.ej. 2 horas)
      cookieStore.set('volkern_impersonate_id', tenantId, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 2 // 2 horas
      });

      console.log(`[Impersonate] Superadmin ${user.email} iniciando suplantación de ${targetTenant.nombre}`);

      return NextResponse.json({ 
        message: `Ahora suplantando a ${targetTenant.nombre}`,
        tenant: targetTenant
      });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  } catch (error) {
    console.error('[Admin Impersonate] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

/**
 * GET /api/admin/impersonate
 * Obtiene el estado actual de la suplantación
 */
export async function GET() {
  const cookieStore = cookies();
  const impersonatedId = cookieStore.get('volkern_impersonate_id')?.value;

  if (!impersonatedId) {
    return NextResponse.json({ active: false });
  }

  const user = await prisma.user.findUnique({
    where: { id: (session?.user as any).id },
    include: { tenant: { select: { id: true, accountType: true } } }
  });

  if ((session?.user as any)?.roleName === 'Superadmin' || user?.tenant?.accountType === 'AGENCY') {
    const tenant = await prisma.tenant.findUnique({
      where: { id: impersonatedId },
      select: { id: true, nombre: true, slug: true, parentId: true }
    });
    
    // Si es Agencia, verificar que el tenant suplantado sea su hijo
    if (user?.tenant?.accountType === 'AGENCY' && tenant?.parentId !== user.tenant.id) {
      return NextResponse.json({ active: false });
    }

    console.log(`[DEBUG-Impersonate-GET] Returning active: true for ${tenant?.nombre}`);
    return NextResponse.json({ active: true, tenant });
  }

  console.log(`[DEBUG-Impersonate-GET] Returning active: false (Not Superadmin)`);
  return NextResponse.json({ active: false });
}
