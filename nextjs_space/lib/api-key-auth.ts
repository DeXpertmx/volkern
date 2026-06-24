import { PrismaClient } from '@prisma/client';
import { prisma, dbContext } from './db';
import { logger } from './logger';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { hashApiKey, isValidApiKeyFormat, hasScope, hasAnyScope, extractApiKeyFromRequest } from './api-keys';
import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { unstable_noStore as noStore } from 'next/cache';

const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'volkern-customer-portal-secret-2026';

export type AuthenticatedHandler = (
  req: Request,
  auth: ApiKeyAuthResult,
  params?: any
) => Promise<Response>;

export interface WithAuthOptions {
  requiredScopes?: string[];
  requiredModule?: string;
}

export interface ApiKeyAuthResult {
  valid: boolean;
  tenant?: {
    id: string;
    nombre: string;
    slug: string;
    subdomain?: string | null;
    plan: string;
    accountType?: string;
    parentId?: string | null;
  };
  user?: {
    id: string;
    name: string | null;
    email: string;
    tenantId: string | null;
    roleId: string | null;
    role?: {
      id: string;
      nombre: string;
      permisos?: unknown;
    } | null;
    accountType?: string;
    parentId?: string | null;
  };
  apiKey?: {
    id: string;
    nombre: string;
    scopes: string[];
  };
  db?: PrismaClient;
  vaultSeed?: string;
  error?: string;
  authMethod?: 'session' | 'apikey';
  agencyContext?: boolean;
}

/**
 * Valida una API key y devuelve información del tenant y usuario
 * @param request - La request de Next.js
 * @param requiredScopes - Scopes requeridos (opcional)
 * @returns Resultado de la autenticación
 */
/**
 * LÓGICA DE LA REGLA DE ORO (Aislamiento Hierárquico)
 * Determina si el solicitante puede actuar sobre el tenant de destino.
 */
async function resolveHierarchicalContext(
  requesterUser: {
    id: string
    email: string
    role?: { id: string; nombre: string; permisos?: unknown } | null
  },
  requesterTenant: {
    id: string
    nombre: string
    slug: string
    subdomain?: string | null
    plan: string
    accountType?: string
  },
  targetTenantId?: string | null
): Promise<{ 
  activeTenantId: string; 
  targetTenant: {
    id: string
    nombre: string
    slug: string
    subdomain?: string | null
    plan: string
    accountType?: string
  };
  agencyContext: boolean;
  error?: string;
}> {
  // Por defecto, operamos en el tenant del solicitante
  let activeTenantId = requesterTenant.id;
  let targetTenant = {
    id: requesterTenant.id,
    nombre: requesterTenant.nombre,
    slug: requesterTenant.slug,
    subdomain: requesterTenant.subdomain,
    plan: requesterTenant.plan,
    accountType: requesterTenant.accountType
  };
  let agencyContext = false;

  // Si no hay targetTenantId, devolvemos el contexto nativo
  if (!targetTenantId || targetTenantId === requesterTenant.id) {
    return { activeTenantId, targetTenant, agencyContext };
  }

  // Si hay un target ID diferente, validamos permisos
  const impTenant = await prisma.tenant.findUnique({
    where: { id: targetTenantId },
    select: { id: true, nombre: true, slug: true, subdomain: true, plan: true, estado: true, parentId: true, accountType: true }
  });

  if (!impTenant) {
    return { activeTenantId, targetTenant, agencyContext, error: 'Tenant de destino no encontrado' };
  }

  // REGLA DE ORO:
  // 1. Superadmin puede entrar a cualquier tenant.
  // 2. Agencia puede entrar SOLO a sus propios slots (parentId === agency.id).
  const isSuperadmin = requesterUser.role?.nombre === 'Superadmin';
  const isParentAgency = requesterTenant.accountType === 'AGENCY' && impTenant.parentId === requesterTenant.id;

  if (isSuperadmin || isParentAgency) {
    if (impTenant.estado !== 'activo' && impTenant.estado !== 'trial') {
      return { activeTenantId, targetTenant, agencyContext, error: 'El tenant de destino está inactivo' };
    }

    activeTenantId = impTenant.id;
    targetTenant = {
      id: impTenant.id,
      nombre: impTenant.nombre,
      slug: impTenant.slug,
      subdomain: impTenant.subdomain,
      plan: impTenant.plan,
      accountType: impTenant.accountType
    };
    agencyContext = true;
  } else {
    return { activeTenantId, targetTenant, agencyContext, error: 'Violación de jerarquía: No tienes permiso para acceder a este tenant' };
  }

  return { activeTenantId, targetTenant, agencyContext };
}

