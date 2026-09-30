export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logAuditAction } from '@/lib/permissions';

/**
 * POST /api/auth/aceptar-invitacion
 * Body: { token, password }
 *
 * Cierra el circuito del alta de miembros del equipo: el invitado fija su
 * contraseña con el token que recibió por email. Válido 14 días (ver
 * User.tokenInvitacionExpiry); una sola vez.
 */
export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Token y contraseña son requeridos' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: {
        tokenInvitacion: token,
        // Sin expiry (alta anterior a la migración) se tolera; con expiry,
        // debe estar vigente.
        OR: [{ tokenInvitacionExpiry: null }, { tokenInvitacionExpiry: { gt: new Date() } }],
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Invitación inválida o expirada' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        tokenInvitacion: null,
        tokenInvitacionExpiry: null,
        estado: 'activo',
        emailVerified: new Date(),
      },
    });

    if (user.tenantId) {
      await logAuditAction(
        user.id,
        user.tenantId,
        'aceptar_invitacion',
        'usuario',
        user.id,
        `${user.email} aceptó su invitación y activó su cuenta`
      );
    }

    return NextResponse.json({ success: true, email: user.email });
  } catch (error) {
    console.error('[aceptar-invitacion] Error:', error);
    return NextResponse.json({ error: 'Error al aceptar la invitación' }, { status: 500 });
  }
}
