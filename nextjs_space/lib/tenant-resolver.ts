import { prisma, dbContext, DbStore } from './db';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { cookies, headers } from 'next/headers';

export interface ResolvedTenant {
  tenantId: string;
  source: 'header' | 'session' | 'subdomain' | 'apikey';
  valid: boolean;
  user?: {
    id: string;
    name: string | null;
    email: string;
    tenantId: string | null;
    roleId: string | null;
    role?: { nombre: string };
  };
  error?: string;
}

export async function resolveTenantFromRequest(
  request: NextRequest
): Promise<ResolvedTenant> {
  let tenantId: string | null = null;
  let source: ResolvedTenant['source'] = 'header';
  let user: ResolvedTenant['user'];
  let error: string | undefined;

  try {
    const headerStore = await headers();
    const xTenantId = headerStore.get('x-tenant-id');
    if (xTenantId) {
      tenantId = xTenantId;
      source = 'header';
    }
  } catch {}

  if (!tenantId) {
    try {
      const xTenantId = request.headers.get('x-tenant-id');
      if (xTenantId) {
        tenantId = xTenantId;
        source = 'header';
      }
    } catch {}
  }

  if (!tenantId) {
    try {
      const token = await getToken({ secret: process.env.NEXTAUTH_SECRET });
      if (token?.tenantId) {
        tenantId = token.tenantId as string;
        source = 'session';

        const sessionUser = await prisma.user.findUnique({
          where: { id: token.sub! },
          select: {
            id: true,
            name: true,
            email: true,
            tenantId: true,
            roleId: true,
            role: { select: { nombre: true } }
          }
        });
        user = sessionUser as any;
      }
    } catch {}
  }

  if (!tenantId) {
    try {
      const cookieStore = cookies();
      const subdomain = cookieStore.get('x-tenant-subdomain')?.value;
      if (subdomain) {
        const tenant = await prisma.tenant.findFirst({
          where: { subdomain },
          select: { id: true }
        });
        if (tenant) {
          tenantId = tenant.id;
          source = 'subdomain';
        }
      }
    } catch {}
  }

  if (!tenantId) {
    const host = request.headers.get('host') || '';
    const subdomain = extractSubdomain(host);
    if (subdomain) {
      const tenant = await prisma.tenant.findFirst({
        where: { subdomain },
        select: { id: true }
      });
      if (tenant) {
        tenantId = tenant.id;
        source = 'subdomain';
      }
    }
  }

  if (!tenantId) {
    const apiKey = request.headers.get('x-api-key') ||
                   request.headers.get('authorization')?.replace('Bearer ', '');
    if (apiKey && apiKey.startsWith('vk_')) {
      const result = await resolveApiKeyTenant(apiKey);
      if (result) {
        tenantId = result.tenantId;
        source = 'apikey';
        user = result.user;
      }
    }
  }

  if (!tenantId) {
    return {
      tenantId: '',
      source: 'header',
      valid: false,
      error: 'Unable to resolve tenant from request'
    };
  }

  return {
    tenantId,
    source,
    valid: true,
    user
  };
}

async function resolveApiKeyTenant(apiKey: string): Promise<{
  tenantId: string;
  user?: ResolvedTenant['user'];
} | null> {
  try {
    const { validateApiKey } = await import('./api-key-auth');
    const result = await validateApiKey(new Request('http://localhost'), []);
    if (result.valid && result.tenant) {
      return {
        tenantId: result.tenant.id,
        user: result.user as any
      };
    }
  } catch {}
  return null;
}

function extractSubdomain(host: string): string | null {
  if (!host) return null;
  const h = host.replace(/:.*/, '');
  if (h === 'localhost' || h.endsWith('localhost')) {
    const parts = h.split('.');
    return parts.length > 1 ? parts[0] : null;
  }
  if (h.includes('.volkern.app')) {
    return h.split('.')[0];
  }
  return null;
}

export async function validateTenantAccess(
  tenantId: string,
  userId: string
): Promise<{
  allowed: boolean;
  error?: string;
}> {
  if (!tenantId || !userId) {
    return { allowed: false, error: 'Missing tenantId or userId' };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      tenantId: true,
      role: { select: { nombre: true } }
    }
  });

  if (!user) {
    return { allowed: false, error: 'User not found' };
  }

  if (user.role?.nombre === 'Superadmin') {
    return { allowed: true };
  }

  if (user.tenantId !== tenantId) {
    return {
      allowed: false,
      error: 'User does not belong to this tenant'
    };
  }

  return { allowed: true };
}

export async function validateTenantHierarchy(
  requesterTenantId: string,
  targetTenantId: string
): Promise<{
  allowed: boolean;
  error?: string;
  reason?: string;
}> {
  if (requesterTenantId === targetTenantId) {
    return { allowed: true };
  }

  const requester = await prisma.tenant.findUnique({
    where: { id: requesterTenantId },
    select: { accountType: true, parentId: true }
  });

  const target = await prisma.tenant.findUnique({
    where: { id: targetTenantId },
    select: { estado: true, parentId: true }
  });

  if (!requester || !target) {
    return { allowed: false, error: 'Tenant not found' };
  }

  if (requester.accountType === 'AGENCY' && target.parentId === requesterTenantId) {
    if (target.estado !== 'activo' && target.estado !== 'trial') {
      return { allowed: false, error: 'Target tenant is inactive' };
    }
    return { allowed: true, reason: 'agency_context' };
  }

  if (requester.accountType === 'SUPERADMIN') {
    return { allowed: true, reason: 'superadmin_context' };
  }

  return {
    allowed: false,
    error: 'Cross-tenant access denied'
  };
}

export async function getTenantFromSubdomain(subdomain: string): Promise<string | null> {
  if (!subdomain) return null;

  const tenant = await prisma.tenant.findFirst({
    where: { subdomain },
    select: { id: true }
  });

  return tenant?.id || null;
}

export async function getTenantFromApiKey(apiKey: string): Promise<{
  tenantId: string;
  user?: ResolvedTenant['user'];
} | null> {
  if (!apiKey || !apiKey.startsWith('vk_')) return null;
  return resolveApiKeyTenant(apiKey);
}