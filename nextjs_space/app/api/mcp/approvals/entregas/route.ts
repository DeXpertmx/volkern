export const dynamic = 'force-dynamic';

/**
 * Envíos de WhatsApp aprobados cuyo desenlace de entrega sigue abierto.
 *
 * GET  /api/mcp/approvals/entregas?limit=50
 * POST /api/mcp/approvals/entregas { approvalId, action, confirmoRiesgoDeDuplicado? }
 *
 * El ACK de Evolution cierra solo la mayoría de los envíos; esto es la salida
 * administrativa para los que no llegan a confirmarse: consultarlos, fijar a
 * mano si se entregaron y, si consta que no, reenviar. El reenvío no ejecuta
 * nada por su cuenta: vuelve a pasar por el gate, que exige aprobación (y el
 * código de WhatsApp en los envíos externos) otra vez.
 */

import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import { enforceToolGate } from '@/lib/mcp/tool-gate';
import { roleKind } from '@/lib/mcp/tool-policy';
import { resolverEntregaManual } from '@/lib/mcp/whatsapp-entrega';

const HERRAMIENTA_ENVIO = 'volkern_send_whatsapp';
const MAXIMO_LISTA = 100;

/** Solo owner/admin ven y resuelven envíos: los argumentos son datos del CRM. */
function esResponsable(auth: any): boolean {
  const kind = roleKind(auth?.user?.role?.nombre);
  return kind === 'owner' || kind === 'admin';
}