/**
 * Valida una API key y devuelve información del tenant y usuario
 */
export async function validateApiKey(
  request: Request,
  requiredScopes?: string[]
): Promise<ApiKeyAuthResult> {
  try {
    const apiKey = extractApiKeyFromRequest(request);
    if (!apiKey) return { valid: false, error: 'API key no proporcionada' };

    if (!isValidApiKeyFormat(apiKey)) return { valid: false, error: 'Formato de API key inválido' };

    const keyHash = hashApiKey(apiKey);
    const dbApiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        nombre: true,
        scopes: true,
        activo: true,
        expiraEn: true,
        tenant: {
          select: { id: true, nombre: true, slug: true, subdomain: true, plan: true, accountType: true, parentId: true }
        },
        user: {
          select: { id: true, name: true, email: true, tenantId: true, roleId: true, role: true }
        }
      }
    });

    if (!dbApiKey || !dbApiKey.activo) return { valid: false, error: 'API key inválida o inactiva' };
    
    // Verificar expiración
    if (dbApiKey.expiraEn && dbApiKey.expiraEn < new Date()) {
      return { valid: false, error: 'API key expirada' };
    }

    // Verificar scopes
    if (requiredScopes?.length && !hasAnyScope(dbApiKey.scopes, requiredScopes)) {
      return { valid: false, error: `Permisos insuficientes (${requiredScopes.join(', ')})` };
    }

    // --- APLICAR REGLA DE ORO ---
    const url = new URL(request.url);
    const targetId = request.headers.get('X-Impersonate-Tenant-Id') || url.searchParams.get('target_account_id');
    
    const context = await resolveHierarchicalContext(dbApiKey.user, dbApiKey.tenant, targetId);

    if (context.error) {
      return { valid: false, error: context.error };
    }

    // Actualizar estadísticas (async)
    prisma.apiKey.update({
      where: { id: dbApiKey.id },
      data: { ultimoUso: new Date(), totalUsos: { increment: 1 } }
    }).catch(() => {});

    const { getTenantDb } = await import('./db');
    const tDb = await getTenantDb(context.activeTenantId);

    return {
      valid: true,
      authMethod: 'apikey',
      tenant: context.targetTenant,
      user: {
        id: dbApiKey.user.id,
        name: dbApiKey.user.name,
        email: dbApiKey.user.email,
        tenantId: dbApiKey.user.tenantId,
        roleId: dbApiKey.user.roleId,
        role: dbApiKey.user.role,
        accountType: dbApiKey.tenant.accountType,
        parentId: dbApiKey.tenant.parentId
      },
      apiKey: { id: dbApiKey.id, nombre: dbApiKey.nombre, scopes: dbApiKey.scopes },
      agencyContext: context.agencyContext,
      db: tDb.client,
      vaultSeed: (tDb as any).vaultSeed
    };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error({ err: error instanceof Error ? error : new Error(message) }, 'Error validando API key');
    return { valid: false, error: 'Error interno de autenticación' };
  }
}

/**
 * Autenticación dual: Intenta primero sesión, luego API Key
 */
