import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  settingsFindUnique: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    clientSignatureSettings: { findUnique: mocks.settingsFindUnique },
  },
}));
vi.mock('@/lib/core/crypto', () => ({
  decrypt: (v: string) => (v === 'enc:tok' ? 'token-guardado' : v),
}));

import { POST as testPOST } from '@/app/api/integraciones/firma-digital/test/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/integraciones/firma-digital/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const storedSettings = {
  url: 'https://firma.cliente.com',
  apiTokenEncrypted: 'enc:tok',
};

// Mock global fetch
let fetchImpl: (url: string, init?: any) => Promise<Response>;

beforeEach(() => {
  mocks.getServerSession.mockReset();
  mocks.userFindUnique.mockReset();
  mocks.settingsFindUnique.mockReset();
  mocks.getServerSession.mockResolvedValue({ user: { email: 'a@b.c' } });
  mocks.userFindUnique.mockResolvedValue({ tenantId: 't-1' });
  mocks.settingsFindUnique.mockResolvedValue(storedSettings);

  fetchImpl = (url: string, init?: any) =>
    Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', (url: string, init?: any) => fetchImpl(url, init));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/integraciones/firma-digital/test', () => {
  it('devuelve 401 sin sesión', async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const res = await testPOST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it('devuelve 400 si no hay URL (ni en body ni guardada)', async () => {
    mocks.settingsFindUnique.mockResolvedValue(null);
    const res = await testPOST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('usa la URL del formulario y reporta success cuando todo responde', async () => {
    let hits: string[] = [];
    fetchImpl = (url: string, init?: any) => {
      hits.push(url);
      if (url.includes('/status.php')) {
        return Promise.resolve(new Response('{"versionstring":"27.1.7"}', { status: 200 }));
      }
      return Promise.resolve(new Response('[]', { status: 200 }));
    };
    const res = await testPOST(makeRequest({ url: 'https://firma.cliente.com', apiToken: 'token-nuevo' }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.checks.host.ok).toBe(true);
    expect(json.checks.nextcloud.ok).toBe(true);
    expect(json.checks.api.ok).toBe(true);
    expect(json.checks.nextcloud.detail).toContain('27.1.7');
    expect(hits.some((u) => u.includes('/ocs/v2.php/apps/libresign/api/v1/file/list'))).toBe(true);
  });

  it('usa el token guardado (descifrado) cuando el del formulario viene enmascarado', async () => {
    let authHeader = '';
    fetchImpl = (url: string, init?: any) => {
      if (url.includes('/file/list')) authHeader = init?.headers?.Authorization || '';
      return Promise.resolve(new Response('[]', { status: 200 }));
    };
    await testPOST(makeRequest({ url: 'https://firma.cliente.com', apiToken: '••••••••••••••••' }));
    expect(authHeader).toBe('Bearer token-guardado');
  });

  it('reporta host no alcanzable con success=false', async () => {
    fetchImpl = () => Promise.reject(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
    const res = await testPOST(makeRequest({ url: 'https://host-inexistente.com' }));
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.checks.host.ok).toBe(false);
    expect(json.checks.host.detail).toContain('ECONNREFUSED');
  });

  it('reporta token rechazado con 401 de la API', async () => {
    fetchImpl = (url: string) =>
      Promise.resolve(new Response('{}', { status: url.includes('/file/list') ? 401 : 200 }));
    const res = await testPOST(makeRequest({ url: 'https://firma.cliente.com', apiToken: 'token-malo' }));
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.checks.api.ok).toBe(false);
    expect(json.checks.api.detail).toContain('401');
  });

  it('no crea documentos: solo hace GET', async () => {
    const methods: string[] = [];
    fetchImpl = (url: string, init?: any) => {
      methods.push(init?.method || 'GET');
      return Promise.resolve(new Response('[]', { status: 200 }));
    };
    await testPOST(makeRequest({ url: 'https://firma.cliente.com', apiToken: 'tok' }));
    expect(methods.every((m) => m === 'GET')).toBe(true);
  });
});
