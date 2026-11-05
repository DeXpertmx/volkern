export const dynamic = 'force-dynamic';

/**
 * Bandeja de aprobaciones del gate MCP.
 *
 * GET /api/mcp/approvals — solicitudes pendientes de la empresa.
 *
 * Sólo las ven los roles que pueden resolverlas (owner/admin). Las solicitudes
 * contienen los argumentos exactos que el agente intentó ejecutar —nombres,
 * importes, teléfonos—, así que listarlas ya es acceso a datos del CRM.
 */

import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { listPendingApprovals } from '@/lib/mcp/tool-gate';
import { roleKind } from '@/lib/mcp/tool-policy';

export const GET = withTenantAuth(async (_request, auth) => {
  try {
    const tenantId = auth.tenant?.id;
    if (!tenantId) {
      return NextResponse.json({ error: 'Credencial sin empresa' }, { status: 403 });
    }

    const kind = roleKind(auth.user?.role?.nombre);
    if (kind !== 'owner' && kind !== 'admin') {
      return NextResponse.json(
        { error: 'Sólo un responsable (owner o admin) puede revisar las aprobaciones.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(_request.url);
    const limit = Number(searchParams.get('limit') || 50);

    const pendientes = await listPendingApprovals(tenantId, limit);

    return NextResponse.json({
      success: true,
      total: pendientes.length,
      approvals: pendientes.map((a) => ({
        id: a.id,
        toolName: a.toolName,
        arguments: a.arguments,
        requestedById: a.requestedById,
        roleName: a.roleName,
        via: a.via,
        reason: a.reason,
        createdAt: a.createdAt,
        expiresAt: a.expiresAt,
      })),
    });
  } catch (error) {
    console.error('[MCP approvals] Error listando:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}, ['mcp:read']);
