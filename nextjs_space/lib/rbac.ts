/**
 * RBAC Core Service
 * 
 * Core Role-Based Access Control service that provides permission checking
 * and integration with the existing permissions system.
 */

import { prisma } from '@/lib/db';
import { 
  hasPermission as hasPermissionLegacy,
  getUserPermissions as getUserPermissionsLegacy,
  canViewModule,
  isSameTenant,
  type PermissionModule,
  type PermissionAction 
} from '@/lib/permissions';
import type { 
  Permission,
  RBACModule,
  RolePermissionsMap,
  RBACUserContext,
  RBACContext,
  RBACModulePermissions,
  RoleWithPermissions,
  OwnershipConfig,
  PermissionCheckResult
} from './rbac-types';

/**
 * RBAC Service class for managing role-based access control
 * Can be used as a singleton or instantiated per-request
 */
class RBACService {
  private context: RBACContext;
  private static instance: RBACService | null = null;

  constructor() {
    this.context = {
      user: null,
      permissions: null,
      isSuperadmin: false,
      isAuthenticated: false,
    };
  }

  /**
   * Get singleton instance of RBACService
   */
  static getInstance(): RBACService {
    if (!RBACService.instance) {
      RBACService.instance = new RBACService();
    }
    return RBACService.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static resetInstance(): void {
    RBACService.instance = null;
  }

  /**
   * Get current RBAC context
   */
  getContext(): RBACContext {
    return this.context;
  }

  /**
   * Get current user context
   */
  getUser(): RBACUserContext | null {
    return this.context.user;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.context.isAuthenticated;
  }

  /**
   * Check if user is superadmin
   */
  isSuperadmin(): boolean {
    return this.context.isSuperadmin;
  }

  /**
   * Clear current user context
   */
  clearContext(): void {
    this.context = {
      user: null,
      permissions: null,
      isSuperadmin: false,
      isAuthenticated: false,
    };
  }

  /**
   * Set current user for permission checks
   * @param user - User data with role information
   * @param role - Optional role with full permissions (if not included in user)
   */
  setCurrentUser(
    user: RBACUserContext | null,
    role?: RoleWithPermissions | null
  ): void {
    if (!user) {
      this.clearContext();
      return;
    }

    const roleData = role || user.role || null;
    const permisos = roleData?.permisos || null;
    const isSuperadmin = roleData?.nombre === 'Superadmin' || false;

    this.context = {
      user,
      permissions: permisos as RolePermissionsMap | null,
      isSuperadmin,
      isAuthenticated: true,
    };
  }

  /**
   * Set current user from database user object
   * @param dbUser - User from Prisma
   * @param roleId - Role ID to fetch
   */
  async setCurrentUserFromDb(dbUser: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    tenantId: string | null;
    roleId: string | null;
  }): Promise<void> {
    if (!dbUser) {
      this.clearContext();
      return;
    }

    let roleData: RoleWithPermissions | null = null;

    if (dbUser.roleId) {
      const role = await prisma.role.findUnique({
        where: { id: dbUser.roleId },
      });
      
      if (role) {
        roleData = {
          id: role.id,
          nombre: role.nombre,
          descripcion: role.descripcion,
          permisos: role.permisos as RolePermissionsMap,
          esPersonalizado: role.esPersonalizado,
          orden: role.orden,
          tenantId: role.tenantId,
          fechaCreacion: role.fechaCreacion,
          fechaActualizacion: role.fechaActualizacion,
        };
      }
    }

    const userContext: RBACUserContext = {
      userId: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      image: dbUser.image,
      tenantId: dbUser.tenantId,
      roleId: dbUser.roleId,
      role: roleData,
    };

    this.setCurrentUser(userContext, roleData || undefined);
  }