export async function authenticateRequest(
  request: Request,
  requiredScopes?: string[]
): Promise<ApiKeyAuthResult> {
  try {
    // 🔒 VALIDACIÓN CRUZADA: Verificar que el subdominio coincida con el tenant
    const headerSubdomain = request.headers.get('x-tenant-subdomain');
    
    // 1. Intentar sesión (Solo si NO estamos en un entorno de tests sin Request Store)
    let session = null;
    try {
      session = await getServerSession(authOptions);
    } catch (e: unknown) {
      // IMPORTANTE: No capturar errores de Next.js que indican renderizado dinámico
      if (e instanceof Error && 'digest' in e && typeof (e as { digest: string }).digest === 'string' && (e as { digest: string }).digest.includes('DYNAMIC_SERVER_USAGE')) {
        throw e
      }
      logger.warn({ err: e instanceof Error ? e : undefined }, '[auth] getServerSession failed');
    }
    
    if (!session?.user?.id) {
      // No loguear warning durante el build si es un error de dynamic usage
    }

    if (session?.user?.id) {
      // Si hay subdominio en header (y no es vacío), verificar que coincida con el tenant del usuario
      // Solo aplicar validación estricta si hay un subdominio real (no localhost/vacío)
      if (headerSubdomain && headerSubdomain !== '' && headerSubdomain !== 'null' && (session.user as Record<string, unknown>).tenantSubdomain !== headerSubdomain) {
        logger.warn({ userEmail: session.user.email, headerSubdomain, tenantSubdomain: (session.user as Record<string, unknown>).tenantSubdomain }, '[Seguridad] Subdominio no coincide')
        return { valid: false, error: 'Acceso denegado: subdominio no coincide con tu cuenta' };
      }
      
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          tenantId: true,
          roleId: true,
          role: { select: { id: true, nombre: true, permisos: true } },
          tenant: { select: { id: true, nombre: true, slug: true, subdomain: true, plan: true, accountType: true } }
        }
      });

      if (!user || !user.tenant) {
        logger.warn({ userId: session.user.id }, '[auth] User or tenant not found');
        return { valid: false, error: 'Sesión inválida o expirada' };
      }

      // --- APLICAR REGLA DE ORO ---
      let impersonatedId = null;
      try {
        const cookieStore = cookies();
        impersonatedId = (cookieStore as any).get('volkern_impersonate_id')?.value;
      } catch (e) {}

      const headerId = request.headers.get('X-Impersonate-Tenant-Id');
      const targetId = headerId || impersonatedId;

      const context = await resolveHierarchicalContext(user, user.tenant, targetId);

      if (context.error) {
        logger.warn({ contextError: context.error }, '[auth] Hierarchical context error');
        return { valid: false, error: context.error };
      }

      const { getTenantDb } = await import('./db');
      const tDb = await getTenantDb(context.activeTenantId);

      return {
        valid: true,
        authMethod: 'session',
        tenant: context.targetTenant,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tenantId: user.tenantId,
          roleId: user.roleId,
          role: user.role,
          accountType: user.tenant.accountType
        },
        agencyContext: context.agencyContext,
        db: tDb.client,
        vaultSeed: (tDb as any).vaultSeed
      };
    }
  } catch (e: unknown) {
    // IMPORTANTE: No capturar errores de Next.js que indican renderizado dinámico
    if (e instanceof Error) {
      if ('digest' in e && typeof (e as { digest: string }).digest === 'string' && (e as { digest: string }).digest.includes('DYNAMIC_SERVER_USAGE')) {
        throw e
      }
      logger.warn({ err: e as Error }, '[auth] Falló intento de sesión')
    }
  }

  // 2. Intentar JWT (Customer Auth - app móvil)
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7);
    // Si no parece API key, probar como JWT
    if (!bearerToken.startsWith('vk_')) {
      try {
        const decoded: any = jwt.verify(bearerToken, CUSTOMER_JWT_SECRET);
        if (decoded && decoded.uid && decoded.tid) {
          // Cargar tenant
          const tenant = await prisma.tenant.findUnique({
            where: { id: decoded.tid },
            select: { id: true, nombre: true, slug: true, subdomain: true, plan: true, accountType: true }
          });

          if (!tenant) {
            logger.warn({ tenantId: decoded.tid }, '[auth] JWT: Tenant no encontrado');
            return { valid: false, error: 'Tenant no encontrado' };
          }

          // Cargar usuario - probar primero erp_customer_users, luego User
          let userData: {
            id: string; name: string | null; email: string;
            tenantId: string | null; roleId: string | null;
            role?: { id: string; nombre: string; permisos?: unknown } | null;
          } | null = null;

          const customerUser = await prisma.erp_customer_users.findUnique({
            where: { id: decoded.uid },
            select: { id: true, email: true, firstName: true, lastName: true, tenantId: true, role: true }
          });

          if (customerUser) {
            userData = {
              id: customerUser.id,
              name: [customerUser.firstName, customerUser.lastName].filter(Boolean).join(' ') || customerUser.email,
              email: customerUser.email,
              tenantId: customerUser.tenantId,
              roleId: null,
              role: { id: '', nombre: customerUser.role, permisos: null }
            };
          } else {
            const internalUser = await prisma.user.findUnique({
              where: { id: decoded.uid },
              select: {
                id: true, name: true, email: true, tenantId: true, roleId: true,
                role: { select: { id: true, nombre: true, permisos: true } }
              }
            });
            if (internalUser) {
              userData = internalUser;
            }
          }

          if (!userData) {
            logger.warn({ uid: decoded.uid }, '[auth] JWT: Usuario no encontrado');
            return { valid: false, error: 'Usuario no encontrado' };
          }

          const { getTenantDb } = await import('./db');
          const tDb = await getTenantDb(decoded.tid);

          return {
            valid: true,
            authMethod: 'session',
            tenant,
            user: {
              id: userData.id,
              name: userData.name,
              email: userData.email,
              tenantId: userData.tenantId,
              roleId: userData.roleId,
              role: userData.role,
              accountType: tenant.accountType
            },
            agencyContext: false,
            db: tDb.client,
            vaultSeed: (tDb as any).vaultSeed
          };
        }
      } catch (e: unknown) {
        // JWT inválido o expirado — continuar al fallback de API key
        logger.warn({ err: e instanceof Error ? e : undefined }, '[auth] JWT validation failed');
      }
    }
  }

  // 3. Si no hay sesión ni JWT, intentar API Key
  return await validateApiKey(request, requiredScopes);
}


