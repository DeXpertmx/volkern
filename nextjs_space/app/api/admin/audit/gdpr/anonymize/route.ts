import { NextRequest, NextResponse } from 'next/server';
import { AuditService } from '@/lib/audit-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authResult = await isAdminRequest(request);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const body = await request.json();
    const { userId, tenantId } = body;

    if (!userId || !tenantId) {
      return NextResponse.json(
        { error: 'Missing required parameters: userId, tenantId' },
        { status: 400 }
      );
    }

    const result = await AuditService.anonymizeUserData(userId, tenantId);

    await AuditService.log({
      tenantId,
      userId: 'system-gdpr',
      action: 'GDPR_ANONYMIZE',
      entity: 'user',
      entityId: userId,
      description: `User data anonymized for GDPR compliance - ${result.anonymizedCount} audit entries affected`,
      metadata: { gdprAction: 'right_to_be_forgotten', originalUserId: userId }
    });

    return NextResponse.json({
      success: true,
      message: 'User data anonymized successfully',
      anonymizedCount: result.anonymizedCount
    });
  } catch (error) {
    console.error('[POST /api/admin/audit/gdpr/anonymize] Error:', error);
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