  /**
   * Check if the current user has a specific permission
   * @param permission - The permission action to check
   * @param module - The module to check permission for
   * @returns true if user has permission, false otherwise
   */
  can(permission: Permission, module: RBACModule): boolean {
    // No user = no permission
    if (!this.context.isAuthenticated || !this.context.user) {
      return false;
    }

    // Superadmin has all permissions
    if (this.context.isSuperadmin) {
      return true;
    }

    // Check permissions map
    const permissions = this.context.permissions;
    if (!permissions || !permissions[module]) {
      return false;
    }

    const modulePermissions = permissions[module] as RBACModulePermissions;
    return modulePermissions[permission] === true;
  }

  /**
   * Check if user has ANY of the specified permissions
   * @param permissions - Array of permission-module pairs to check
   * @returns true if user has at least one permission
   */
  canAny(checks: Array<{ permission: Permission; module: RBACModule }>): boolean {
    return checks.some(check => this.can(check.permission, check.module));
  }

  /**
   * Check if user has ALL of the specified permissions
   * @param permissions - Array of permission-module pairs to check
   * @returns true if user has all permissions
   */
  canAll(checks: Array<{ permission: Permission; module: RBACModule }>): boolean {
    return checks.every(check => this.can(check.permission, check.module));
  }

  /**
   * Check if user can perform multiple permissions on the same module
   * @param permissions - Array of permissions to check
   * @param module - Module to check against
   * @returns true if user has all specified permissions for the module
   */
  canAllOnModule(permissions: Permission[], module: RBACModule): boolean {
    return permissions.every(perm => this.can(perm, module));
  }

  /**
   * Check if user can perform any of multiple permissions on the same module
   * @param permissions - Array of permissions to check
   * @param module - Module to check against
   * @returns true if user has any of the specified permissions for the module
   */
  canAnyOnModule(permissions: Permission[], module: RBACModule): boolean {
    return permissions.some(perm => this.can(perm, module));
  }

  /**
   * Get all permissions for a role
   * @param role - Role with permissions
   * @returns Permission map or null if no role
   */
  getRolePermissions(role: RoleWithPermissions | null): RolePermissionsMap | null {
    if (!role || !role.permisos) {
      return null;
    }
    return role.permisos;
  }

  /**
   * Check if user can view a specific module
   * @param module - Module to check
   * @returns true if user can view the module
   */
  canView(module: RBACModule): boolean {
    return this.can('ver', module);
  }

  /**
   * Check if user can create resources in a module
   * @param module - Module to check
   * @returns true if user can create
   */
  canCreate(module: RBACModule): boolean {
    return this.can('crear', module);
  }

  /**
   * Check if user can edit resources in a module
   * @param module - Module to check
   * @returns true if user can edit
   */
  canEdit(module: RBACModule): boolean {
    return this.can('editar', module);
  }

  /**
   * Check if user can delete resources in a module
   * @param module - Module to check
   * @returns true if user can delete
   */
  canDelete(module: RBACModule): boolean {
    return this.can('eliminar', module);
  }

  /**
   * Check if user can export resources from a module
   * @param module - Module to check
   * @returns true if user can export
   */
  canExport(module: RBACModule): boolean {
    return this.can('exportar', module);
  }

  /**
   * Check if user can assign resources in a module
   * @param module - Module to check
   * @returns true if user can assign
   */
  canAssign(module: RBACModule): boolean {
    return this.can('asignar', module);
  }

  /**
   * Check if user can manage a module (full management access)
   * @param module - Module to check
   * @returns true if user can manage
   */
  canManage(module: RBACModule): boolean {
    return this.can('gestionar', module);
  }

  /**
   * Check resource ownership
   * @param resource - Resource with ownership info
   * @param userId - User ID to check
   * @returns true if user owns or can access the resource
   */
  checkResourceOwnership(resource: OwnershipConfig, userId: string): boolean {
    // No user = no access
    if (!this.context.isAuthenticated || !this.context.user) {
      return false;
    }

    // Superadmin can access anything within their tenant
    if (this.context.isSuperadmin) {
      return this.context.user.tenantId === resource.tenantId;
    }

    // Check tenant match
    if (this.context.user.tenantId !== resource.tenantId) {
      return false;
    }

    // If owner, grant access
    if (resource.ownerId && resource.ownerId === userId) {
      return true;
    }

    // If same tenant allowed
    if (resource.allowSameTenant) {
      return true;
    }

    // Check team access
    if (resource.teamIds && resource.teamIds.length > 0) {
      const userTeamIds = (this.context.user.role as any)?.metadata?.teamIds as string[] | undefined;
      if (userTeamIds) {
        return resource.teamIds.some(tid => userTeamIds.includes(tid));
      }
    }

    return false;
  }

