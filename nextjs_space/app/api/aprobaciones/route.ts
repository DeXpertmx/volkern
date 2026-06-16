import { NextRequest, NextResponse } from 'next/server';
import { ApprovalWorkflowService } from '@/lib/approval-workflow-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/* GET /api/aprobaciones — Listar solicitudes de aprobación */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session?.user?.tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'pending';
    const userRole = searchParams.get('role') || undefined;
    const userId = searchParams.get('userId') || undefined;

    let data;
    const stats = await ApprovalWorkflowService.getStats(session.user.tenantId);

    if (type === 'history') {
      data = await ApprovalWorkflowService.getApprovalHistory(session.user.tenantId);
    } else if (type === 'mine' && userId) {
      data = await ApprovalWorkflowService.getUserRequests(session.user.tenantId, userId);
    } else {
      data = await ApprovalWorkflowService.getPendingApprovals(session.user.tenantId, userRole);
    }

    const rules = ApprovalWorkflowService.getRules();

    return NextResponse.json({
      success: true,
      data,
      stats,
      rules,
    });
  } catch (error: any) {
    console.error('[API] Error listing approvals:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}

/* POST /api/aprobaciones — Crear solicitud de aprobación */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session?.user?.tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { category, title, description, amount, currency, entityId, entityType, metadata } = body;

    if (!category || !title || !description) {
      return NextResponse.json({ error: 'category, title y description son requeridos' }, { status: 400 });
    }

    const result = await ApprovalWorkflowService.checkAndRequestApproval({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      category,
      title,
      description,
      amount,
      currency,
      entityId,
      entityType,
      metadata,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[API] Error creating approval:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
