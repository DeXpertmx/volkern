// Aislamiento multi-tenant del módulo Academia.
// Los cursos y estudiantes pertenecen a un tenant; un usuario de sesión solo
// puede ver/editar los de su propio tenant. El superadmin (sin tenantId) no
// tiene filtro y ve todos.

import { prisma } from '@/lib/db';

/**
 * Resuelve el tenantId del usuario de sesión.
 * Devuelve `undefined` si el usuario no existe como user ERP (p. ej. un
 * estudiante del portal /estudiante, que no tiene tenant propio): en ese
 * caso no se aplica filtro de tenant.
 */
export async function getSessionTenantId(email?: string | null): Promise<string | undefined> {
  if (!email) return undefined;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { tenantId: true },
  });
  return user?.tenantId || undefined;
}

/**
 * Filtro de tenant para consultas: `{ tenantId: getSessionTenantId(...) }`.
 * Pasa `undefined` cuando no hay tenant (superadmin o estudiante del portal),
 * lo que en Prisma significa "sin filtro".
 */
export function tenantWhere(tenantId: string | undefined): { tenantId?: string } {
  return tenantId ? { tenantId } : {};
}