  /**
   * Check if user can access a resource owned by another user
   * @param ownerId - Owner of the resource
   * @param ownerTenantId - Tenant of the owner
   * @returns true if user can access the resource
   */
  canAccessResource(ownerId: string, ownerTenantId: string | null): boolean {
    if (!this.context.isAuthenticated || !this.context.user || !ownerTenantId) {
      return false;
    }

    // Superadmin can access anything in their tenant
    if (this.context.isSuperadmin) {
      return this.context.user.tenantId === ownerTenantId;
    }

    // Check tenant
    if (this.context.user.tenantId !== ownerTenantId) {
      return false;
    }

    // Owner can always access their own resources
    if (this.context.user.userId === ownerId) {
      return true;
    }

    // Check if user has edit permission on any relevant module
    // This is a basic check - individual modules may have more specific logic
    return this.can('editar', 'leads') || 
           this.can('editar', 'citas') ||
           this.can('gestionar', 'equipo');
  }

  /**
   * Check if user can manage another user
   * @param targetUserId - User to manage
   * @param targetTenantId - User's tenant
   * @returns true if user can manage target user
   */
  canManageUser(targetUserId: string, targetTenantId: string | null): boolean {
    if (!this.context.isAuthenticated || !this.context.user || !targetTenantId) {
      return false;
    }

    // Superadmin can manage anyone in their tenant
    if (this.context.isSuperadmin) {
      return this.context.user.tenantId === targetTenantId;
    }

    // Check tenant
    if (this.context.user.tenantId !== targetTenantId) {
      return false;
    }

    // Check if user has equipo permissions
    return this.can('gestionar', 'equipo') || 
           this.can('editar', 'equipo');
  }

  /**
   * Get all modules the user can view
   * @returns Array of modules the user can access
   */
  getVisibleModules(): RBACModule[] {
    if (!this.context.permissions) {
      return [];
    }

    const modules: RBACModule[] = [];
    const perms = this.context.permissions as Record<string, RBACModulePermissions>;
    
    for (const [module, modPerms] of Object.entries(perms)) {
      if (modPerms.ver === true) {
        modules.push(module as RBACModule);
      }
    }

    return modules;
  }

  /**
   * Get detailed permission check result
   * @param permission - Permission to check
   * @param module - Module to check
   * @returns Detailed permission check result
   */
  checkPermission(permission: Permission, module: RBACModule): PermissionCheckResult {
    const hasPermission = this.can(permission, module);
    
    return {
      allowed: hasPermission,
      module,
      permission,
      reason: hasPermission 
        ? undefined 
        : this.context.isAuthenticated 
          ? 'Insufficient permissions' 
          : 'Not authenticated',
    };
  }

