import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyHmacSignature, getAvailableEvents } from '@/lib/outgoing-webhooks';

// ============================================================
// getAvailableEvents
// ============================================================
describe('getAvailableEvents', () => {
  it('debe devolver un array con al menos 10 eventos', () => {
    const events = getAvailableEvents();
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(10);
  });

  it('cada evento debe tener value, label, description', () => {
    const events = getAvailableEvents();
    for (const event of events) {
      expect(event).toHaveProperty('value');
      expect(event).toHaveProperty('label');
      expect(event).toHaveProperty('description');
      expect(typeof event.value).toBe('string');
      expect(typeof event.label).toBe('string');
      expect(typeof event.description).toBe('string');
    }
  });

  it('los values deben ser únicos', () => {
    const events = getAvailableEvents();
    const values = events.map(e => e.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('debe incluir eventos clave: lead_creado, contacto_creado, cita_creada, mensaje_recibido', () => {
    const events = getAvailableEvents();
    const values = events.map(e => e.value);
    expect(values).toContain('lead_creado');
    expect(values).toContain('contacto_creado');
    expect(values).toContain('cita_creada');
    expect(values).toContain('mensaje_recibido');
  });

  it('debe incluir deal_creado, tarea_creada, campana_enviada', () => {
    const events = getAvailableEvents();
    const values = events.map(e => e.value);
    expect(values).toContain('deal_creado');
    expect(values).toContain('tarea_creada');
    expect(values).toContain('campana_enviada');
  });

  it('los labels deben ser legibles (empezar con mayúscula)', () => {
    const events = getAvailableEvents();
    for (const event of events) {
      expect(event.label[0]).toBe(event.label[0].toUpperCase());
    }
  });

  it('debe ser determinista', () => {
    const a = getAvailableEvents();
    const b = getAvailableEvents();
    expect(a).toEqual(b);
  });
});

// ============================================================
// verifyHmacSignature
// ============================================================
describe('verifyHmacSignature', () => {
  const secret = 'my-secret-key';
  const payload = JSON.stringify({ event: 'lead_creado', tenant_id: 'test-123', data: { name: 'Test' } });

  it('debe verificar true para una firma válida (payload sin modificar)', () => {
    // Calcular firma known-good: primero generamos el payload y usamos Node crypto
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const validSignature = hmac.digest('hex');

    expect(verifyHmacSignature(payload, validSignature, secret)).toBe(true);
  });

  it('debe devolver false para payload modificado (tampered)', () => {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const validSignature = hmac.digest('hex');

    const tamperedPayload = JSON.stringify({ event: 'lead_creado', tenant_id: 'test-123', data: { name: 'Hacked' } });
    expect(verifyHmacSignature(tamperedPayload, validSignature, secret)).toBe(false);
  });

  it('debe devolver false para firma incorrecta', () => {
    const wrongSignature = 'a'.repeat(64); // 64 hex chars pero incorrecta
    expect(verifyHmacSignature(payload, wrongSignature, secret)).toBe(false);
  });

  it('debe devolver false para secret diferente', () => {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const validSignature = hmac.digest('hex');

    expect(verifyHmacSignature(payload, validSignature, 'different-secret')).toBe(false);
  });

  it('debe lanzar error para firma vacía (timingSafeEqual requiere buffers misma longitud)', () => {
    // verifyHmacSignature usa timingSafeEqual que requiere buffers de igual longitud.
    // Firma vacía → Buffer de 0 bytes, firma esperada SHA-256 → 64 bytes → error.
    expect(() => verifyHmacSignature(payload, '', secret)).toThrow();
  });

  it('debe devolver false para payload vacío con firma no vacía', () => {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update('non-empty');
    const signature = hmac.digest('hex');

    expect(verifyHmacSignature('', signature, secret)).toBe(false);
  });

  it('debe manejar payload JSON complejo', () => {
    const complexPayload = JSON.stringify({
      event: 'lead_actualizado',
      tenant_id: 'tenant-456',
      data: { id: 1, nombre: 'Juan', nested: { deep: true } },
      metadata: { source: 'api', timestamp: '2026-05-21T12:00:00Z' }
    });

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(complexPayload);
    const validSignature = hmac.digest('hex');

    expect(verifyHmacSignature(complexPayload, validSignature, secret)).toBe(true);
  });

  it('debe ser determinista', () => {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const signature = hmac.digest('hex');

    const a = verifyHmacSignature(payload, signature, secret);
    const b = verifyHmacSignature(payload, signature, secret);
    expect(a).toBe(b);
  });

  it('debe devolver false para firma con caracteres no-hex (misma longitud)', () => {
    // SHA-256 produce 64 hex chars, generamos firma de 64 'z' (no hex válido pero misma longitud)
    const badSignature = 'z'.repeat(64);
    const result = verifyHmacSignature(payload, badSignature, secret);
    expect(result).toBe(false);
  });
});
