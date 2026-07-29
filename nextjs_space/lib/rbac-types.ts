/**
 * RBAC TypeScript Types
 * 
 * Comprehensive type definitions for Role-Based Access Control system
 * in the Volkern CRM platform.
 */

import type { PermissionModule, PermissionAction } from './permissions';

/**
 * Permission actions available in the system
 * These represent the operations that can be performed on resources
 */
export type Permission = PermissionAction;

/**
 * All available CRM modules that can have permissions
 */
export type RBACModule = PermissionModule;

/**
 * Extended permission actions for RBAC system
 * Includes additional actions beyond basic CRUD
 */
export type ExtendedPermission = 
  | Permission
  | 'ver_todos'
  | 'editar_todos'
  | 'eliminar_todos'
  | 'asignar_cualquiera'
  | 'gestionar_todo'
  | 'exportar_todo'
  | 'invitar_cualquiera';

/**
 * Resource ownership level for access control
 */
export type OwnershipLevel = 
  | 'owner'      // User owns the resource
  | 'same_team' // User is in same team/department
  | 'same_tenant' // User is in same tenant
  | 'any';      // No ownership restriction

/**
 * Module permission configuration
 * Maps each action to a boolean indicating if it's granted
 */
export interface RBACModulePermissions {
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  asignar: boolean;
  exportar: boolean;
  gestionar: boolean;
  inscribir?: boolean;
  publicar?: boolean;
  activar?: boolean;
  enviar?: boolean;
  responder?: boolean;
  invitar?: boolean;
  [key: string]: boolean | undefined;
}

/**
 * Complete role permissions structure
 * Maps each module to its permission configuration
 */
export interface RolePermissionsMap {
  [module: string]: RBACModulePermissions;
}

/**
 * Role with full permission details
 */
export interface RoleWithPermissions {
  id: string;
  nombre: string;
  descripcion: string | null;
  permisos: RolePermissionsMap;
  esPersonalizado: boolean;
  orden: number;
  tenantId: string | null;
  fechaCreacion: Date;
  fechaActualizacion: Date;
}

/**
 * Basic role information
 */
export interface RoleBasic {
  id: string;
  nombre: string;
  tenantId: string | null;
}

/**
 * User with role and tenant information
 */
export interface RBACUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  tenantId: string | null;
  roleId: string | null;
  role?: RoleBasic | null;
}

/**
 * Complete user context for RBAC checks
 */
export interface RBACUserContext {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  tenantId: string | null;
  roleId: string | null;
  role?: RoleWithPermissions | null;
}

/**
 * RBAC Context - Main context object for permission checks
 * Contains the current user and their permissions
 */
export interface RBACContext {
  user: RBACUserContext | null;
  permissions: RolePermissionsMap | null;
  isSuperadmin: boolean;
  isAuthenticated: boolean;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  module?: RBACModule;
  permission?: Permission;
  reason?: string;
}

/**
 * API response for authorization checks
 */
export interface AuthorizeApiResponse {
  success: boolean;
  data?: {
    allowed: boolean;
    permissions: RolePermissionsMap | null;
    role?: RoleBasic | null;
    user?: {
      id: string;
      name: string | null;
      email: string;
    };
  };
  error?: string;
}

/**
 * API response for role details
 */
export interface RoleDetailsResponse {
  success: boolean;
  data?: RoleWithPermissions;
  error?: string;
}

/**
 * Middleware options for RBAC
 */
export interface RBACMiddlewareOptions {
  /** Whether to require authentication (default: true) */
  requireAuth?: boolean;
  /** Custom error message for unauthorized access */
  unauthorizedMessage?: string;
  /** Custom redirect URL for unauthenticated users */
  authRedirectUrl?: string;
  /** Include tenant validation */
  requireTenant?: boolean;
  /** Skip permissions check for superadmin (default: true) */
  skipForSuperadmin?: boolean;
}

/**
 * Permission requirement for middleware
 */
export interface PermissionRequirement {
  permission: Permission;
  module: RBACModule;
}