  /**
   * Validate permission structure
   * @param permissions - Permissions to validate
   * @returns true if valid structure
   */
  static validatePermissions(permissions: any): boolean {
    if (!permissions || typeof permissions !== 'object') {
      return false;
    }

    for (const [module, modPerms] of Object.entries(permissions)) {
      if (typeof modPerms !== 'object' || modPerms === null) {
        return false;
      }

      for (const [action, value] of Object.entries(modPerms)) {
        if (typeof value !== 'boolean') {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Create empty permissions structure for all modules
   * @returns Empty permissions map
   */
  static createEmptyPermissions(): RolePermissionsMap {
    return {
      leads: { ver: false, crear: false, editar: false, eliminar: false, asignar: false, exportar: false, gestionar: false },
      citas: { ver: false, crear: false, editar: false, eliminar: false, asignar: false, exportar: false, gestionar: false },
      estudiantes: { ver: false, crear: false, editar: false, eliminar: false, asignar: false, exportar: false, gestionar: false, inscribir: false },
      cursos: { ver: false, crear: false, editar: false, eliminar: false, asignar: false, exportar: false, gestionar: false, publicar: false },
      automatizaciones: { ver: false, crear: false, editar: false, eliminar: false, asignar: false, exportar: false, gestionar: false },
      campanas: { ver: false, crear: false, editar: false, eliminar: false, asignar: false, exportar: false, gestionar: false, enviar: false },
      mensajes: { ver: false, crear: false, editar: false, eliminar: false, asignar: false, exportar: false, gestionar: false, enviar: false, responder: false },
      analytics: { ver: false, exportar: false, gestionar: false },
      configuracion: { ver: false, editar: false, gestionar: false },
      equipo: { ver: false, crear: false, editar: false, eliminar: false, asignar: false, exportar: false, gestionar: false, invitar: false },
      whitelabel: { ver: false, gestionar: false },
      telefonia: { ver: false, crear: false, editar: false, eliminar: false, asignar: false, exportar: false, gestionar: false },
      pages: { ver: false, crear: false, editar: false, eliminar: false, exportar: false, gestionar: false, publicar: false },
    } as any;
  }

  /**
   * Merge permissions - combines two permission sets
   * @param base - Base permissions
   * @param override - Override permissions
   * @returns Merged permissions
   */
  static mergePermissions(
    base: RolePermissionsMap,
    override: RolePermissionsMap
  ): RolePermissionsMap {
    const result = JSON.parse(JSON.stringify(base)) as RolePermissionsMap;
    
    for (const [module, overrideModPerms] of Object.entries(override)) {
      if (!result[module]) {
        result[module] = {} as RBACModulePermissions;
      }
      
      for (const [action, value] of Object.entries(overrideModPerms)) {
        if (value === true) {
          (result[module] as any)[action] = true;
        } else if (overrideModPerms[action] === false && (result[module] as any)[action] !== undefined) {
          (result[module] as any)[action] = false;
        }
      }
    }
    
    return result;
  }
}

/**
 * Create a new RBACService instance
 */
export function createRBACService(): RBACService {
  return new RBACService();
}

/**
 * Get the global RBACService instance
 */
export function getRBACService(): RBACService {
  return RBACService.getInstance();
}

/**
 * Set current user for permission checks (global)
 */
export async function setCurrentUser(userId: string): Promise<void> {
  const service = RBACService.getInstance();
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      tenantId: true,
      roleId: true,
    },
  });

  if (dbUser) {
    await service.setCurrentUserFromDb(dbUser);
  }
}

/**
 * Check if user has permission (global)
 */
export function can(permission: Permission, module: RBACModule): boolean {
  return RBACService.getInstance().can(permission, module);
}

/**
 * Check if current user can view module (global)
 */
export function canView(module: RBACModule): boolean {
  return RBACService.getInstance().canView(module);
}

/**
 * Check resource ownership (global)
 */
export function checkResourceOwnership(resource: OwnershipConfig, userId: string): boolean {
  return RBACService.getInstance().checkResourceOwnership(resource, userId);
}

/**
 * Export RBACService class
 */
export { RBACService };

/**
 * Check permission using the legacy permission system (integration wrapper)
 * This provides backward compatibility with existing code
 */
export function hasPermissionLegacyWrapper(
  user: { role?: { nombre: string; permisos: any } | null },
  module: PermissionModule,
  action: PermissionAction
): boolean {
  return hasPermissionLegacy(user as any, module, action);
}

/**
 * Get user permissions using legacy system
 */
export function getUserPermissionsLegacyWrapper(
  user: { role?: { permisos: any } | null }
): RolePermissionsMap | null {
  return getUserPermissionsLegacy(user as any) as RolePermissionsMap | null;
}