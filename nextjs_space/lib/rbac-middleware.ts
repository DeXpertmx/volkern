/**
 * RBAC Middleware for Next.js API Routes
 * 
 * Middleware functions for protecting API routes with role-based access control.
 * Integrates with the existing tenant context from middleware.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getRBACService, setCurrentUser, createRBACService } from './rbac';
import { prisma } from '@/lib/db';
import type {
  Permission,
  RBACModule,
  RolePermissionsMap,
  RBACUserContext,
  RBACMiddlewareOptions,
  OwnershipConfig,
} from './rbac-types';

/**
 * Default middleware options
 */
const DEFAULT_OPTIONS: RBACMiddlewareOptions = {
  requireAuth: true,
  unauthorizedMessage: 'No tienes permiso para realizar esta acción',
  authRedirectUrl: '/auth/login',
  requireTenant: true,
  skipForSuperadmin: true,
};

/**
 * Extract user from NextAuth token
 */
async function getUserFromToken(request: NextRequest): Promise<{
  userId: string;
  email: string;
  name: string | null;
  tenantId: string | null;
  roleId: string | null;
} | null> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    if (!token) {
      return null;
    }

    return {
      userId: token.sub as string,
      email: token.email as string,
      name: token.name as string | null,
      tenantId: token.tenantSubdomain as string | null,
      roleId: token.roleId as string | null,
    };
  } catch {
    return null;
  }
}

/**
 * Get full user context with role and permissions
 */
async function getUserContext(userData: {
  userId: string;
  email: string;
  name: string | null;
  tenantId: string | null;
  roleId: string | null;
}): Promise<RBACUserContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userData.userId },
    include: {
      role: true,
    },
  });

  if (!user) {
    return null;
  }

  const roleData = user.role
    ? {
        id: user.role.id,
        nombre: user.role.nombre,
        descripcion: user.role.descripcion,
        permisos: user.role.permisos as RolePermissionsMap,
        esPersonalizado: user.role.esPersonalizado,
        orden: user.role.orden,
        tenantId: user.role.tenantId,
        fechaCreacion: user.role.fechaCreacion,
        fechaActualizacion: user.role.fechaActualizacion,
      }
    : null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    tenantId: user.tenantId,
    roleId: user.roleId,
    role: roleData,
  };
}

/**
 * Create RBAC middleware factory
 * @param options - Middleware configuration options
 */
export function createRBACMiddleware(options: RBACMiddlewareOptions = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async function rbacMiddleware(
    request: NextRequest,
    handler: (context: RBACUserContext) => Promise<NextResponse>
  ): Promise<NextResponse> {
    // Get user from token
    const userData = await getUserFromToken(request);
    
    // Check authentication
    if (config.requireAuth && !userData) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      );
    }

    // If no auth required, allow unauthenticated access
    if (!userData) {
      return handler(null as any);
    }

    // Get tenant from header (set by main middleware)
    const tenantSubdomain = request.headers.get('x-tenant-subdomain');

    // Check tenant match
    if (config.requireTenant && tenantSubdomain && userData.tenantId !== tenantSubdomain) {
      return NextResponse.json(
        { success: false, error: 'Acceso denegado a este tenant' },
        { status: 403 }
      );
    }

    // Set up RBAC service with user context
    const userContext = await getUserContext(userData);
    const rbac = createRBACService();
    
    if (userContext) {
      rbac.setCurrentUser(userContext, userContext.role || undefined);
    }

    // Store in request extensions for later use
    const extensions = {
      rbac,
      user: userContext,
      userId: userData.userId,
      tenantId: userData.tenantId,
    };

    // Execute handler
    return handler(userContext as any);
  };
}

/**
 * Middleware to require specific permission
 * @param permission - Permission action required
 * @param module - Module to check
 * @param options - Additional options
 */
export function requirePermission(
  permission: Permission,
  module: RBACModule,
  options: RBACMiddlewareOptions = {}
) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async function requirePermissionMiddleware(
    request: NextRequest
  ): Promise<NextResponse> {
    // Get user from token
    const userData = await getUserFromToken(request);
    
    if (config.requireAuth && !userData) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      );
    }

    if (!userData) {
      return NextResponse.next();
    }

    // Get user context with permissions
    const userContext = await getUserContext(userData);
    const rbac = createRBACService();
    
    if (userContext) {
      rbac.setCurrentUser(userContext, userContext.role || undefined);
    }

    // Check permission
    const hasPermission = rbac.can(permission, module);
    
    // Superadmin bypass (if enabled)
    if (config.skipForSuperadmin && rbac.isSuperadmin()) {
      return NextResponse.next();
    }

    if (!hasPermission) {
      return NextResponse.json(
        { 
          success: false, 
          error: config.unauthorizedMessage,
          details: `Se requiere permiso '${permission}' en '${module}'`,
        },
        { status: 403 }
      );
    }

    return NextResponse.next();
  };
}

