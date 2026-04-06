/**
 * Volkern MCP API Endpoint
 * Model Context Protocol Server via HTTP
 * 
 * Endpoints:
 * GET  /api/mcp - Server info y lista de tools
 * POST /api/mcp - Ejecutar un tool
 * 
 * Autenticación:
 * - API Key via header: X-API-Key
 * - O sesión de usuario autenticado
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import {
  handleListTools,
  handleCallTool,
  handleServerInfo,
  MCPCallToolRequest,
  MCP_SERVER_INFO,
} from '@/lib/mcp/mcp-handler';

export const dynamic = 'force-dynamic';

// ============== GET - Server Info & List Tools ==============

export async function GET(request: NextRequest) {
  try {
    // Autenticar
    const auth = await authenticateRequest(request, ['mcp:read']);
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'No autorizado', details: auth.error },
        { status: 401 }
      );
    }

    // Obtener parámetro de acción
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'list-tools') {
      const tools = handleListTools();
      return NextResponse.json({
        success: true,
        ...tools,
        _meta: {
          tenantId: auth.tenant?.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Por defecto, devolver info del servidor y tools
    const serverInfo = handleServerInfo();
    const tools = handleListTools();

    return NextResponse.json({
      success: true,
      server: serverInfo,
      ...tools,
      _meta: {
        tenantId: auth.tenant?.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[MCP API] Error en GET:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// ============== POST - Execute Tool ==============

export async function POST(request: NextRequest) {
  try {
    // Autenticar
    const auth = await authenticateRequest(request, ['mcp:execute']);
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'No autorizado', details: auth.error },
        { status: 401 }
      );
    }

    // Parsear body
    const body = await request.json();
    const { method, params } = body;

    // Soportar formato MCP estándar (JSON-RPC style)
    if (method === 'tools/list') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id: body.id || null,
        result: handleListTools(),
      });
    }

    if (method === 'tools/call') {
      const toolRequest: MCPCallToolRequest = {
        name: params?.name,
        arguments: {
          ...params?.arguments,
          // Inyectar tenantId automáticamente si no viene
          tenantId: params?.arguments?.tenantId || auth.tenant?.id,
          userId: params?.arguments?.userId || auth.user?.id,
          source: 'mcp',
        },
      };

      const result = await handleCallTool(toolRequest);

      return NextResponse.json({
        jsonrpc: '2.0',
        id: body.id || null,
        result,
      });
    }

    // Formato simplificado (compatibilidad)
    if (body.tool || body.name) {
      const toolRequest: MCPCallToolRequest = {
        name: body.tool || body.name,
        arguments: {
          ...(body.arguments || body.payload || body.params || {}),
          // Inyectar tenantId automáticamente
          tenantId: body.tenantId || auth.tenant?.id,
          userId: body.userId || auth.user?.id,
          source: 'mcp',
        },
      };

      const result = await handleCallTool(toolRequest);

      // Parsear el resultado para respuesta más limpia
      const content = result.content[0];
      let parsedResult;
      try {
        parsedResult = content?.text ? JSON.parse(content.text) : null;
      } catch {
        parsedResult = content?.text;
      }

      if (result.isError) {
        return NextResponse.json(
          { 
            success: false, 
            error: parsedResult?.error || 'Error ejecutando tool',
            tool: toolRequest.name,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        tool: toolRequest.name,
        result: parsedResult,
        _meta: {
          tenantId: auth.tenant?.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json(
      { error: 'Formato de request inválido. Use { tool: "nombre", arguments: {...} }' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[MCP API] Error en POST:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// ============== OPTIONS - CORS ==============

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
    },
  });
}
