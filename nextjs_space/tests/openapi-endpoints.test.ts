import { describe, it, expect } from 'vitest';
import VOLKERN_API_SPEC from '@/lib/openapi/spec';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const API_KEY_SCHEMES = new Set(['ApiKeyHeader', 'ApiKeyBearer']);

function deriveEndpoints() {
  const endpoints: Array<{ method: string; path: string; summary?: string; tag?: string; scopes: string[] }> = [];
  for (const [path, pathItem] of Object.entries((VOLKERN_API_SPEC.paths as Record<string, any>) || {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem?.[method];
      if (!op || typeof op !== 'object') continue;
      const sec = (op.security as Array<Record<string, string[]>> | undefined) ?? (VOLKERN_API_SPEC as any).security;
      const usesApiKey = Array.isArray(sec)
        ? sec.some((req) => Object.keys(req).some((k) => API_KEY_SCHEMES.has(k)))
        : false;
      if (!usesApiKey) continue;
      endpoints.push({
        method: method.toUpperCase(),
        path,
        summary: typeof op.summary === 'string' ? op.summary : undefined,
        tag: Array.isArray(op.tags) && typeof op.tags[0] === 'string' ? op.tags[0] : undefined,
        scopes: Array.isArray(op['x-required-scopes']) ? op['x-required-scopes'] : [],
      });
    }
  }
  return endpoints;
}

describe('Endpoints derivados del spec OpenAPI (tabla de API Keys)', () => {
  const endpoints = deriveEndpoints();

  it('deriva los endpoints protegidos por API Key', () => {
    expect(endpoints.length).toBeGreaterThanOrEqual(30);
    // Endpoints clave presentes
    expect(endpoints).toContainEqual(expect.objectContaining({ method: 'GET', path: '/api/leads' }));
    expect(endpoints).toContainEqual(expect.objectContaining({ method: 'POST', path: '/api/deals' }));
    expect(endpoints).toContainEqual(expect.objectContaining({ method: 'GET', path: '/api/contacts' }));
  });

  it('excluye endpoints públicos sin API Key (health, chatbot widget, webhooks stripe)', () => {
    const paths = endpoints.map((e) => e.path);
    expect(paths).not.toContain('/api/health');
    expect(paths).not.toContain('/api/chatbot/widget');
    expect(paths).not.toContain('/api/webhooks/stripe');
    expect(paths).not.toContain('/api/auth/[...nextauth]');
  });

  it('los endpoints documentados tienen scopes válidos', () => {
    const scopes = endpoints.flatMap((e) => e.scopes);
    expect(scopes).toContain('leads:read');
    expect(scopes).toContain('deals:write');
    for (const scope of scopes) {
      expect(scope).toMatch(/^[a-z0-9_]+:[a-z_]+$/);
    }
  });
});