/**
 * Middleware to require ANY of the specified permissions
 * @param checks - Array of permission-module pairs
 * @param options - Additional options
 */
export function requireAnyPermission(
  checks: Array<{ permission: Permission; module: RBACModule }>,
  options: RBACMiddlewareOptions = {}
) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async function requireAnyPermissionMiddleware(
    request: NextRequest
  ): Promise<NextResponse> {
    const userData = await getUserFromToken(request);
    
    if (config.requireAuth && !userData) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      );
    }

    if (!userData) {
      return NextResponse.next();
    }

    const userContext = await getUserContext(userData);
    const rbac = createRBACService();
    
    if (userContext) {
      rbac.setCurrentUser(userContext, userContext.role || undefined);
    }

    // Check if user has ANY of the permissions
    const hasAnyPermission = rbac.canAny(checks);
    
    if (config.skipForSuperadmin && rbac.isSuperadmin()) {
      return NextResponse.next();
    }

    if (!hasAnyPermission) {
      return NextResponse.json(
        { 
          success: false, 
          error: config.unauthorizedMessage,
          details: `Se requiere alguno de los permisos: ${checks.map(c => `${c.permission}:${c.module}`).join(', ')}`,
        },
        { status: 403 }
      );
    }

    return NextResponse.next();
  };
}

/**
 * Middleware to require ALL of the specified permissions
 * @param checks - Array of permission-module pairs
 * @param options - Additional options
 */
export function requireAllPermissions(
  checks: Array<{ permission: Permission; module: RBACModule }>,
  options: RBACMiddlewareOptions = {}
) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async function requireAllPermissionsMiddleware(
    request: NextRequest
  ): Promise<NextResponse> {
    const userData = await getUserFromToken(request);
    
    if (config.requireAuth && !userData) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      );
    }

    if (!userData) {
      return NextResponse.next();
    }

    const userContext = await getUserContext(userData);
    const rbac = createRBACService();
    
    if (userContext) {
      rbac.setCurrentUser(userContext, userContext.role || undefined);
    }

    // Check if user has ALL of the permissions
    const hasAllPermissions = rbac.canAll(checks);
    
    if (config.skipForSuperadmin && rbac.isSuperadmin()) {
      return NextResponse.next();
    }

    if (!hasAllPermissions) {
      return NextResponse.json(
        { 
          success: false, 
          error: config.unauthorizedMessage,
          details: `Se requieren todos los permisos: ${checks.map(c => `${c.permission}:${c.module}`).join(', ')}`,
        },
        { status: 403 }
      );
    }

    return NextResponse.next();
  };
}

/**
 * Middleware to require specific roles
 * @param roles - Array of role names
 * @param options - Additional options
 */
export function requireRole(
  roles: string[],
  options: RBACMiddlewareOptions = {}
) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async function requireRoleMiddleware(
    request: NextRequest
  ): Promise<NextResponse> {
    const userData = await getUserFromToken(request);
    
    if (config.requireAuth && !userData) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      );
    }

    if (!userData) {
      return NextResponse.next();
    }

    const userContext = await getUserContext(userData);
    
    if (!userContext || !userContext.role) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No tienes un rol asignado',
        },
        { status: 403 }
      );
    }

    const userRoleName = userContext.role.nombre;
    
    if (!roles.includes(userRoleName)) {
      return NextResponse.json(
        { 
          success: false, 
          error: config.unauthorizedMessage,
          details: `Se requiere uno de los roles: ${roles.join(', ')}. Tu rol actual: ${userRoleName}`,
        },
        { status: 403 }
      );
    }

    return NextResponse.next();
  };
}

/**
 * Middleware to check resource ownership
 * @param getResource - Function to get resource ownership info
 * @param options - Additional options
 */
export function requireOwner(
  getResource: (request: NextRequest) => Promise<OwnershipConfig>,
  options: RBACMiddlewareOptions = {}
) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async function requireOwnerMiddleware(
    request: NextRequest
  ): Promise<NextResponse> {
    const userData = await getUserFromToken(request);
    
    if (config.requireAuth && !userData) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      );
    }

    if (!userData) {
      return NextResponse.next();
    }

    const userContext = await getUserContext(userData);
    const rbac = createRBACService();
    
    if (userContext) {
      rbac.setCurrentUser(userContext, userContext.role || undefined);
    }

    // Get resource ownership info
    const resource = await getResource(request);
    
    // Check ownership
    const hasAccess = rbac.checkResourceOwnership(resource, userData.userId);
    
    if (config.skipForSuperadmin && rbac.isSuperadmin()) {
      return NextResponse.next();
    }

    if (!hasAccess) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No tienes acceso a este recurso',
          details: 'Solo el propietario o usuarios con permisos pueden acceder',
        },
        { status: 403 }
      );
    }

    return NextResponse.next();
  };
}

