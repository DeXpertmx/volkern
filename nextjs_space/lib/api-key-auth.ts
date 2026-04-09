import { prisma, dbContext } from './db';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { hashApiKey, isValidApiKeyFormat, hasScope, hasAnyScope, extractApiKeyFromRequest } from './api-keys';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export type AuthenticatedHandler = (
  req: Request,
  auth: ApiKeyAuthResult,
  params?: any
) => Promise<Response>;

export interface ApiKeyAuthResult {
  valid: boolean;
  tenant?: {
    id: string;
    nombre: string;
    slug: string;
    plan: string;
  };
  user?: {
    id: string;
    name: string | null;
    email: string;
    tenantId: string | null;
    roleId: string | null;
    role?: any;
  };
  apiKey?: {
    id: string;
    nombre: string;
    scopes: string[];
  };
  db?: any; // PrismaClient (Global or Tenant)
  error?: string;
  authMethod?: 'session' | 'apikey';
}

/**
 * Valida una API key y devuelve información del tenant y usuario
 * @param request - La request de Next.js
 * @param requiredScopes - Scopes requeridos (opcional)
 * @returns Resultado de la autenticación
 */
export async function validateApiKey(
  request: Request,
  requiredScopes?: string[]
): Promise<ApiKeyAuthResult> {
  try {
    // Extraer API key del header
    const apiKey = extractApiKeyFromRequest(request);
    
    if (!apiKey) {
      return {
        valid: false,
        error: 'API key no proporcionada. Use el header X-API-Key o Authorization: Bearer'
      };
    }

    // Validar formato
    if (!isValidApiKeyFormat(apiKey)) {
      return {
        valid: false,
        error: 'Formato de API key inválido'
      };
    }

    // Hashear la key para buscar en la base de datos
    const keyHash = hashApiKey(apiKey);

    // Buscar la API key en la base de datos
    const dbApiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        tenant: {
          select: {
            id: true,
            nombre: true,
            slug: true,
            plan: true,
            estado: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            tenantId: true,
            roleId: true,
            role: true
          }
        }
      }
    });

    if (!dbApiKey) {
      return {
        valid: false,
        error: 'API key inválida o revocada'
      };
    }

    // Verificar que esté activa
    if (!dbApiKey.activo) {
      return {
        valid: false,
        error: 'API key desactivada'
      };
    }

    // Verificar expiración
    if (dbApiKey.expiraEn && dbApiKey.expiraEn < new Date()) {
      return {
        valid: false,
        error: 'API key expirada'
      };
    }

    // Verificar estado del tenant
    if (dbApiKey.tenant.estado !== 'activo' && dbApiKey.tenant.estado !== 'trial') {
      return {
        valid: false,
        error: 'Cuenta suspendida o cancelada'
      };
    }

    // Verificar scopes si se requieren
    if (requiredScopes && requiredScopes.length > 0) {
      const hasRequiredScopes = hasAnyScope(dbApiKey.scopes, requiredScopes);
      if (!hasRequiredScopes) {
        return {
          valid: false,
          error: `Permisos insuficientes. Se requiere: ${requiredScopes.join(' o ')}`
        };
      }
    }

    // Actualizar estadísticas de uso (en background)
    prisma.apiKey.update({
      where: { id: dbApiKey.id },
      data: {
        ultimoUso: new Date(),
        totalUsos: { increment: 1 }
      }
    }).catch(err => console.error('Error actualizando stats de API key:', err));

    // Devolver resultado exitoso
    return {
      valid: true,
      authMethod: 'apikey',
      tenant: {
        id: dbApiKey.tenant.id,
        nombre: dbApiKey.tenant.nombre,
        slug: dbApiKey.tenant.slug,
        plan: dbApiKey.tenant.plan
      },
      user: {
        id: dbApiKey.user.id,
        name: dbApiKey.user.name,
        email: dbApiKey.user.email,
        tenantId: dbApiKey.user.tenantId,
        roleId: dbApiKey.user.roleId,
        role: dbApiKey.user.role
      },
      apiKey: {
        id: dbApiKey.id,
        nombre: dbApiKey.nombre,
        scopes: dbApiKey.scopes
      },
      db: await import('./db').then(m => m.getTenantDb(dbApiKey.tenant.id))
    };

  } catch (error: any) {
    console.error('Error validando API key:', error);
    return {
      valid: false,
      error: 'Error interno al validar API key'
    };
  }
}

/**
 * Autenticación dual: Intenta primero sesión, luego API Key
 * Útil para endpoints que aceptan ambos métodos
 */
