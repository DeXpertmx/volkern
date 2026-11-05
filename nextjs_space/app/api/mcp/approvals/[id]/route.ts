export const dynamic = 'force-dynamic';

/**
 * Resolución de una solicitud de aprobación del gate MCP.
 *
 * POST /api/mcp/approvals/[id]  { action: 'approve' | 'reject', reason?: string }
 *
 * Tres garantías que importan más que el resto del endpoint:
 *
 *  1. **Ejecución única.** `claimApproval` bloquea la fila con
 *     `SELECT … FOR UPDATE` y exige `status = 'pending'`. Dos personas pulsando
 *     "aprobar" a la vez, o un reintento del agente, producen una sola
 *     ejecución: la segunda encuentra el estado cambiado y recibe 409.
 *  2. **Separación de funciones.** Quien pidió no puede aprobar.
 *  3. **Atribución.** La herramienta se ejecuta con la identidad de quien la
 *     pidió, no con la de quien aprueba: aprobar no es actuar, y el audit log
 *     debe seguir diciendo que el cambio lo hizo el vendedor.
 */

import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { handleCallTool } from '@/lib/mcp/mcp-handler';
import { roleKind } from '@/lib/mcp/tool-policy';
import {
  auditApprovalOutcome,
  claimApproval,
  completeApproval,
} from '@/lib/mcp/tool-gate';

export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant?.id;
    const resolverId = auth.user?.id;

    if (!tenantId || !resolverId) {
      return NextResponse.json({ error: 'Credencial sin empresa o usuario' }, { status: 403 });
    }

    const kind = roleKind(auth.user?.role?.nombre);
    if (kind !== 'owner' && kind !== 'admin') {
      return NextResponse.json(
        { error: 'Sólo un responsable (owner o admin) puede resolver aprobaciones.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Acción inválida. Usa { action: "approve" } o { action: "reject" }.' },
        { status: 400 }
      );
    }

    const claim = await claimApproval({
      approvalId: params.id,
      tenantId,
      resolverId,
      action,
    });

    if (claim.status === 'not_found') {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    if (claim.status === 'self_approval') {
      return NextResponse.json(
        { error: 'Quien solicita la acción no puede aprobarla: hace falta otra persona.' },
        { status: 403 }
      );
    }

    if (claim.status === 'expired') {
      return NextResponse.json(
        { error: 'La solicitud caducó y no se ha ejecutado.', status: 'expired' },
        { status: 410 }
      );
    }

    if (claim.status === 'conflict') {
      return NextResponse.json(
        {
          error: 'La solicitud ya no está pendiente: se resolvió en otra petición.',
          status: claim.approval.status,
        },
        { status: 409 }
      );
    }

    if (claim.status === 'rejected') {
      await auditApprovalOutcome({
        tenantId,
        userId: resolverId,
        toolName: claim.approval.toolName,
        accion: 'MCP_tool_rejected',
        approvalId: claim.approval.id,
        detalle: `Rechazada ${claim.approval.toolName}`,
        metadata: { requestedById: claim.approval.requestedById },
      });

      return NextResponse.json({
        success: true,
        status: 'rejected',
        approvalId: claim.approval.id,
        toolName: claim.approval.toolName,
      });
    }

    // approved → ejecutar UNA vez, con la identidad del solicitante.
    const approval = claim.approval;

    const result = await handleCallTool({
      name: approval.toolName,
      arguments: {
        ...(approval.arguments ?? {}),
        tenantId: approval.tenantId,
        userId: approval.requestedById,
        source: 'mcp',
      },
    });

    const parsed = (() => {
      const text = result.content?.[0]?.text;
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    })();

    const ok = !result.isError;

    await completeApproval({ approvalId: approval.id, ok, result: parsed });

    await auditApprovalOutcome({
      tenantId,
      userId: resolverId,
      toolName: approval.toolName,
      accion: 'MCP_tool_approval_executed',
      approvalId: approval.id,
      detalle: `${ok ? 'Ejecutada' : 'Falló'} ${approval.toolName} tras aprobación`,
      metadata: {
        requestedById: approval.requestedById,
        roleName: approval.roleName,
        ok,
      },
    });

    return NextResponse.json({
      success: ok,
      status: ok ? 'executed' : 'failed',
      approvalId: approval.id,
      toolName: approval.toolName,
      result: parsed,
    });
  } catch (error) {
    console.error('[MCP approvals] Error resolviendo:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}, ['mcp:admin']);
