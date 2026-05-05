import { NextRequest, NextResponse } from 'next/server';
import { AuditService, AuditFilters } from '@/lib/audit-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await isAdminRequest(request);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const url = new URL(request.url);
    const format = (url.searchParams.get('format') || 'json') as 'json' | 'csv';
    const tenantId = url.searchParams.get('tenantId');
    const userId = url.searchParams.get('userId');
    const entity = url.searchParams.get('entity');
    const entityId = url.searchParams.get('entityId');
    const action = url.searchParams.get('action');
    const fromDate = url.searchParams.get('fromDate');
    const toDate = url.searchParams.get('toDate');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing required parameter: tenantId' },
        { status: 400 }
      );
    }

    const filters: AuditFilters = {
      tenantId,
      ...(userId && { userId }),
      ...(entity && { entity }),
      ...(entityId && { entityId }),
      ...(action && { action }),
      ...(fromDate && { fromDate: new Date(fromDate) }),
      ...(toDate && { toDate: new Date(toDate) })
    };

    const data = await AuditService.exportAuditTrail(filters, format);

    if (format === 'csv') {
      return new NextResponse(data as string, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-export-${tenantId}-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    return NextResponse.json({
      success: true,
      exportDate: new Date().toISOString(),
      ...(data as any)
    });
  } catch (error) {
    console.error('[GET /api/admin/audit/export] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function isAdminRequest(request: NextRequest): Promise<{ ok: boolean; error?: string }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, error: 'Missing authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');
  const adminKey = process.env.INTERNAL_API_KEY;

  if (!adminKey || token !== adminKey) {
    return { ok: false, error: 'Invalid authorization token' };
  }

  return { ok: true };
}