/**
 * Wrapper HOC para rutas de API que necesitan aislamiento por Tenant
 */
export function withTenantAuth(
  handler: AuthenticatedHandler,
  options: string[] | WithAuthOptions = []
) {
  return async (request: Request, context?: any) => {
    try {
      const requiredScopes = Array.isArray(options) ? options : options.requiredScopes;
      const requiredModule = Array.isArray(options) ? undefined : options.requiredModule;

      const auth = await authenticateRequest(request, requiredScopes);

      if (!auth.valid) {
        return NextResponse.json(
          { error: auth.error || 'No autorizado' },
          { status: 401 }
        );
      }

      // 1. Validar Módulo Habilitado (Gating de Backend)
      if (requiredModule) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: auth.tenant!.id },
          select: { enabledModules: true, plan: true }
        });

        const isModuleEnabled = tenant?.enabledModules?.includes(requiredModule as string);
        
        if (!isModuleEnabled) {
          return NextResponse.json(
            { error: `El módulo '${requiredModule}' no está activo para esta cuenta.` }, 
            { status: 403 }
          );
        }
      }

      // Ejecutar el handler dentro del contexto del tenant
      // Esto hace que 'import { prisma }' use automáticamente la DB del tenant
      return await dbContext.run(
        { tenantId: auth.tenant!.id, client: auth.db, vaultSeed: auth.vaultSeed },
        () => handler(request, auth, context)
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      // IMPORTANTE: No capturar errores de Next.js que indican renderizado dinámico
      if (error instanceof Error && 'digest' in error && typeof (error as { digest: string }).digest === 'string' && (error as { digest: string }).digest.includes('DYNAMIC_SERVER_USAGE')) {
        throw error
      }
      logger.error({ err: error instanceof Error ? error : new Error(message) }, '[withTenantAuth] Error fatal');
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
        { tenantId: tenantId!, client: db.client },
        () => handler(request, tenantId!, context?.params)
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ err: error instanceof Error ? error : new Error(message) }, '[withPublicTenant] Error fatal');
      return NextResponse.json(
        { error: 'Error interno del servidor' },
        { status: 500 }
      );
    }
  };
}