export async function authenticateRequest(
  request: Request,
  requiredScopes?: string[]
): Promise<ApiKeyAuthResult> {
  // 1. Intentar autenticación por sesión primero
  const session = await getServerSession(authOptions);
  
  if (session?.user?.id) {
    // Usuario autenticado por sesión
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { 
        role: true,
        tenant: {
          select: {
            id: true,
            nombre: true,
            slug: true,
            plan: true,
            estado: true
          }
        }
      }
    });

    if (!user || !user.tenant) {
      return {
        valid: false,
        error: 'Usuario o tenant no encontrado'
      };
    }

    // Verificar estado del tenant
    if (user.tenant.estado !== 'activo' && user.tenant.estado !== 'trial') {
      return {
        valid: false,
        error: 'Cuenta de tenant inactiva o suspendida'
      };
    }

    // --- LÓGICA DE SUPLANTACIÓN (IMPERSONATE) ---
    // Si es Superadmin, revisar si tiene activa la suplantación de otro tenant
    let activeTenantId = user.tenantId!;
    let targetTenant = {
      id: user.tenant.id,
      nombre: user.tenant.nombre,
      slug: user.tenant.slug,
      plan: user.tenant.plan
    };

    if (user.role?.nombre === 'Superadmin') {
      const cookieStore = cookies();
      const impersonatedId = cookieStore.get('volkern_impersonate_id')?.value;
      
      if (impersonatedId && impersonatedId !== user.tenantId) {
        console.log(`[AUTH-SYSTEM] Admin ${user.email} -> Attempting switch to tenant: ${impersonatedId}`);
        
        // Buscar el tenant suplantado
        const impTenant = await prisma.tenant.findUnique({
          where: { id: impersonatedId },
          select: { id: true, nombre: true, slug: true, plan: true, estado: true }
        });
        
        if (impTenant) {
          if (impTenant.estado === 'activo' || impTenant.estado === 'trial') {
            console.log(`[AUTH-SYSTEM] SUCCESS: Switched to ${impTenant.nombre} (${impTenant.id})`);
            activeTenantId = impTenant.id;
            targetTenant = {
              id: impTenant.id,
              nombre: impTenant.nombre,
              slug: impTenant.slug,
              plan: impTenant.plan
            };
          } else {
            console.warn(`[AUTH-SYSTEM] DENIED: Target tenant ${impTenant.nombre} is ${impTenant.estado}`);
          }
        } else {
          console.error(`[AUTH-SYSTEM] ERROR: Impersonated tenant ${impersonatedId} not found in DB`);
        }
      }
    }

    return {
      valid: true,
      authMethod: 'session',
      tenant: targetTenant,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        tenantId: user.tenantId,
        roleId: user.roleId,
        role: user.role
      },
      db: await import('./db').then(m => m.getTenantDb(activeTenantId))
    };
  }

  // 2. Si no hay sesión, intentar autenticación por API Key
  return await validateApiKey(request, requiredScopes);
}

/**
 * Wrapper HOC para rutas de API que necesitan aislamiento por Tenant
 */
export function withTenantAuth(
  handler: AuthenticatedHandler,
  requiredScopes?: string[]
) {
  return async (request: Request, context?: any) => {
    try {
      const auth = await authenticateRequest(request, requiredScopes);

      if (!auth.valid) {
        return NextResponse.json(
          { error: auth.error || 'No autorizado' },
          { status: 401 }
        );
      }

      // Ejecutar el handler dentro del contexto del tenant
      // Esto hace que 'import { prisma }' use automáticamente la DB del tenant
      return await dbContext.run(
        { tenantId: auth.tenant!.id, client: auth.db },
        () => handler(request, auth, context?.params)
      );
    } catch (error: any) {
      console.error('[withTenantAuth] Error fatal:', error);
      return NextResponse.json(
        { error: 'Error interno del servidor' },
        { status: 500 }
      );
    }
  };
}

/**
 * Wrapper para rutas PÚBLICAS que necesitan aislamiento por Tenant
 * El tenantId debe venir en el body o query params
 */
export function withPublicTenant(
  handler: (req: Request, tenantId: string, params?: any) => Promise<Response>
) {
  return async (request: Request, context?: any) => {
    try {
      // Intentar obtener tenantId del body (clonamos para no agotar el stream)
      let tenantId: string | null = null;
      const url = new URL(request.url);
      tenantId = url.searchParams.get('tenantId') || url.searchParams.get('tenant');

      if (!tenantId && request.method !== 'GET') {
        try {
          const bodyClone = await request.clone().json();
          tenantId = bodyClone.tenantId || bodyClone.tenant;
        } catch (e) {
          // No hay body o no es JSON
        }
      }

      if (!tenantId) {
        return NextResponse.json(
          { error: 'tenantId es requerido para este endpoint público' },
          { status: 400 }
        );
      }

      const { getTenantDb } = await import('./db');
      const db = await getTenantDb(tenantId!);

      // Ejecutar dentro del contexto del tenant
      return await dbContext.run(
        { tenantId: tenantId!, client: db },
        () => handler(request, tenantId!, context?.params)
      );
    } catch (error: any) {
      console.error('[withPublicTenant] Error fatal:', error);
      return NextResponse.json(
        { error: 'Error interno del servidor' },
        { status: 500 }
      );
    }
  };
}