function vistaDeEnvio(solicitud: {
  id: string;
  status: string;
  whatsappMessageId: string | null;
  entregaEstado: string | null;
  entregaActualizadaEn: Date | null;
  createdAt: Date;
  executedAt: Date | null;
  arguments: unknown;
}) {
  const args = (solicitud.arguments ?? {}) as Record<string, unknown>;
  const mensaje = String(args.message ?? args.mensaje ?? args.contenido ?? '');
  return {
    id: solicitud.id,
    status: solicitud.status,
    whatsappMessageId: solicitud.whatsappMessageId,
    entregaEstado: solicitud.entregaEstado,
    entregaActualizadaEn: solicitud.entregaActualizadaEn,
    createdAt: solicitud.createdAt,
    executedAt: solicitud.executedAt,
    leadId: args.leadId ?? null,
    mensaje: mensaje.length > 160 ? `${mensaje.slice(0, 160)}…` : mensaje,
  };
}

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant?.id;
    if (!tenantId) {
      return NextResponse.json({ error: 'Credencial sin empresa' }, { status: 403 });
    }
    if (!esResponsable(auth)) {
      return NextResponse.json(
        { error: 'Sólo un responsable (owner o admin) puede revisar los envíos.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limite = Math.min(Math.max(Number(searchParams.get('limit') || 50) || 50, 1), MAXIMO_LISTA);

    const envios = await prisma.mcpApprovalRequest.findMany({
      where: {
        tenantId,
        toolName: HERRAMIENTA_ENVIO,
        status: { in: ['failed', 'executed'] },
        OR: [{ entregaEstado: null }, { entregaEstado: 'enviado' }],
      },
      orderBy: { createdAt: 'desc' },
      take: limite,
      select: {
        id: true,
        status: true,
        whatsappMessageId: true,
        entregaEstado: true,
        entregaActualizadaEn: true,
        createdAt: true,
        executedAt: true,
        arguments: true,
      },
    });

    return NextResponse.json({
      success: true,
      total: envios.length,
      envios: envios.map(vistaDeEnvio),
    });
  } catch (error) {
    console.error('[MCP entregas] Error listando:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}, ['mcp:read']);

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant?.id;
    const userId = auth.user?.id;
    if (!tenantId || !userId) {
      return NextResponse.json({ error: 'Credencial sin empresa o usuario' }, { status: 403 });
    }
    if (!esResponsable(auth)) {
      return NextResponse.json(
        { error: 'Sólo un responsable (owner o admin) puede cerrar o reintentar un envío.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const approvalId = typeof body?.approvalId === 'string' ? body.approvalId : '';
    const action = body?.action;
    if (!approvalId) {
      return NextResponse.json({ error: 'approvalId es requerido' }, { status: 400 });
    }

    const original = await prisma.mcpApprovalRequest.findFirst({
      where: { id: approvalId, tenantId, toolName: HERRAMIENTA_ENVIO },
      select: {
        id: true,
        toolName: true,
        arguments: true,
        status: true,
        entregaEstado: true,
      },
    });
    if (!original) {
      return NextResponse.json({ error: 'Envío no encontrado' }, { status: 404 });
    }

    if (action === 'confirmar_entrega' || action === 'marcar_no_entregado') {
      const estado = action === 'confirmar_entrega' ? 'entregado' : 'fallido';
      const actualizado = await resolverEntregaManual({ approvalId, tenantId, estado });
      if (!actualizado) {
        return NextResponse.json({ error: 'Envío no encontrado' }, { status: 404 });
      }

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          accion: 'MCP_entrega_resuelta',
          entidad: 'MCP',
          entidadId: approvalId,
          descripcion: `Entrega de WhatsApp marcada como ${estado}`,
          metadata: { approvalId, estado, origen: 'manual' },
        },
      }).catch((error) => console.error('[MCP entregas] No se pudo auditar:', error));

      return NextResponse.json({ success: true, approvalId, entregaEstado: estado });
    }

    if (action !== 'reintentar') {
      return NextResponse.json(
        {
          error:
            'Acción inválida. Usa confirmar_entrega, marcar_no_entregado o reintentar.',
        },
        { status: 400 }
      );
    }

    // Un desenlace desconocido puede significar que el mensaje sí llegó: reenviar
    // a ciegas duplicaría el WhatsApp. Solo se permite sin confirmación expresa
    // cuando consta que no se entregó.
    if (original.entregaEstado !== 'fallido' && body?.confirmoRiesgoDeDuplicado !== true) {
      return NextResponse.json(
        {
          error:
            'El desenlace de este envío es desconocido. Marca el envío como no entregado o pasa confirmoRiesgoDeDuplicado: true para reenviar aunque pudiera haber llegado.',
        },
        { status: 409 }
      );
    }

    const args = { ...((original.arguments ?? {}) as Record<string, unknown>) };
    delete args.operationId;

    // El reenvío entra por el mismo gate: otra solicitud, otra aprobación y,
    // en los envíos externos, otro código de WhatsApp.
    const gate = await enforceToolGate({
      tenantId,
      userId,
      roleName: auth.user?.role?.nombre ?? null,
      toolName: original.toolName,
      args,
      via: '/api/mcp',
    });

    if (gate.kind === 'deny') {
      return NextResponse.json({ error: gate.reason }, { status: 403 });
    }
    if (gate.kind === 'allow') {
      return NextResponse.json(
        {
          error:
            'La política actual permite este envío sin aprobación; repítelo desde el cliente MCP con un operationId nuevo.',
        },
        { status: 409 }
      );
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        accion: 'MCP_envio_reintentado',
        entidad: 'MCP',
        entidadId: original.id,
        descripcion: `Reintento solicitado para el envío ${original.id}`,
        metadata: {
          approvalOriginal: original.id,
          approvalNuevo: gate.approvalId,
          entregaEstado: original.entregaEstado,
        },
      },
    }).catch((error) => console.error('[MCP entregas] No se pudo auditar:', error));

    return NextResponse.json({
      success: true,
      approvalId: gate.approvalId,
      tipo: gate.kind,
      verificationUrl: gate.kind === 'ask_code' ? gate.verificationUrl : null,
      expiresAt: 'expiresAt' in gate ? gate.expiresAt : null,
    });
  } catch (error) {
    console.error('[MCP entregas] Error resolviendo:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}, ['mcp:admin']);
