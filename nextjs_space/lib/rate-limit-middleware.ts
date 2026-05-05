import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter, RateLimitAction, RateLimitResult } from './rate-limiter';
import { getCurrentTenantId } from './db';

export interface RateLimitOptions {
  action: RateLimitAction;
  customLimit?: number;
  skip?: (req: NextRequest) => boolean;
}

export async function applyRateLimit(
  req: NextRequest,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  if (options.skip?.(req)) {
    return null;
  }

  const tenantId = getCurrentTenantId() || req.headers.get('x-tenant-id');
  
  if (!tenantId) {
    return NextResponse.json(
      { error: 'Tenant ID required' },
      { status: 401 }
    );
  }

  const result: RateLimitResult = await rateLimiter.checkLimit(
    tenantId,
    options.action,
    options.customLimit
  );

  const response = NextResponse.next();
  
  response.headers.set('X-RateLimit-Limit', result.limit.toString());
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  response.headers.set('X-RateLimit-Reset', result.resetAt.toISOString());

  if (!result.allowed) {
    const errorResponse = NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: `Has alcanzado el límite de ${result.limit} solicitudes. Intenta de nuevo en ${Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)} segundos.`,
        code: 'RATE_LIMIT_EXCEEDED',
        details: {
          limit: result.limit,
          remaining: 0,
          resetAt: result.resetAt.toISOString(),
        },
      },
      { status: 429 }
    );

    errorResponse.headers.set('X-RateLimit-Limit', result.limit.toString());
    errorResponse.headers.set('X-RateLimit-Remaining', '0');
    errorResponse.headers.set('X-RateLimit-Reset', result.resetAt.toISOString());
    errorResponse.headers.set('Retry-After', Math.ceil((result.resetAt.getTime() - Date.now()) / 1000).toString());

    return errorResponse;
  }

  return null;
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  return async (req: NextRequest): Promise<NextResponse | null> => {
    return applyRateLimit(req, options);
  };
}

export const RATE_LIMIT_ACTIONS = {
  API_MINUTE: 'api_request_minute' as RateLimitAction,
  API_HOUR: 'api_request_hour' as RateLimitAction,
  API_DAY: 'api_request_day' as RateLimitAction,
  MESSAGE_SEND: 'message_send_day' as RateLimitAction,
  EMAIL_SEND: 'email_send_day' as RateLimitAction,
  WHATSAPP: 'whatsapp_message_day' as RateLimitAction,
  FILE_UPLOAD: 'file_upload_day' as RateLimitAction,
  AI_REQUEST: 'ai_request_day' as RateLimitAction,
} as const;

export function withRateLimit<T extends (...args: any[]) => any>(
  handler: T,
  options: RateLimitOptions
): T {
  return (async (req: NextRequest, ...args: any[]) => {
    const rateLimitResult = await applyRateLimit(req, options);
    if (rateLimitResult) {
      return rateLimitResult;
    }
    return handler(req, ...args);
  }) as T;
}