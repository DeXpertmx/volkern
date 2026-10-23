/**
 * Volkern MCP API Endpoint
 * Model Context Protocol Server via HTTP
 * 
 * Endpoints (acceso programático alternativo al endpoint MCP /mcp):
 * GET  /api/mcp - Server info y lista de tools (¡ahora del catálogo!)
 * POST /api/mcp - Ejecutar una tool del catálogo (JSON-RPC o formato simple)
 *
 * NOTA de unificación: las tools publicadas por esta ruta son exactamente
 * las 43 del catálogo compartido (mcp-server/src/tools-catalog.ts), las
 * mismas que /mcp y la Server Card — una sola fuente de verdad. Los
 * antiguos nombres legacy de skill del orquestador (sin prefijo volkern_)
 * siguen siendo llamables: resuelven a su tool del catálogo por alias/prefijo
 * y ejecutan el mismo skill. Los skills SOLO del orquestador (hospitality,
 * create_booking...) dejan de publicarse aquí: nadie los consumía. Para
 * tools nuevas: añadirlas al catálogo y su executor a lib/skills — nunca a
 * listas paralelas.
 * 
 * Autenticación:
 * - API Key via header: X-API-Key
 * - O sesión de usuario autenticado
 * 
 * Seguridad:
 * - Rate limiting: 100 req/min por API key
 * - Logging de auditoría en AiDecisionLog
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import { crmAllows, getCrmEntitlements, upgradeMessage } from '@/lib/crm-entitlements';
import { cookies } from 'next/headers';
import {
  handleListTools,
  handleCallTool,
  handleServerInfo,
  MCPCallToolRequest,
  MCP_SERVER_INFO,
} from '@/lib/mcp/mcp-handler';

export const dynamic = 'force-dynamic';

// ============== RATE LIMITING ==============

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in ms

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);
  
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT) {
    return false;
  }
  
  entry.count++;
  return true;
}

function getRateLimitIdentifier(auth: any): string {
  if (auth.apiKey?.id) return `apikey:${auth.apiKey.id}`;
  if (auth.user?.id) return `user:${auth.user.id}`;
  return 'unknown';
}

// ============== AUDIT LOGGING ==============

async function logMCPAudit(
  tenantId: string,
  userId: string | undefined,
  action: string,
  toolName: string | undefined,
  status: 'success' | 'error',
  error?: string,
  metadata?: any
) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        accion: `MCP_${action}`,
        entidad: 'MCP',
        entidadId: toolName || 'unknown',
        descripcion: `MCP ${action}: ${toolName || 'N/A'}`,
        metadata: {
          tool: toolName,
          status,
          error,
          ...metadata,
        },
      },
    });
  } catch (e) {
    console.error('[MCP Audit] Failed to log:', e);
  }
}

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

    // El acceso programático (API/MCP) es del nivel Avanzado.
    if (auth.tenant?.id) {
      const ent = await getCrmEntitlements(auth.tenant.id);
      if (!crmAllows(ent, 'api')) {
        return NextResponse.json({ error: upgradeMessage('api', ent) }, { status: 403 });
      }
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
  const startTime = Date.now();
  let auth: any;
  
  try {
    // Autenticar
    auth = await authenticateRequest(request, ['mcp:execute']);
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'No autorizado', details: auth.error },
        { status: 401 }
      );
    }

    if (auth.tenant?.id) {
      const ent = await getCrmEntitlements(auth.tenant.id);
      if (!crmAllows(ent, 'api')) {
        return NextResponse.json({ error: upgradeMessage('api', ent) }, { status: 403 });
      }
    }

    // Rate limiting
    const rateLimitKey = getRateLimitIdentifier(auth);
    if (!checkRateLimit(rateLimitKey)) {
      await logMCPAudit(
        auth.tenant?.id || 'unknown',
        auth.user?.id,
        'rate_limit_exceeded',
        undefined,
        'error',
        'Rate limit exceeded'
      );
      return NextResponse.json(
        { error: 'Rate limit exceeded. Máximo 100 requests por minuto.' },
        { status: 429 }
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
        const duration = Date.now() - startTime;
        await logMCPAudit(
          auth.tenant?.id,
          auth.user?.id,
          'tool_execution',
          toolRequest.name,
          'error',
          parsedResult?.error,
          { duration, arguments: body.arguments || body.payload }
        );
        
        return NextResponse.json(
          { 
            success: false, 
            error: parsedResult?.error || 'Error ejecutando tool',
            tool: toolRequest.name,
          },
          { status: 400 }
        );
      }

      const duration = Date.now() - startTime;
      await logMCPAudit(
        auth.tenant?.id,
        auth.user?.id,
        'tool_execution',
        toolRequest.name,
        'success',
        undefined,
        { duration, arguments: body.arguments || body.payload }
      );

      return NextResponse.json({
        success: true,
        tool: toolRequest.name,
        result: parsedResult,
        _meta: {
          tenantId: auth.tenant?.id,
          timestamp: new Date().toISOString(),
          duration: `${duration}ms`,
        },
      });
    }

    return NextResponse.json(
      { error: 'Formato de request inválido. Use { tool: "nombre", arguments: {...} }' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[MCP API] Error en POST:', error);
    
    await logMCPAudit(
      auth?.tenant?.id || 'unknown' as any,
      auth?.user?.id as any,
      'tool_execution',
      undefined,
      'error',
      error instanceof Error ? error.message : 'Unknown error'
    );
    
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
