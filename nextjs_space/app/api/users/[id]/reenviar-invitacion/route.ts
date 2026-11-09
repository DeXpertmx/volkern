export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { hasPermission, logAuditAction } from '@/lib/permissions';
import { enviarEmailInvitacion } from '@/lib/emails/invitacion';
import crypto from 'crypto';

/**
 * POST /api/users/[id]/reenviar-invitacion
 *
 * Reenvía el email de invitación a un usuario en estado `invitado`: renueva
 * el token y su expiración (14 días) y vuelve a mandar el correo. Cubre tanto
 * el caso «no llegó el email» como «expiró el enlace». No cambia el rol ni
 * ningún otro dato.
 */
export async function POST(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { role: true },
    });
    if (!currentUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    if (!hasPermission(currentUser as any, 'equipo', 'invitar')) {
      return NextResponse.json({ error: 'Sin permiso para invitar usuarios' }, { status: 403 });
    }

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }
    if (target.tenantId !== currentUser.tenantId) {
      return NextResponse.json({ error: 'El usuario no pertenece a esta cuenta' }, { status: 403 });
    }
    if (target.estado === 'activo') {
      return NextResponse.json(
        { error: 'El usuario ya está activo: no hay invitación pendiente' },
        { status: 400 }
      );
    }

    const invitador = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { name: true, email: true },
    });
    const tenant = await prisma.tenant.findUnique({
      where: { id: currentUser.tenantId || target.tenantId || '' },
      select: { nombre: true },
    });

    const nuevoToken = crypto.randomBytes(24).toString('hex');
    const expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: target.id },
      data: { tokenInvitacion: nuevoToken, tokenInvitacionExpiry: expiry, fechaInvitacion: new Date() },
    });

    const resultado = await enviarEmailInvitacion({
      email: target.email,
      nombre: target.name || '',
      token: nuevoToken,
      tenantNombre: tenant?.nombre || 'tu cuenta',
      invitadorNombre: invitador?.name || invitador?.email || 'El administrador',
    });

    if (currentUser.tenantId) {
      await logAuditAction(
        currentUser.id,
        currentUser.tenantId,
        'reenviar_invitacion',
        'usuario',
        target.id,
        `${currentUser.name} reenvió la invitación a ${target.email}`
      );
    }

    if (!resultado?.success) {
      return NextResponse.json(
        { error: 'No se pudo enviar el email; el enlace quedó renovado. Inténtalo de nuevo.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, reenviada: true });
  } catch (error) {
    console.error('[reenviar-invitacion] Error:', error);
    return NextResponse.json({ error: 'Error al reenviar la invitación' }, { status: 500 });
  }
}
