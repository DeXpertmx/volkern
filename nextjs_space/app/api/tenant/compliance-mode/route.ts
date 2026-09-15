import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ComplianceGate } from '@/lib/compliance-gate';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';

/**
 * Cambiar el modo de compliance es administrar la cuenta, no un privilegio del
 * nombre. Se resuelve con el permiso `configuracion.gestionar`: el mismo que
 * usa el resto de la configuración del tenant. Superadmin pasa por su bypass
 * (es la única excepción del sistema y vive en `permissions-core`).
 */
function puedeCambiarModo(user: unknown): boolean {
  return hasPermission(user as never, 'configuracion', 'gestionar');
}

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
      select: { tenantId: true, role: { select: { nombre: true, permisos: true } } },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const mode = await ComplianceGate.getMode(user.tenantId);

    return NextResponse.json({
      success: true,
      mode,
      // Lo decide el permiso, no el nombre del rol: un rol que se llame igual
      // pero no tenga la llave no puede, y uno que tenga la llave sí.
      canToggle: puedeCambiarModo(user),
    });
  } catch (error) {
    console.error('[API] Error getting compliance mode:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

/**
 * PATCH /api/tenant/compliance-mode
 * Cambia el modo de compliance del tenant.
 * Lo puede cambiar quien administra la cuenta (`configuracion.gestionar`).
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true, role: { select: { nombre: true, permisos: true } } },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    // Antes se concedía por nombre —«Admin», «Administrador»—, que es una
    // etiqueta que el cliente puede renombrar. Ahora lo decide el permiso, y el
    // error nombra la llave exacta que falta para poder concederla sin adivinar.
    if (!puedeCambiarModo(user)) {
      return NextResponse.json(
        {
          error: 'Solo quien administra la configuración de la cuenta puede cambiar el modo de compliance',
          permisoRequerido: 'configuracion.gestionar',
        },
        { status: 403 }
      );
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
