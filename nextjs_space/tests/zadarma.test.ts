import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyZadarmaSignature, getZadarmaAuthHeader } from '@/lib/integrations/zadarma';

describe('verifyZadarmaSignature', () => {
  const apiSecret = 'test-secret-key-12345';

  it('debe validar firma correcta con parámetros ordenados', () => {
    const params = { caller_id: '123456789', called_did: '987654321', call_start: '2024-01-01 12:00:00' };
    // Generamos la firma real con getZadarmaAuthHeader adaptada
    const keys = Object.keys(params).sort();
    const qs = keys.map(k => `${k}=${params[k]}`).join('&');
    const hmac = crypto.createHmac('sha1', apiSecret);
    hmac.update(qs);
    const signature = hmac.digest('base64');

    const result = verifyZadarmaSignature(params, signature, apiSecret);
    expect(result).toBe(true);
  });

  it('debe ignorar el campo signature en los parámetros', () => {
    const params = { caller_id: '123456789', signature: 'fake-signature', called_did: '987654321' };
    const keys = ['called_did', 'caller_id']; // sorted, sin 'signature'
    const qs = keys.map(k => `${k}=${params[k]}`).join('&');
    const hmac = crypto.createHmac('sha1', apiSecret);
    hmac.update(qs);
    const signature = hmac.digest('base64');

    const result = verifyZadarmaSignature(params, signature, apiSecret);
    expect(result).toBe(true);
  });

  it('debe rechazar firma inválida (payload alterado)', () => {
    const params = { caller_id: '123456789' };
    const keys = Object.keys(params).sort();
    const qs = keys.map(k => `${k}=${params[k]}`).join('&');
    const hmac = crypto.createHmac('sha1', apiSecret);
    hmac.update(qs);
    const signature = hmac.digest('base64');

    // Alteramos el payload
    const tamperedParams = { caller_id: '999999999' };
    const result = verifyZadarmaSignature(tamperedParams, signature, apiSecret);
    expect(result).toBe(false);
  });

  it('debe rechazar firma con secret diferente', () => {
    const params = { caller_id: '123456789' };
    const qs = 'caller_id=123456789';
    const hmac = crypto.createHmac('sha1', apiSecret);
    hmac.update(qs);
    const signature = hmac.digest('base64');

    const result = verifyZadarmaSignature(params, signature, 'wrong-secret');
    expect(result).toBe(false);
  });

  it('debe rechazar firma vacía', () => {
    const params = { caller_id: '123456789' };
    const result = verifyZadarmaSignature(params, '', apiSecret);
    expect(result).toBe(false);
  });

  it('debe manejar params vacíos', () => {
    const hmac = crypto.createHmac('sha1', apiSecret);
    hmac.update('');
    const signature = hmac.digest('base64');

    const result = verifyZadarmaSignature({}, signature, apiSecret);
    expect(result).toBe(true);
  });

  it('debe manejar valores con caracteres especiales (URL-encoded)', () => {
    const params = { caller_id: '123456789', display_name: 'José García & Asociados' };
    const keys = Object.keys(params).sort();
    const qs = keys.map(k => `${k}=${params[k]}`).join('&');
    const hmac = crypto.createHmac('sha1', apiSecret);
    hmac.update(qs);
    const signature = hmac.digest('base64');

    const result = verifyZadarmaSignature(params, signature, apiSecret);
    expect(result).toBe(true);
  });

  it('debe ser determinista', () => {
    const params = { a: '1', b: '2' };
    const qs = 'a=1&b=2';
    const hmac = crypto.createHmac('sha1', apiSecret);
    hmac.update(qs);
    const signature = hmac.digest('base64');

    const r1 = verifyZadarmaSignature(params, signature, apiSecret);
    const r2 = verifyZadarmaSignature(params, signature, apiSecret);
    expect(r1).toBe(r2);
    expect(r1).toBe(true);
  });
});

describe('getZadarmaAuthHeader', () => {
  const config = { apiKey: 'test-api-key-123', apiSecret: 'test-secret-key-456' };

  it('debe devolver header con formato API_KEY:signature', () => {
    const result = getZadarmaAuthHeader('/v1/info/balance/', {}, config);
    expect(result).toContain(':');
    const [apiKey, signature] = result.split(':');
    expect(apiKey).toBe(config.apiKey);
    expect(signature.length).toBeGreaterThan(0);
  });

  it('debe generar firma base64 (no hex)', () => {
    const result = getZadarmaAuthHeader('/v1/info/balance/', {}, config);
    const signature = result.split(':')[1];
    // Base64 puede contener =, +, /, letras, números
    expect(signature).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('debe incluir MD5 del query string en el cálculo', () => {
    // Verificamos que el resultado es diferente al usar HMAC-SHA1 directo sin MD5
    const params = { from: '123', to: '456' };
    const result = getZadarmaAuthHeader('/v1/request/callback/', params, config);
    const signature = result.split(':')[1];

    // Si no incluyera MD5, la firma sería SHA1(method + qs) solamente
    const keys = Object.keys(params).sort();
    const qs = keys.map(k => `${k}=${params[k]}`).join('&');
    const hmacDirect = crypto.createHmac('sha1', config.apiSecret);
    hmacDirect.update('/v1/request/callback/' + qs);
    const directSignature = hmacDirect.digest('base64');

    // La firma real debe ser diferente porque incluye MD5
    expect(signature).not.toBe(directSignature);
  });

  it('debe ordenar params alfabéticamente', () => {
    // El orden de params afecta la firma
    const r1 = getZadarmaAuthHeader('/v1/test/', { b: '2', a: '1' }, config);
    const r2 = getZadarmaAuthHeader('/v1/test/', { a: '1', b: '2' }, config);
    expect(r1).toBe(r2);
  });

  it('debe generar firmas diferentes para diferentes métodos', () => {
    const r1 = getZadarmaAuthHeader('/v1/info/balance/', {}, config);
    const r2 = getZadarmaAuthHeader('/v1/request/callback/', {}, config);
    expect(r1).not.toBe(r2);
  });

  it('debe generar firmas diferentes para diferentes params', () => {
    const r1 = getZadarmaAuthHeader('/v1/test/', { a: '1' }, config);
    const r2 = getZadarmaAuthHeader('/v1/test/', { a: '2' }, config);
    expect(r1).not.toBe(r2);
  });

  it('debe generar firmas diferentes para diferentes apiSecrets', () => {
    const config2 = { apiKey: 'test-api-key-123', apiSecret: 'different-secret' };
    const r1 = getZadarmaAuthHeader('/v1/test/', { a: '1' }, config);
    const r2 = getZadarmaAuthHeader('/v1/test/', { a: '1' }, config2);
    expect(r1).not.toBe(r2);
  });

  it('debe ser determinista', () => {
    const r1 = getZadarmaAuthHeader('/v1/test/', { a: '1', b: '2' }, config);
    const r2 = getZadarmaAuthHeader('/v1/test/', { a: '1', b: '2' }, config);
    expect(r1).toBe(r2);
  });
});
