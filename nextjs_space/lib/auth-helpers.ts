/**
 * lib/auth-helpers.ts
 * Helper para verificar si una petición proviene de un operador Superadmin de la
 * plataforma usando la sesión NextAuth. Usado por las rutas de auditoría y el
 * backoffice global (/admin/*).
 *
 * IMPORTANTE: solo se acepta el rol 'Superadmin'. Antes también se aceptaban
 * roles con nombre 'Admin'/'Administrador', pero esos roles los crean los
 * propios tenants, así que cualquier usuario de tenant podía leer datos
 * cross-tenant del control plane. Ahora es Superadmin exclusivo.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export interface AdminAuthResult {
  ok: boolean;
  error?: string;
  email?: string;
  userId?: string;
  roleName?: string | null;
}

export async function isAdminRequest(_request: Request): Promise<AdminAuthResult> {
  return isSuperadminRequest();
}

export async function isSuperadminRequest(): Promise<AdminAuthResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { ok: false, error: 'No autenticado' };
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true },
    });

    if (!user) {
      return { ok: false, error: 'Usuario no encontrado' };
    }

    const roleName = user.role?.nombre;
    if (roleName !== 'Superadmin') {
      return { ok: false, error: 'Acceso denegado: requiere rol de Superadmin de la plataforma' };
    }

    return { ok: true, email: user.email ?? undefined, userId: user.id, roleName };
  } catch (error: any) {
    return { ok: false, error: `Error de autenticación: ${error.message}` };
  }
}
