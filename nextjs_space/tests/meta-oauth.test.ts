import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  META_SCOPES,
  FACEBOOK_SCOPES,
  getMetaAuthUrl,
} from '@/lib/nexus/meta-oauth';

// ============================================================
// META_SCOPES
// ============================================================
describe('META_SCOPES', () => {
  it('debe ser un string con scopes separados por coma', () => {
    expect(typeof META_SCOPES).toBe('string');
    expect(META_SCOPES).toContain(',');
    expect(META_SCOPES.length).toBeGreaterThan(0);
  });

  it('debe incluir pages_manage_posts y pages_read_engagement', () => {
    expect(META_SCOPES).toContain('pages_manage_posts');
    expect(META_SCOPES).toContain('pages_read_engagement');
  });

  it('debe incluir instagram_basic y instagram_content_publish', () => {
    expect(META_SCOPES).toContain('instagram_basic');
    expect(META_SCOPES).toContain('instagram_content_publish');
  });

  it('debe incluir business_management', () => {
    expect(META_SCOPES).toContain('business_management');
  });

  it('los scopes deben ser al menos 5', () => {
    const scopes = META_SCOPES.split(',');
    expect(scopes.length).toBeGreaterThanOrEqual(5);
  });

  it('no debe tener espacios extra', () => {
    const scopes = META_SCOPES.split(',');
    for (const scope of scopes) {
      expect(scope).toBe(scope.trim());
    }
  });
});

// ============================================================
// FACEBOOK_SCOPES
// ============================================================
describe('FACEBOOK_SCOPES', () => {
  it('debe ser un string con scopes separados por coma', () => {
    expect(typeof FACEBOOK_SCOPES).toBe('string');
    expect(FACEBOOK_SCOPES).toContain(',');
  });

  it('debe ser un subconjunto de META_SCOPES (sin Instagram)', () => {
    const fbScopes = FACEBOOK_SCOPES.split(',');
    const metaScopes = META_SCOPES.split(',');
    for (const scope of fbScopes) {
      expect(metaScopes).toContain(scope);
    }
  });

  it('NO debe incluir scopes de Instagram', () => {
    expect(FACEBOOK_SCOPES).not.toContain('instagram_basic');
    expect(FACEBOOK_SCOPES).not.toContain('instagram_content_publish');
    expect(FACEBOOK_SCOPES).not.toContain('instagram_manage_insights');
  });

  it('debe tener menos scopes que META_SCOPES', () => {
    expect(FACEBOOK_SCOPES.split(',').length).toBeLessThan(META_SCOPES.split(',').length);
  });
});

// ============================================================
// getMetaAuthUrl
// ============================================================
describe('getMetaAuthUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.FACEBOOK_APP_ID = 'test-app-id-12345';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('debe generar URL con facebook.com/v19.0/dialog/oauth', () => {
    const url = getMetaAuthUrl('https://example.com/callback', 'state-abc');
    expect(url).toContain('https://www.facebook.com/v19.0/dialog/oauth');
  });

  it('debe incluir client_id desde FACEBOOK_APP_ID', () => {
    const url = getMetaAuthUrl('https://example.com/callback', 'state-abc');
    expect(url).toContain('client_id=test-app-id-12345');
  });

  it('debe incluir redirect_uri codificado', () => {
    const url = getMetaAuthUrl('https://example.com/callback', 'state-abc');
    expect(url).toContain('redirect_uri=');
    expect(url).toContain('example.com');
  });

  it('debe incluir state', () => {
    const url = getMetaAuthUrl('https://example.com/callback', 'my-custom-state-xyz');
    expect(url).toContain('state=my-custom-state-xyz');
  });

  it('debe incluir response_type=code', () => {
    const url = getMetaAuthUrl('https://example.com/callback', 'state-abc');
    expect(url).toContain('response_type=code');
  });

  it('debe usar META_SCOPES (no FACEBOOK_SCOPES) por defecto (platform=facebook)', () => {
    const url = getMetaAuthUrl('https://example.com/callback', 'state-abc', 'facebook');
    // getMetaAuthUrl siempre usa META_SCOPES, incluso para facebook
    expect(url).toContain('scope=' + encodeURIComponent(META_SCOPES));
  });

  it('debe usar META_SCOPES para platform=instagram también', () => {
    const url = getMetaAuthUrl('https://example.com/callback', 'state-abc', 'instagram');
    // La función actualmente devuelve META_SCOPES para ambas plataformas
    expect(url).toContain('scope=' + encodeURIComponent(META_SCOPES));
  });

  it('debe ser determinista para los mismos parámetros', () => {
    const a = getMetaAuthUrl('https://example.com/cb', 'state-1');
    const b = getMetaAuthUrl('https://example.com/cb', 'state-1');
    expect(a).toBe(b);
  });

  it('debe generar URLs diferentes para diferentes state', () => {
    const a = getMetaAuthUrl('https://example.com/cb', 'state-a');
    const b = getMetaAuthUrl('https://example.com/cb', 'state-b');
    expect(a).not.toBe(b);
  });
});
