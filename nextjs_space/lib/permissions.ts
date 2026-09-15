
/**
 * Sistema de permisos y roles para Volkern CRM
 * 
 * Este módulo gestiona los permisos de usuario basados en roles
 * y proporciona funciones de verificación de permisos.
 */

import { prisma } from '@/lib/db';

// Tipos de permisos
export type PermissionModule = 
  | 'leads' 
  | 'citas' 
  | 'estudiantes' 
  | 'cursos' 
  | 'automatizaciones' 
  | 'campanas' 
  | 'ads'
  | 'mensajes' 
  | 'analytics' 
  | 'configuracion' 
  | 'equipo' 
  | 'whitelabel' 
  | 'telefonia'
  | 'pages'
  // Hospitality: capacidades del módulo de alojamiento. Están separadas en
  // cuatro áreas porque son cuatro trabajos distintos en una propiedad real
  // (quien recibe reservas no es necesariamente quien limpia, ni quien
  // configura los canales, ni quien ve el dinero).
  | 'hospitality_reservas'
  | 'hospitality_operaciones'
  | 'hospitality_mantenimiento'
  | 'hospitality_integraciones'
  | 'hospitality_finanzas'
  | 'hospitality_comunicaciones'
  | 'hospitality_automatizaciones';

export type PermissionAction = 
  | 'ver' 
  | 'crear' 
  | 'editar' 
  | 'eliminar' 
  | 'asignar' 
  | 'exportar' 
  | 'gestionar' 
  | 'inscribir' 
  | 'publicar' 
  | 'activar' 
  | 'enviar' 
  | 'responder' 
  | 'invitar'
  // Cancelar no es eliminar: la reserva cancelada sigue existiendo, con su
  // historial y sus pagos. Confundirlas haría que quien puede borrar borre
  // sin dejar rastro, y que quien solo corrige una reserva pueda anularla.
  | 'cancelar';

export interface ModulePermissions {
  [action: string]: boolean;
}

// Todos los módulos conocidos por el sistema. Usado por getVisibleModules
// cuando el rol usa el wildcard { all: true }.
export const ALL_PERMISSION_MODULES: PermissionModule[] = [
  'leads',
  'citas',
  'estudiantes',
  'cursos',
  'automatizaciones',
  'campanas',
  'ads',
  'mensajes',
  'analytics',
  'configuracion',
  'equipo',
  'whitelabel',
  'telefonia',
  'pages',
  'hospitality_reservas',
  'hospitality_operaciones',
  'hospitality_mantenimiento',
  'hospitality_integraciones',
  'hospitality_finanzas',
  'hospitality_comunicaciones',
  'hospitality_automatizaciones',
];

export interface RolePermissions {
  [module: string]: ModulePermissions;
}

export interface UserWithRole {
  id: string;
  roleId: string | null;
  tenantId: string | null;
  role?: {
    id: string;
    nombre: string;
    permisos: any;
  } | null;
}

/**
 * Verifica si un usuario tiene un permiso específico
 */
export function hasPermission(
  user: UserWithRole | null,
  module: PermissionModule,
  action: PermissionAction
): boolean {
  if (!user || !user.role) {
    return false;
  }

  // Superadmin tiene todos los permisos
  if (user.role.nombre === 'Superadmin') {
    return true;
  }

  // Permisos pueden venir como shape por módulo ({ leads: { ver: true } })
  // o con wildcard ({ all: true }, usado por scripts/bootstrap-admin.ts).
  const permissions = user.role.permisos as Record<string, unknown>;
  
  if (!permissions) {
    return false;
  }

  // Wildcard { all: true } = acceso total a todos los módulos. Sin esto, los
  // admins creados con ese shape recibían 403 en rutas como GET /api/deals
  // (hasPermission('leads','ver')).
  if (permissions.all === true) {
    return true;
  }

  const modulePerms = permissions[module];
  if (modulePerms === undefined) {
    return false;
  }

  // Módulo concedido entero (permisos[module] === true)
  if (modulePerms === true) {
    return true;
  }

  return (modulePerms as ModulePermissions)[action] === true;
}

/**
 * Verifica si un usuario puede ver un módulo completo
 */
export function canViewModule(
  user: UserWithRole | null,
  module: PermissionModule
): boolean {
  return hasPermission(user, module, 'ver');
}

/**
 * Obtiene todos los módulos visibles para un usuario
 */
export function getVisibleModules(user: UserWithRole | null): PermissionModule[] {
  if (!user || !user.role) {
    return [];
  }

  const permissions = user.role.permisos as Record<string, unknown>;
  
  if (!permissions) {
    return [];
  }

  // Wildcard { all: true } = todos los módulos visibles
  if (permissions.all === true) {
    return ALL_PERMISSION_MODULES;
  }

  return Object.keys(permissions).filter(module => {
    const perms = permissions[module];
    return perms === true || (perms as ModulePermissions)?.ver === true;
  }) as PermissionModule[];
}

/**
 * Obtiene los permisos completos de un usuario
 */
export function getUserPermissions(user: UserWithRole | null): RolePermissions | null {
  if (!user || !user.role) {
    return null;
  }

  return user.role.permisos as RolePermissions;
}

/**
 * Verifica si un usuario pertenece al mismo tenant que un recurso
 */
export function isSameTenant(userTenantId: string | null, resourceTenantId: string | null): boolean {
  if (!userTenantId || !resourceTenantId) {
    return false;
  }

  return userTenantId === resourceTenantId;
}

/**
 * Verifica si un usuario puede gestionar a otro usuario
 */
export function canManageUser(
  currentUser: UserWithRole | null,
  targetUser: UserWithRole | null
): boolean {
  if (!currentUser || !targetUser) {
    return false;
  }

  // Debe pertenecer al mismo tenant
  if (!isSameTenant(currentUser.tenantId, targetUser.tenantId)) {
    return false;
  }

  // Debe tener permiso de equipo.editar o equipo.eliminar
  return hasPermission(currentUser, 'equipo', 'editar') || 
         hasPermission(currentUser, 'equipo', 'eliminar');
}

/**
 * Verifica si un usuario puede asignar leads
 */
export function canAssignLeads(user: UserWithRole | null): boolean {
  return hasPermission(user, 'leads', 'asignar');
}

/**
 * Verifica si un usuario solo puede ver sus propios leads
 */
export function canOnlySeeOwnLeads(user: UserWithRole | null): boolean {
  if (!user || !user.role) {
    return true;
  }

  // Sales Agent y Support solo ven sus propios leads
  return user.role.nombre === 'Sales Agent' || user.role.nombre === 'Support';
}

/**
 * Obtiene los nombres de roles disponibles
 */
export const PREDEFINED_ROLES = [
  'Superadmin',
  'Admin',
  'Sales Agent',
  'Support',
  'Instructor',
] as const;

export type PredefinedRole = typeof PREDEFINED_ROLES[number];

/**
 * Obtiene la descripción de un rol
 */
export function getRoleDescription(roleName: string): string {
  const descriptions: Record<string, string> = {
    'Superadmin': 'Acceso total a todas las funcionalidades y configuración del sistema',
    'Admin': 'Gestión completa del CRM, usuarios y configuración',
    'Sales Agent': 'Gestión de leads, citas y comunicaciones',
    'Support': 'Atención al cliente, consultas de estudiantes y soporte',
    'Instructor': 'Gestión de cursos, estudiantes y contenido educativo',
  };

  return descriptions[roleName] || 'Rol personalizado';
}

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
