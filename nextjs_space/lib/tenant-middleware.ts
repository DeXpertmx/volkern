import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { resolveTenantFromRequest, validateTenantAccess, validateTenantHierarchy } from './tenant-resolver';
import { setCurrentTenantId, getCurrentTenantId } from './db';
import { AuditService } from './audit-service';

const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'auth', 'login', 'register', 
  'dashboard', 'webcreator', 'admin', 'docs'
]);

const PUBLIC_PATHS = new Set([
  '/', '/pricing', '/features', '/about', '/contact', 
  '/api/public', '/api/health', '/api/auth/login'
]);

export async function tenantMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';

  if (pathname.startsWith('/api/auth') || pathname === '/') {
    return NextResponse.next();
  }

  if (pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const subdomain = extractSubdomain(host);
  if (!subdomain || RESERVED_SUBDOMAINS.has(subdomain)) {
    if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/api/public')) {
      return NextResponse.next();
    }
  }

  if (!subdomain) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export async function tenantValidationMiddleware(
  request: NextRequest,
  options: {
    requireAuth?: boolean;
    requiredScopes?: string[];
    allowPublic?: boolean;
  } = {}
) {
  const { requireAuth = true, allowPublic = false } = options;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/auth') || pathname.startsWith('/_next')) {
    return { valid: true };
  }

  if (allowPublic && pathname.startsWith('/api/public')) {
    return { valid: true };
  }

  const resolved = await resolveTenantFromRequest(request);

  if (!resolved.valid) {
    if (requireAuth) {
      return {
        valid: false,
        error: 'Tenant context required',
        status: 401
      };
    }
    return { valid: true };
  }

  setCurrentTenantId(resolved.tenantId);

  const user = resolved.user;
  if (requireAuth && !user && resolved.source !== 'session') {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return {
        valid: false,
        error: 'Authentication required',
        status: 401
      };
    }

    const accessCheck = await validateTenantAccess(resolved.tenantId, token.sub!);
    if (!accessCheck.allowed) {
      return {
        valid: false,
        error: accessCheck.error || 'Access denied',
        status: 403
      };
    }
  }

  await trackTenantRequest(request, resolved);

  return {
    valid: true,
    tenantId: resolved.tenantId,
    source: resolved.source,
    user
  };
}

async function trackTenantRequest(
  request: NextRequest,
  resolved: { tenantId: string; source: string; user?: any }
) {
  try {
    const startTime = Date.now();
    const requestId = request.headers.get('x-request-id') || 
                   `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const userId = resolved.user?.id || 'SYSTEM';
    
    await (AuditService.log as any)({
      tenantId: resolved.tenantId,
      userId,
      action: `REQUEST_${request.method}`,
      resourceType: 'API_REQUEST',
      resourceId: requestId,
      details: `${request.nextUrl.pathname} - ${resolved.source}`,
      metadata: {
        method: request.method,
        path: request.nextUrl.pathname,
        source: resolved.source,
        duration: 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[tenantMiddleware] Failed to track request:', error);
  }
}

function extractSubdomain(host: string): string | null {
  if (!host) return null;
  const h = host.replace(/:.*/, '');
  if (h === 'localhost' || h.endsWith('localhost')) return null;
  if (h.includes('.volkern.app')) return h.split('.')[0];
  if (h.includes('.volkern.com')) return h.split('.')[0];
  return null;
}

export function createTenantValidationHandler(
  options?: {
    requireAuth?: boolean;
    requiredScopes?: string[];
    allowPublic?: boolean;
  }
) {
  return async (request: NextRequest) => {
    return tenantValidationMiddleware(request, options || {});
  };
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ],
};