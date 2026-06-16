import { NextRequest, NextResponse } from 'next/server';
import { ApprovalWorkflowService } from '@/lib/approval-workflow-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/* PATCH /api/aprobaciones/[id] — Aprobar o rechazar */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session?.user?.tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { action, note } = body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Acción inválida. Use "approve" o "reject"' }, { status: 400 });
    }

    if (action === 'reject' && !note) {
      return NextResponse.json({ error: 'Debe proporcionar un motivo de rechazo' }, { status: 400 });
    }

    let result;
    if (action === 'approve') {
      result = await ApprovalWorkflowService.approve(id, session.user.id, note);
    } else {
      result = await ApprovalWorkflowService.reject(id, session.user.id, note || 'Rechazado');
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: action === 'approve' ? '✅ Solicitud aprobada correctamente' : '❌ Solicitud rechazada',
    });
  } catch (error: any) {
    console.error('[API] Error processing approval:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
