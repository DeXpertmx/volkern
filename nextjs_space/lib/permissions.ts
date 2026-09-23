
/**
 * Permisos con acceso a datos.
 *
 * Las reglas puras viven en `lib/permissions-core.ts` y se reexportan aquí, así
 * que `import { hasPermission } from '@/lib/permissions'` sigue funcionando
 * igual. Lo que queda en este archivo es lo que necesita la base de datos.
 */

import { prisma } from '@/lib/db';
import { hasPermission, type UserWithRole, type PermissionModule, type PermissionAction } from './permissions-core';

export * from './permissions-core';

/**
 * Middleware para verificar permisos en API routes
 */
export async function checkPermission(
  userId: string,
  module: PermissionModule,
  action: PermissionAction
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });

  return hasPermission(user as UserWithRole, module, action);
}

/**
 * Registra una acción en el audit log
 */
export async function logAuditAction(
  userId: string,
  tenantId: string,
  accion: string,
  entidad: string,
  entidadId: string,
  descripcion: string,
  cambiosAntes?: any,
  cambiosDespues?: any,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        tenantId,
        accion,
        entidad,
        entidadId,
        descripcion,
        cambiosAntes: cambiosAntes || undefined,
        cambiosDespues: cambiosDespues || undefined,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error('Error al registrar audit log:', error);
  }
}

/**
 * Versión simplificada de logAction para cuando no tenemos tenantId inmediato
 */
export async function logAction(params: {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    // Obtener el tenantId del usuario
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      console.warn('Usuario sin tenantId, no se puede registrar audit log');
      return;
    }

    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        tenantId: user.tenantId,
        accion: params.action,
        entidad: params.entity,
        entidadId: params.entityId,
        descripcion: JSON.stringify(params.details || {}),
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    console.error('Error al registrar audit log:', error);
  }
}