/**
 * Role requirement for middleware
 */
export interface RoleRequirement {
  roles: string[];
}

/**
 * Resource ownership configuration
 */
export interface OwnershipConfig {
  /** The tenant ID that owns the resource */
  tenantId: string;
  /** The user ID that owns the resource (optional) */
  ownerId?: string;
  /** Team/department IDs that can access the resource */
  teamIds?: string[];
  /** Whether to allow any user in the tenant */
  allowSameTenant?: boolean;
}

/**
 * Middleware handler type
 */
export type MiddlewareHandler = (
  req: Request,
  context: RBACContext
) => Promise<boolean> | boolean;

/**
 * Extended permission check with module and action
 */
export interface ExtendedPermissionCheck {
  actions: Permission[];
  module: RBACModule;
}

/**
 * Default permissions for each module
 * Used when creating new roles or validating permission structures
 */
export const DEFAULT_MODULE_PERMISSIONS: RBACModulePermissions = {
  ver: false,
  crear: false,
  editar: false,
  eliminar: false,
  asignar: false,
  exportar: false,
  gestionar: false,
  inscribir: false,
  publicar: false,
  activar: false,
  enviar: false,
  responder: false,
  invitar: false,
};

/**
 * All available modules in the system
 */
export const ALL_MODULES: RBACModule[] = [
  'leads',
  'citas',
  'estudiantes',
  'cursos',
  'automatizaciones',
  'campanas',
  'mensajes',
  'analytics',
  'configuracion',
  'equipo',
  'whitelabel',
  'telefonia',
  'pages',
  'ads',
];

/**
 * All available permission actions
 */
export const ALL_PERMISSIONS: Permission[] = [
  'ver',
  'crear',
  'editar',
  'eliminar',
  'asignar',
  'exportar',
  'gestionar',
  'inscribir',
  'publicar',
  'activar',
  'enviar',
  'responder',
  'invitar',
];

/**
 * Maps traditional permission to readable label
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  asignar: 'Asignar',
  exportar: 'Exportar',
  gestionar: 'Gestionar',
  inscribir: 'Inscribir',
  publicar: 'Publicar',
  activar: 'Activar',
  enviar: 'Enviar',
  responder: 'Responder',
  invitar: 'Invitar',
};

/**
 * Maps module to readable label
 */
export const MODULE_LABELS: Record<RBACModule, string> = {
  leads: 'Leads',
  citas: 'Citas',
  estudiantes: 'Estudiantes',
  cursos: 'Cursos',
  automatizaciones: 'Automatizaciones',
  campanas: 'Campañas',
  mensajes: 'Mensajes',
  analytics: 'Analíticas',
  configuracion: 'Configuración',
  equipo: 'Equipo',
  whitelabel: 'White Label',
  telefonia: 'Telefonía',
  pages: 'Páginas',
  ads: 'Anuncios',
};

/**
 * Checks if a permission value is valid
 */
export function isValidPermission(permission: string): permission is Permission {
  return ALL_PERMISSIONS.includes(permission as Permission);
}

/**
 * Checks if a module value is valid
 */
export function isValidModule(module: string): module is RBACModule {
  return ALL_MODULES.includes(module as RBACModule);
}

/**
 * Type guard for RBACUserContext
 */
export function isRBACUserContext(obj: any): obj is RBACUserContext {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.userId === 'string' &&
    typeof obj.email === 'string' &&
    (obj.tenantId === null || typeof obj.tenantId === 'string') &&
    (obj.roleId === null || typeof obj.roleId === 'string')
  );
}

/**
 * Type guard for RolePermissionsMap
 */
export function isRolePermissionsMap(obj: any): obj is RolePermissionsMap {
  if (obj === null || typeof obj !== 'object') return false;
  
  for (const key of Object.keys(obj)) {
    const modulePerms = obj[key];
    if (typeof modulePerms !== 'object') return false;
    
    for (const action of Object.keys(modulePerms)) {
      if (typeof modulePerms[action] !== 'boolean') return false;
    }
  }
  
  return true;
}