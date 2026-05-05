/**
 * RBAC Authorization API
 * 
 * API endpoint for checking and managing user permissions.
 * Provides authorization checks, role details, and permission information.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';
import { getRBACService, createRBACService } from '@/lib/rbac';
import { isValidPermission, isValidModule } from '@/lib/rbac-types';
import type { 
  Permission, 
  RBACModule, 
  RolePermissionsMap,
  RBACUserContext,
  RoleWithPermissions 
} from '@/lib/rbac-types';

/**
 * GET handler - Get current user permissions and role details
 */
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    if (!token || !token.sub) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get('roleId');
    const checkPermission = searchParams.get('permission') as Permission | null;
    const checkModule = searchParams.get('module') as RBACModule | null;

    // If roleId provided, get role details
    if (roleId) {
      return getRoleDetails(roleId);
    }

    // Otherwise, get current user's permissions
    const user = await prisma.user.findUnique({
      where: { id: token.sub },
      include: {
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    const role = user.role;

    // Build user context
    const userContext: RBACUserContext = {
      userId: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      tenantId: user.tenantId,
      roleId: user.roleId,
      role: role
        ? {
            id: role.id,
            nombre: role.nombre,
            descripcion: role.descripcion,
            permisos: role.permisos as RolePermissionsMap,
            esPersonalizado: role.esPersonalizado,
            orden: role.orden,
            tenantId: role.tenantId,
            fechaCreacion: role.fechaCreacion,
            fechaActualizacion: role.fechaActualizacion,
          }
        : null,
    };

    // Set up RBAC service
    const rbac = createRBACService();
    rbac.setCurrentUser(userContext, userContext.role || undefined);

    // Check specific permission if provided
    if (checkPermission && checkModule) {
      if (!isValidPermission(checkPermission) || !isValidModule(checkModule)) {
        return NextResponse.json(
          { success: false, error: 'Parámetros inválidos' },
          { status: 400 }
        );
      }

      const hasPermission = rbac.can(checkPermission as Permission, checkModule as RBACModule);
      
      return NextResponse.json({
        success: true,
        data: {
          allowed: hasPermission,
          permission: checkPermission,
          module: checkModule,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        },
      });
    }

    // Return full permissions
    const permissions = rbac.getRolePermissions(userContext.role);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        role: role
          ? {
              id: role.id,
              nombre: role.nombre,
              tenantId: role.tenantId,
            }
          : null,
        permissions,
        isSuperadmin: rbac.isSuperadmin(),
        visibleModules: rbac.getVisibleModules(),
        isAuthenticated: rbac.isAuthenticated(),
      },
    });
  } catch (error) {
    console.error('Error in RBAC authorize GET:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST handler - Check specific permission
 */
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    if (!token || !token.sub) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { permission, module, roleId } = body;

    // Validate parameters
    if ((permission && !module) || (!permission && module)) {
      return NextResponse.json(
        { success: false, error: 'Se requieren permission y module' },
        { status: 400 }
      );
    }

    // If roleId provided in body, check permission for that role
    if (roleId) {
      return checkRolePermission(roleId, permission, module);
    }

    // Get current user's permissions
    const user = await prisma.user.findUnique({
      where: { id: token.sub },
      include: {
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    const role = user.role;

    // Build user context
    const userContext: RBACUserContext = {
      userId: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      tenantId: user.tenantId,
      roleId: user.roleId,
      role: role
        ? {
            id: role.id,
            nombre: role.nombre,
            descripcion: role.descripcion,
            permisos: role.permisos as RolePermissionsMap,
            esPersonalizado: role.esPersonalizado,
            orden: role.orden,
            tenantId: role.tenantId,
            fechaCreacion: role.fechaCreacion,
            fechaActualizacion: role.fechaActualizacion,
          }
        : null,
    };

    // Set up RBAC service
    const rbac = createRBACService();
    rbac.setCurrentUser(userContext, userContext.role || undefined);

    // Check permission if provided
    if (permission && module) {
      if (!isValidPermission(permission) || !isValidModule(module)) {
        return NextResponse.json(
          { success: false, error: 'Parámetros inválidos' },
          { status: 400 }
        );
      }

      const hasPermission = rbac.can(permission as Permission, module as RBACModule);
      
      return NextResponse.json({
        success: true,
        data: {
          allowed: hasPermission,
          permission,
          module,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        },
      });
    }

    // Return full permissions if no specific check
    const permissions = rbac.getRolePermissions(userContext.role);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        role: role
          ? {
              id: role.id,
              nombre: role.nombre,
              tenantId: role.tenantId,
            }
          : null,
        permissions,
        isSuperadmin: rbac.isSuperadmin(),
      },
    });
  } catch (error) {
    console.error('Error in RBAC authorize POST:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * Get role details by ID
 */
async function getRoleDetails(roleId: string) {
  try {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Rol no encontrado' },
        { status: 404 }
      );
    }

    const roleWithPermissions: RoleWithPermissions = {
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

    return NextResponse.json({
      success: true,
      data: roleWithPermissions,
    });
  } catch (error) {
    console.error('Error getting role details:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener detalles del rol' },
      { status: 500 }
    );
  }
}

/**
 * Check permission for a specific role (by roleId)
 */
async function checkRolePermission(roleId: string, permission?: Permission, module?: RBACModule) {
  try {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Rol no encontrado' },
        { status: 404 }
      );
    }

    // Build role context
    const roleData: RoleWithPermissions = {
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

    // Check permission if provided
    if (permission && module) {
      if (!isValidPermission(permission) || !isValidModule(module)) {
        return NextResponse.json(
          { success: false, error: 'Parámetros inválidos' },
          { status: 400 }
        );
      }

      const perms = roleData.permisos as Record<string, Record<string, boolean>>;
      const hasPermission = perms[module]?.[permission] === true || role.nombre === 'Superadmin';
      
      return NextResponse.json({
        success: true,
        data: {
          allowed: hasPermission,
          permission,
          module,
          role: {
            id: role.id,
            nombre: role.nombre,
          },
        },
      });
    }

    // Return full permissions
    return NextResponse.json({
      success: true,
      data: {
        role: {
          id: role.id,
          nombre: role.nombre,
          tenantId: role.tenantId,
        },
        permissions: roleData.permisos,
        isSuperadmin: role.nombre === 'Superadmin',
      },
    });
  } catch (error) {
    console.error('Error checking role permission:', error);
    return NextResponse.json(
      { success: false, error: 'Error al verificar permiso del rol' },
      { status: 500 }
    );
  }
}