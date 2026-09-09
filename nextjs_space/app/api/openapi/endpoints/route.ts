export const dynamic = 'force-dynamic';

/**
 * GET /api/openapi/endpoints
 *
 * Lista ligera de endpoints protegidos por API Key, DERIVADA del spec OpenAPI
 * (lib/openapi/spec.ts — la misma fuente de verdad que alimenta /api/docs y
 * /api/openapi.json). La usa la página Configuración → API Keys para pintar la
 * tabla "Endpoints Disponibles" en lugar de una lista estática a mano.
 *
 * Cada operación devuelve: método, path, summary, tag y scopes requeridos.
 * Los scopes se leen de la extensión `x-required-scopes` de cada operación del
 * spec (anotada en lib/openapi/spec.ts); si una operación no la tiene, se
 * devuelve `scopes: []` (la página muestra "según permisos").
 */

import { NextResponse } from 'next/server';
import VOLKERN_API_SPEC from '@/lib/openapi/spec';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const API_KEY_SCHEMES = new Set(['ApiKeyHeader', 'ApiKeyBearer']);

interface EndpointEntry {
  method: string;
  path: string;
  summary?: string;
  tag?: string;
  scopes: string[];
}

export async function GET() {
  try {
    const endpoints: EndpointEntry[] = [];

    for (const [path, pathItem] of Object.entries((VOLKERN_API_SPEC.paths as Record<string, any>) || {})) {
      for (const method of HTTP_METHODS) {
        const op = pathItem?.[method];
        if (!op || typeof op !== 'object') continue;

        // Solo operaciones accesibles con API key (tienen ApiKeyHeader/ApiKeyBearer
        // en security, o security vacío = security global del documento).
        const sec = (op.security as Array<Record<string, string[]>> | undefined) ?? (VOLKERN_API_SPEC as any).security;
        const usesApiKey = Array.isArray(sec)
          ? sec.some((req) => Object.keys(req).some((k) => API_KEY_SCHEMES.has(k)))
          : false;

        if (!usesApiKey) continue;

        const scopes: string[] = Array.isArray(op['x-required-scopes'])
          ? (op['x-required-scopes'] as string[])
          : [];

        endpoints.push({
          method: method.toUpperCase(),
          path,
          summary: typeof op.summary === 'string' ? op.summary : undefined,
          tag: Array.isArray(op.tags) && typeof op.tags[0] === 'string' ? op.tags[0] : undefined,
          scopes,
        });
      }
    }

    // Orden estable: por tag y luego por método/path para una tabla legible.
    endpoints.sort((a, b) => {
      const tagCmp = (a.tag || '').localeCompare(b.tag || '');
      if (tagCmp !== 0) return tagCmp;
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      return a.method.localeCompare(b.method);
    });

    return NextResponse.json(
      { endpoints, count: endpoints.length },
      {
        headers: {
          'Cache-Control': 'public, max-age=300',
        },
      },
    );
  } catch (error) {
    console.error('[openapi/endpoints] Error al derivar endpoints:', error);
    return NextResponse.json({ error: 'Error al cargar los endpoints' }, { status: 500 });
  }
}