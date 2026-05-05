import { NextRequest, NextResponse } from 'next/server';
import { AuditService } from '@/lib/audit-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await isAdminRequest(request);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const tenantId = url.searchParams.get('tenantId');
    const format = url.searchParams.get('format') || 'json';

    if (!userId || !tenantId) {
      return NextResponse.json(
        { error: 'Missing required parameters: userId, tenantId' },
        { status: 400 }
      );
    }

    const exportData = await AuditService.getUserDataExport(userId, tenantId);

    if (format === 'csv') {
      const headers = ['ID', 'Action', 'Entity', 'Entity ID', 'Description', 'Timestamp', 'IP Address'].join(',');
      const rows = exportData.entries.map((e: any) =>
        [e.id, e.action, e.entity, e.entityId, `"${(e.description || '').replace(/"/g, '""')}"`, e.timestamp, e.ipAddress || ''].join(',')
      );

      return new NextResponse([headers, ...rows].join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="user-data-export-${userId}-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    return NextResponse.json(exportData);
  } catch (error) {
    console.error('[GET /api/admin/audit/gdpr/export] Error:', error);
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