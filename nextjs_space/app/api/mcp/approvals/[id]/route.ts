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
import { resolvePublicBaseUrl } from '@/lib/seo/public-base-url';
import { ejecutarHerramientaAprobadaDelChat } from '@/lib/agents/tool-registry';
import {
  borrarProcesoPendiente,
  cargarProcesoPendiente,
  reanudarProcesoAprobado,
} from '@/lib/agents/proceso-pendiente';
import {
  auditApprovalOutcome,
  claimApproval,
  completeApproval,
  VIA_CHAT,
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

    if (claim.status === 'code_required') {
      // `ask_code`: la acción exige el código de 6 dígitos enviado al WhatsApp
      // del negocio. Aprobar desde la bandeja la ejecutaría sin ese segundo
      // factor, así que solo se ofrece el enlace de verificación.
      const token = claim.approval.whatsappVerificationToken;
      return NextResponse.json(
        {
          error:
            'Esta solicitud exige el código de 6 dígitos enviado al WhatsApp del negocio. Valídalo en el enlace de verificación para ejecutarla.',
          status: 'code_required',
          approvalId: claim.approval.id,
          ...(token
            ? {
                verificationToken: token,
                verificationUrl: `${resolvePublicBaseUrl(request)}/mcp/autorizar/${token}`,
              }
            : {}),
        },
        { status: 409 }
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
      // El proceso que esperaba esta aprobación no se reanuda: se descarta.
      await borrarProcesoPendiente(claim.approval.id);

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

    let result: unknown;
    let ok = false;

    // Si la solicitud pausó un proceso orquestado, guarda su hilo: la acción
    // aprobada debe caer en la misma clave de idempotencia del turno.
    const pendiente =
      approval.via === VIA_CHAT
        ? await cargarProcesoPendiente({
            approvalId: approval.id,
            tenantId,
            userId: approval.requestedById,
          })
        : null;

    if (approval.via === VIA_CHAT) {
      // Herramienta del agente del chat (clase C/D): se ejecuta por el registro
      // del agente, no por `handleCallTool`, que sólo resuelve tools del catálogo.
      // La identidad sigue siendo la de quien la pidió, no la de quien aprueba.
      try {
        result = await ejecutarHerramientaAprobadaDelChat({
          tenantId: approval.tenantId,
          userId: approval.requestedById,
          toolName: approval.toolName,
          args: (approval.arguments ?? {}) as Record<string, any>,
          conversacionId: pendiente?.conversacionId,
        });
        ok = true;
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) };
        ok = false;
      }
    } else {
      const respuesta = await handleCallTool({
        name: approval.toolName,
        arguments: {
          ...(approval.arguments ?? {}),
          tenantId: approval.tenantId,
          userId: approval.requestedById,
          source: 'mcp',
        },
      });

      const text = respuesta.content?.[0]?.text;
      result = (() => {
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      })();
      ok = !respuesta.isError;
    }

    await completeApproval({ approvalId: approval.id, ok, result: result as never });

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

    // Proceso pausado: con la acción ya ejecutada se corren los pasos que
    // quedaban. Si la ejecución falló, el proceso se descarta.
    let proceso: unknown = null;
    if (pendiente) {
      if (ok) {
        try {
          proceso = await reanudarProcesoAprobado({
            approvalId: approval.id,
            tenantId,
            userId: approval.requestedById,
          });
        } catch (error) {
          // La aprobación ya está completada: un fallo al reanudar no la revierte.
          await borrarProcesoPendiente(approval.id);
          console.error('[MCP approvals] Error reanudando el proceso:', error);
        }
      } else {
        await borrarProcesoPendiente(approval.id);
      }
    }

    return NextResponse.json({
      success: ok,
      status: ok ? 'executed' : 'failed',
      approvalId: approval.id,
      toolName: approval.toolName,
      result,
      proceso,
    });
  } catch (error) {
    console.error('[MCP approvals] Error resolviendo:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}, ['mcp:admin']);
