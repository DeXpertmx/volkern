import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  validateWebhookSignature,
  listIntegrations,
  getIntegrationDocs,
} from '@/lib/integrations/integration-handler';

describe('validateWebhookSignature', () => {
  const secret = 'test-secret-123';
  const payload = JSON.stringify({ event: 'test', data: { id: 1 } });

  it('debe validar una firma HMAC-SHA256 correcta', () => {
    // Generamos la firma esperada manualmente
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    expect(validateWebhookSignature(payload, expectedSig, secret)).toBe(true);
  });

  it('debe rechazar una firma incorrecta', () => {
    expect(validateWebhookSignature(payload, 'invalid-signature', secret)).toBe(false);
  });

  it('debe rechazar firma con secret incorrecto', () => {
    const sig = crypto.createHmac('sha256', 'wrong-secret').update(payload).digest('hex');
    expect(validateWebhookSignature(payload, sig, secret)).toBe(false);
  });

  it('debe rechazar firma de diferente longitud', () => {
    expect(validateWebhookSignature(payload, 'short', secret)).toBe(false);
  });

  it('debe rechazar firma vacía', () => {
    expect(validateWebhookSignature(payload, '', secret)).toBe(false);
  });

  it('debe funcionar con SHA1', () => {
    const sig = crypto.createHmac('sha1', secret).update(payload).digest('hex');
    expect(validateWebhookSignature(payload, sig, secret, 'sha1')).toBe(true);
  });

  it('debe rechazar SHA1 con algoritmo SHA256', () => {
    const sig = crypto.createHmac('sha1', secret).update(payload).digest('hex');
    expect(validateWebhookSignature(payload, sig, secret, 'sha256')).toBe(false);
  });

  it('debe validar payloads diferentes con firmas diferentes', () => {
    const p1 = JSON.stringify({ a: 1 });
    const p2 = JSON.stringify({ a: 2 });
    const sig1 = crypto.createHmac('sha256', secret).update(p1).digest('hex');
    expect(validateWebhookSignature(p2, sig1, secret)).toBe(false);
  });
});

// ─── listIntegrations ─────────────────────────────────────────────────
describe('listIntegrations', () => {
  it('debe devolver un objeto con todos los tipos de integración', () => {
    const integrations = listIntegrations();
    expect(typeof integrations).toBe('object');
    expect(Object.keys(integrations).length).toBeGreaterThanOrEqual(8);
  });

  it('debe incluir n8n, chatwoot, calcom, evolution, whatsapp, telegram, generic, gocardless', () => {
    const integrations = listIntegrations();
    const expected = ['n8n', 'chatwoot', 'calcom', 'evolution', 'whatsapp', 'telegram', 'generic', 'gocardless'];
    for (const t of expected) {
      expect(integrations).toHaveProperty(t);
    }
  });

  it('cada tipo debe tener al menos 1 evento', () => {
    const integrations = listIntegrations();
    for (const [, events] of Object.entries(integrations)) {
      expect(events.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('todos los eventos deben ser strings', () => {
    const integrations = listIntegrations();
    for (const [, events] of Object.entries(integrations)) {
      for (const event of events) {
        expect(typeof event).toBe('string');
        expect(event.length).toBeGreaterThan(0);
      }
    }
  });

  it('no debe haber eventos duplicados por tipo', () => {
    const integrations = listIntegrations();
    for (const [type, events] of Object.entries(integrations)) {
      expect(new Set(events).size).toBe(events.length);
    }
  });
});

// ─── getIntegrationDocs ───────────────────────────────────────────────
describe('getIntegrationDocs', () => {
  it('debe devolver docs para n8n', () => {
    const docs = getIntegrationDocs('n8n');
    expect(docs).not.toBeNull();
    expect(docs!.type).toBe('n8n');
    expect(docs!.events.length).toBeGreaterThanOrEqual(3);
  });

  it('debe devolver docs para chatwoot', () => {
    const docs = getIntegrationDocs('chatwoot');
    expect(docs).not.toBeNull();
    expect(docs!.events.length).toBeGreaterThanOrEqual(3);
  });

  it('debe devolver docs para calcom', () => {
    const docs = getIntegrationDocs('calcom');
    expect(docs).not.toBeNull();
    expect(docs!.events.length).toBeGreaterThanOrEqual(3);
  });

  it('debe devolver null para tipo desconocido', () => {
    expect(getIntegrationDocs('unknown' as any)).toBeNull();
  });

  it('cada evento debe tener event y opcionalmente skill o eventEmitted', () => {
    const docs = getIntegrationDocs('generic');
    expect(docs).not.toBeNull();
    for (const ev of docs!.events) {
      expect(typeof ev.event).toBe('string');
      // Skill o eventEmitted (o ambos) deben existir
      const hasSkillOrEvent = ev.skill !== undefined || ev.eventEmitted !== undefined;
      expect(hasSkillOrEvent).toBe(true);
    }
  });

  it('getIntegrationDocs y listIntegrations deben ser coherentes', () => {
    const integrations = listIntegrations();
    for (const type of Object.keys(integrations)) {
      const docs = getIntegrationDocs(type as any);
      expect(docs).not.toBeNull();
      expect(docs!.events.length).toBe(integrations[type].length);
    }
  });
});