/**
 * Higher-order function for API route protection
 * Wraps a Next.js API route handler with RBAC checks
 * 
 * @example
 * export const GET = withRBAC(
 *   { permission: 'ver', module: 'leads' },
 *   async (req, context) => { ... }
 * );
 */
export function withRBAC(
  requirement: 
    | { permission: Permission; module: RBACModule }
    | { permissions: Array<{ permission: Permission; module: RBACModule }>; mode: 'any' | 'all' }
    | { roles: string[] },
  options: RBACMiddlewareOptions = {}
) {
  return function wrapHandler(
    handler: (request: NextRequest, context: RBACUserContext) => Promise<NextResponse>
  ) {
    return async function RBACWrappedHandler(
      request: NextRequest
    ): Promise<NextResponse> {
      const userData = await getUserFromToken(request);
      
      if (options.requireAuth !== false && !userData) {
        return NextResponse.json(
          { success: false, error: 'No autenticado' },
          { status: 401 }
        );
      }

      if (!userData) {
        return handler(request, null as any);
      }

      const userContext = await getUserContext(userData);
      const rbac = createRBACService();
      
      if (userContext) {
        rbac.setCurrentUser(userContext, userContext.role || undefined);
      }

      // Check permissions based on requirement type
      let allowed = false;

      if ('permission' in requirement) {
        allowed = rbac.can(requirement.permission, requirement.module);
      } else if ('permissions' in requirement) {
        if (requirement.mode === 'any') {
          allowed = rbac.canAny(requirement.permissions);
        } else {
          allowed = rbac.canAll(requirement.permissions);
        }
      } else if ('roles' in requirement) {
        allowed = userContext?.role 
          ? requirement.roles.includes(userContext.role.nombre)
          : false;
      }

      if (options.skipForSuperadmin !== false && rbac.isSuperadmin()) {
        allowed = true;
      }

      if (!allowed) {
        return NextResponse.json(
          { 
            success: false, 
            error: options.unauthorizedMessage || 'No tienes permiso para realizar esta acción',
          },
          { status: 403 }
        );
      }

      return handler(request, userContext as any);
    };
  };
}

/**
 * Create a simple permission-checked route handler
 * @param permission - Required permission
 * @param module - Module to check
 * @param handler - Route handler
 */
export function createProtectedRoute(
  permission: Permission,
  module: RBACModule,
  handler: (request: NextRequest, user: RBACUserContext) => Promise<NextResponse>
) {
  const middleware = requirePermission(permission, module);
  
  return async function protectedHandler(
    request: NextRequest
  ): Promise<NextResponse> {
    // First run middleware
    const middlewareResult = await middleware(request);
    
    // If middleware returned error response, return it
    if (middlewareResult.status !== 200) {
      return middlewareResult;
    }
    
    // Get user context
    const userData = await getUserFromToken(request);
    if (!userData) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 }
      );
    }

    const userContext = await getUserContext(userData);
    
    // Execute handler
    return handler(request, userContext as any);
  };
}

/**
 * Get RBAC context from request (for use in route handlers)
 */
export async function getRBACContext(
  request: NextRequest
): Promise<{
  rbac: ReturnType<typeof createRBACService>;
  user: RBACUserContext;
} | null> {
  const userData = await getUserFromToken(request);
  
  if (!userData) {
    return null;
  }

  const userContext = await getUserContext(userData);
  
  if (!userContext) {
    return null;
  }

  const rbac = createRBACService();
  rbac.setCurrentUser(userContext, userContext.role || undefined);

  return { rbac, user: userContext };
}

/**
 * Type for middleware result
 */
export type MiddlewareResult = NextResponse | { status: number; json: { success: boolean; error: string } };

/**
 * Utility function to create chained middleware
 * @param middlewares - Array of middleware functions
 */
export function chainMiddlewares(
  ...middlewares: Array<(request: NextRequest) => Promise<NextResponse>>
) {
  return async function chainedMiddleware(
    request: NextRequest
  ): Promise<NextResponse> {
    for (const middleware of middlewares) {
      const result = await middleware(request);
      
      if (result.status !== 200) {
        return result;
      }
    }
    
    return NextResponse.next();
  };
}