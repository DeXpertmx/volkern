import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ─── Mocks (vi.hoisted()) ────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  getTenantSettings: vi.fn(),
  handleWebhook: vi.fn(),
}));

vi.mock('@/lib/signatures/SignatureService', () => ({
  SignatureService: {
    getTenantSettings: mocks.getTenantSettings,
    handleWebhook: mocks.handleWebhook,
    verifyWebhookSignature: (rawBody: string, header: string | null | undefined, secret: string) => {
      const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
      let provided = (header || '').trim();
      if (provided.startsWith('sha256=')) provided = provided.slice('sha256='.length);
      return provided.trim().toLowerCase() === expected;
    },
  },
}));

import { POST as routePOST } from '@/app/api/webhooks/signatures/route';
// Verificación real (no el mock) para los tests unitarios
import { SignatureService as RealService } from '@/lib/signatures/SignatureService';
import { NextRequest } from 'next/server';

function makeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  const h = new Headers(headers);
  h.set('content-type', 'application/json');
  return new NextRequest('http://localhost:3000/api/webhooks/signatures?tenantId=t-123', {
    method: 'POST',
    headers: h,
    body,
  });
}

function hmac(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

const SECRET = 'super-secreto-del-tenant';
const BODY = JSON.stringify({ uuid: 'abc-123', event: 'document_signed', signer_email: 'a@b.c' });

beforeEach(() => {
  mocks.getTenantSettings.mockReset();
  mocks.handleWebhook.mockReset();
  mocks.getTenantSettings.mockResolvedValue({
    provider: 'libresign',
    url: 'https://firma.cliente.com',
    webhookSecret: SECRET,
    apiToken: 'tok',
    isActive: true,
    settings: null,
  });
  mocks.handleWebhook.mockResolvedValue({ id: 'evt-1' });
});

// ════════════════════════════════════════════════════════════════════════════
// verifyWebhookSignature (unitaria, con la implementación real)
// ════════════════════════════════════════════════════════════════════════════

describe('SignatureService.verifyWebhookSignature (real)', () => {
  it('acepta firma HMAC-SHA256 correcta en hex puro', () => {
    const sig = hmac(BODY, SECRET);
    expect(RealService.verifyWebhookSignature(BODY, sig, SECRET)).toBe(true);
  });

  it('acepta formato sha256=<hex> (x-hub-signature-256)', () => {
    const sig = `sha256=${hmac(BODY, SECRET)}`;
    expect(RealService.verifyWebhookSignature(BODY, sig, SECRET)).toBe(true);
  });

  it('rechaza firma con secreto incorrecto', () => {
    const sig = hmac(BODY, 'otro-secreto');
    expect(RealService.verifyWebhookSignature(BODY, sig, SECRET)).toBe(false);
  });

  it('rechaza body manipulado (firma de otro body)', () => {
    const sig = hmac(BODY, SECRET);
    const tampered = BODY.replace('document_signed', 'viewed');
    expect(RealService.verifyWebhookSignature(tampered, sig, SECRET)).toBe(false);
  });

  it('rechaza header ausente o vacío', () => {
    expect(RealService.verifyWebhookSignature(BODY, null, SECRET)).toBe(false);
    expect(RealService.verifyWebhookSignature(BODY, '', SECRET)).toBe(false);
    expect(RealService.verifyWebhookSignature(BODY, undefined, SECRET)).toBe(false);
  });

  it('rechaza header con formato no hex', () => {
    expect(RealService.verifyWebhookSignature(BODY, 'not-a-signature!!', SECRET)).toBe(false);
  });

  it('rechaza si el webhookSecret está vacío', () => {
    const sig = hmac(BODY, SECRET);
    expect(RealService.verifyWebhookSignature(BODY, sig, '')).toBe(false);
  });

  it('es insensible a mayúsculas en el hex del header', () => {
    const sig = hmac(BODY, SECRET).toUpperCase();
    expect(RealService.verifyWebhookSignature(BODY, sig, SECRET)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Ruta POST (comportamiento HTTP)
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/webhooks/signatures', () => {
  it('devuelve 400 sin tenantId', async () => {
    const req = new NextRequest('http://localhost:3000/api/webhooks/signatures', {
      method: 'POST',
      body: BODY,
    });
    const res = await routePOST(req);
    expect(res.status).toBe(400);
  });

  it('acepta petición con firma válida y procesa el evento', async () => {
    const sig = hmac(BODY, SECRET);
    const res = await routePOST(makeRequest(BODY, { 'x-libresign-signature': sig }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.eventId).toBe('evt-1');
    expect(mocks.handleWebhook).toHaveBeenCalledWith('t-123', JSON.parse(BODY));
  });

  it('acepta firma con formato x-hub-signature-256', async () => {
    const sig = `sha256=${hmac(BODY, SECRET)}`;
    const res = await routePOST(makeRequest(BODY, { 'x-hub-signature-256': sig }));
    expect(res.status).toBe(200);
  });

  it('rechaza con 401 una firma inválida', async () => {
    const res = await routePOST(makeRequest(BODY, { 'x-libresign-signature': 'a'.repeat(64) }));
    expect(res.status).toBe(401);
    expect(mocks.handleWebhook).not.toHaveBeenCalled();
  });

  it('rechaza con 401 si falta la firma (modo estricto por defecto)', async () => {
    const res = await routePOST(makeRequest(BODY));
    expect(res.status).toBe(401);
    expect(mocks.handleWebhook).not.toHaveBeenCalled();
  });

  it('acepta sin firma si el tenant tiene webhookSignatureOptional=true', async () => {
    mocks.getTenantSettings.mockResolvedValue({
      provider: 'libresign',
      url: 'https://firma.cliente.com',
      webhookSecret: SECRET,
      apiToken: 'tok',
      isActive: true,
      settings: { webhookSignatureOptional: true },
    });
    const res = await routePOST(makeRequest(BODY));
    expect(res.status).toBe(200);
    expect(mocks.handleWebhook).toHaveBeenCalled();
  });

  it('rechaza con 401 firma inválida aunque el modo sea opcional', async () => {
    mocks.getTenantSettings.mockResolvedValue({
      provider: 'libresign',
      url: 'https://firma.cliente.com',
      webhookSecret: SECRET,
      apiToken: 'tok',
      isActive: true,
      settings: { webhookSignatureOptional: true },
    });
    const res = await routePOST(makeRequest(BODY, { 'x-libresign-signature': 'b'.repeat(64) }));
    expect(res.status).toBe(401);
    expect(mocks.handleWebhook).not.toHaveBeenCalled();
  });

  it('devuelve 400 con JSON inválido aunque la firma sea correcta', async () => {
    const badBody = 'esto-no-es-json{';
    const sig = hmac(badBody, SECRET);
    const res = await routePOST(makeRequest(badBody, { 'x-libresign-signature': sig }));
    expect(res.status).toBe(400);
  });
});
