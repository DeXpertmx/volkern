import { prisma, dbContext, DbStore } from './db';
import { getToken } from 'next-auth/jwt';
import { cookies, headers } from 'next/headers';
import type { NextRequest } from 'next/server';

export interface TenantContextData {
  tenantId: string;
  tenant?: {
    id: string;
    nombre: string;
    slug: string;
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
      nombre: string;
      permisos?: any;
    };
  };
  role?: string;
  source?: 'header' | 'session' | 'subdomain' | 'apikey';
  requestId?: string;
  startedAt?: Date;
}

let tenantContextStore: TenantContextData | null = null;

export function setTenantContext(context: TenantContextData): void {
  tenantContextStore = context;
}

export function getTenantContext(): TenantContextData | null {
  const store = dbContext.getStore() as DbStore | undefined;    if (store?.tenantId) {
    return {
      tenantId: store.tenantId,
      tenant: (store as any).tenant,
      source: (store as any).source
    };
  }
  return tenantContextStore;
}

export function clearTenantContext(): void {
  tenantContextStore = null;
}

export async function setTenantContextFromRequest(
  tenantId: string,
  user?: TenantContextData['user']
): Promise<TenantContextData> {
  const context: TenantContextData = {
    tenantId,
    user,
    tenant: user?.tenantId ? {
      id: user.tenantId,
      nombre: '',
      slug: '',
      plan: ''
    } : undefined,
    source: 'header',
    startedAt: new Date()
  };
  setTenantContext(context);
  return context;
}

export async function withTenantContext<T>(
  fn: () => Promise<T>,
  tenantId: string,
  user?: TenantContextData['user']
): Promise<T> {
  return dbContext.run(
    { tenantId, client: undefined },
    fn
  );
}

export async function extractTenantFromRequest(request: NextRequest): Promise<{
  tenantId: string | null;
  source: TenantContextData['source'];
  user?: TenantContextData['user'];
  error?: string;
}> {
  try {
    const xTenantId = request.headers.get('x-tenant-id');
    if (xTenantId) {
      return { tenantId: xTenantId, source: 'header' };
    }
  } catch {}

  try {
    const headerStore = await headers();
    const xTenantId = headerStore.get('x-tenant-id');
    if (xTenantId) {
      return { tenantId: xTenantId, source: 'header' };
    }
  } catch {}

  try {
    const token = await getToken({ secret: process.env.NEXTAUTH_SECRET } as any);
    if (token?.tenantId) {
      const user = await prisma.user.findUnique({
        where: { id: token.sub! },
        select: {
          id: true,
          name: true,
          email: true,
          tenantId: true,
          roleId: true,
          role: { select: { nombre: true, permisos: true } }
        }
      });
      return {
        tenantId: token.tenantId as string,
        source: 'session',
        user: user as any
      };
    }
  } catch {}

  try {
    const cookieStore = cookies();
    const subdomain = cookieStore.get('x-tenant-subdomain')?.value ||
                    cookieStore.get('TenantSubdomain')?.value;
    if (subdomain) {
      const tenant = await prisma.tenant.findFirst({
        where: { subdomain },
        select: { id: true }
      });
      if (tenant) {
        return { tenantId: tenant.id, source: 'subdomain' };
      }
    }
  } catch {}

  const apiKey = request.headers.get('x-api-key') ||
                request.headers.get('authorization')?.replace('Bearer ', '');
  if (apiKey && apiKey.startsWith('vk_')) {
    const keyData = await validateApiKeyForTenant(apiKey);
    if (keyData) {
      return { tenantId: keyData.tenantId, source: 'apikey', user: keyData.user as any };
    }
  }

  return { tenantId: null, source: 'header' };
}

async function validateApiKeyForTenant(apiKey: string) {
  try {
    const { validateApiKey } = await import('./api-key-auth');
    const result = await validateApiKey(new Request('http://localhost'), []);
    if (result.valid && result.tenant) {
      return {
        tenantId: result.tenant.id,
        user: result.user
      };
    }
  } catch {}
  return null;
}

export async function requireTenantContext(): Promise<TenantContextData> {
  const context = getTenantContext();
  if (!context?.tenantId) {
    throw new Error('No tenant context available');
  }
  return context;
}

export function createMiddlewareTenantHandler() {
  return async function tenantMiddleware(request: NextRequest) {
    const { tenantId, source, user, error } = await extractTenantFromRequest(request);

    if (!tenantId && !error) {
      const host = request.headers.get('host') || '';
      const subdomain = extractSubdomain(host);
      if (subdomain) {
        const tenant = await prisma.tenant.findFirst({
          where: { subdomain },
          select: { id: true }
        });
        if (tenant) {
          return { tenantId: tenant.id, source: 'subdomain' };
        }
      }
    }

    return { tenantId, source, user, error };
  };
}

function extractSubdomain(host: string): string | null {
  if (!host) return null;
  const h = host.replace(/:.*/, '');
  if (h === 'localhost' || h.endsWith('localhost')) return h.split('.')[0];
  if (h.includes('.volkern.app')) return h.split('.')[0];
  return null;
}

export const tenantContextMiddleware = createMiddlewareTenantHandler();