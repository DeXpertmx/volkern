/**
 * lib/auth-helpers.ts
 * Helper para verificar si una petición proviene de un Superadmin/Administrador
 * usando la sesión NextAuth. Usado por las rutas de auditoría y backoffice.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export interface AdminAuthResult {
  ok: boolean;
  error?: string;
  email?: string;
  userId?: string;
}

export async function isAdminRequest(request: Request): Promise<AdminAuthResult> {
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
    if (roleName !== 'Superadmin' && roleName !== 'Administrador' && roleName !== 'Admin') {
      return { ok: false, error: 'Acceso denegado: requiere rol de Superadmin o Administrador' };
    }

    return { ok: true, email: user.email ?? undefined, userId: user.id };
  } catch (error: any) {
    return { ok: false, error: `Error de autenticación: ${error.message}` };
  }
}
