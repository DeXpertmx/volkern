export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { rateLimiter, RateLimitAction } from '@/lib/rate-limiter';
import { globalPrisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

async function getAuthenticatedTenantId(req: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (session?.user?.tenantId) {
    return session.user.tenantId;
  }

  return req.headers.get('x-tenant-id');
}

async function isAdmin(tenantId: string): Promise<boolean> {
  if (!tenantId) return false;
  
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });

  return tenant?.plan === 'pro-agency' || tenant?.plan === 'profesional';
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getAuthenticatedTenantId(req);
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Tenant ID required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') as RateLimitAction | null;

    let result: Record<string, any>;

    if (action) {
      const checkResult = await rateLimiter.checkLimit(tenantId, action);
      result = {
        action,
        ...checkResult,
      };
    } else {
      result = await rateLimiter.getAllLimits(tenantId);
    }

    const effectiveLimit = await rateLimiter.getEffectiveLimit(tenantId, 'api_request_day');

    return NextResponse.json({
      tenantId,
      rateLimits: result,
      effectivePlanLimit: effectiveLimit,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[RateLimits] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to fetch rate limits' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getAuthenticatedTenantId(req);
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Tenant ID required' },
        { status: 401 }
      );
    }

    const admin = await isAdmin(tenantId);
    if (!admin) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { action, resetAll } = body;

    if (resetAll) {
      const actions = [
        'api_request_minute',
        'api_request_hour',
        'api_request_day',
        'message_send_day',
        'email_send_day',
        'whatsapp_message_day',
        'file_upload_day',
        'ai_request_day',
      ] as RateLimitAction[];

      for (const act of actions) {
        await rateLimiter.reset(tenantId, act);
      }

      return NextResponse.json({
        success: true,
        message: 'All rate limits reset successfully',
        tenantId,
      });
    }

    if (!action) {
      return NextResponse.json(
        { error: 'Bad request', message: 'Action is required' },
        { status: 400 }
      );
    }

    await rateLimiter.reset(tenantId, action);

    return NextResponse.json({
      success: true,
      message: `Rate limit for ${action} reset successfully`,
      tenantId,
      action,
    });
  } catch (error) {
    console.error('[RateLimits] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to reset rate limit' },
      { status: 500 }
    );
  }
}