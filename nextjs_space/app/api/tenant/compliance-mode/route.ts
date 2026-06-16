import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ComplianceGate } from '@/lib/compliance-gate';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tenant/compliance-mode
 * Obtiene el modo actual de compliance del tenant
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true, role: { select: { nombre: true } } },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const mode = await ComplianceGate.getMode(user.tenantId);

    return NextResponse.json({
      success: true,
      mode,
      canToggle: user.role?.nombre === 'Admin' || user.role?.nombre === 'Superadmin',
    });
  } catch (error) {
    console.error('[API] Error getting compliance mode:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

/**
 * PATCH /api/tenant/compliance-mode
 * Cambia el modo de compliance del tenant
 * Solo Admin/Superadmin pueden cambiar el modo
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true, role: { select: { nombre: true } } },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    // Solo Admin/Superadmin pueden cambiar el modo
    const roleName = user.role?.nombre || '';
    if (roleName !== 'Admin' && roleName !== 'Superadmin' && roleName !== 'Administrador') {
      return NextResponse.json({
        error: 'Solo los administradores pueden cambiar el modo de compliance',
      }, { status: 403 });
    }

    const body = await req.json();
    const { mode, justification } = body;

    if (!mode || !['normal', 'compliance'].includes(mode)) {
      return NextResponse.json({ error: 'Modo inválido. Use "normal" o "compliance"' }, { status: 400 });
    }

    if (!justification || justification.trim().length < 10) {
      return NextResponse.json({
        error: 'Debes proporcionar una justificación de al menos 10 caracteres',
      }, { status: 400 });
    }

    const result = await ComplianceGate.setMode(
      user.tenantId,
      user.id,
      mode as 'normal' | 'compliance',
      justification
    );

    return NextResponse.json({
      success: true,
      mode: result.mode,
      message: mode === 'compliance'
        ? '🔒 Modo Compliance activado. Los procesos obligatorios están ahora activos.'
        : '🔓 Modo Normal activado. El sistema opera sin restricciones de compliance.',
    });
  } catch (error: any) {
    console.error('[API] Error changing compliance mode:', error);
    return NextResponse.json({
      error: error.message || 'Error al cambiar modo de compliance',
    }, { status: 500 });
  }
}
