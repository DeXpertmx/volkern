import { describe, it, expect } from 'vitest';
import { replaceTemplateVariables } from '@/lib/ses-email';
import { getFromAddress } from '@/lib/resend-email';

// ==================== replaceTemplateVariables ====================
describe('replaceTemplateVariables', () => {
  it('debe reemplazar una variable simple', () => {
    const result = replaceTemplateVariables('Hola {name}', { name: 'Juan' });
    expect(result).toBe('Hola Juan');
  });

  it('debe reemplazar múltiples variables', () => {
    const template = 'Hola {name}, tu código es {code}';
    const result = replaceTemplateVariables(template, {
      name: 'María',
      code: 'ABC-123',
    });
    expect(result).toBe('Hola María, tu código es ABC-123');
  });

  it('debe reemplazar todas las ocurrencias de una variable (global)', () => {
    const template = '{name} dijo que {name} vendrá';
    const result = replaceTemplateVariables(template, { name: 'Pedro' });
    expect(result).toBe('Pedro dijo que Pedro vendrá');
  });

  it('debe dejar intacto el template si no hay variables', () => {
    const template = 'Hola mundo, sin variables';
    const result = replaceTemplateVariables(template, {});
    expect(result).toBe(template);
  });

  it('debe dejar sin reemplazar variables no definidas', () => {
    const result = replaceTemplateVariables('Hola {name}', {});
    expect(result).toBe('Hola {name}');
  });

  it('debe dejar sin reemplazar variables parciales', () => {
    const result = replaceTemplateVariables('Hola {name}, {unset}', { name: 'Ana' });
    expect(result).toBe('Hola Ana, {unset}');
  });

  it('debe manejar template vacío', () => {
    const result = replaceTemplateVariables('', { name: 'X' });
    expect(result).toBe('');
  });

  it('debe manejar variables con valores vacíos', () => {
    const result = replaceTemplateVariables('Hola {name}', { name: '' });
    expect(result).toBe('Hola ');
  });

  it('debe ser case-sensitive en nombres de variable', () => {
    const result = replaceTemplateVariables('Hola {Name}', { Name: 'Luis', name: 'luis' });
    expect(result).toBe('Hola Luis');
  });

  it('debe manejar variables con caracteres especiales en valor', () => {
    const result = replaceTemplateVariables('Resultado: {val}', {
      val: '100 € — Café & Té',
    });
    expect(result).toBe('Resultado: 100 € — Café & Té');
  });
});

// ==================== getFromAddress ====================
// El FROM usa SIEMPRE el dominio verificado en Resend (`noreply@volkern.app`)
// con el nombre visible del tenant. Solo se usa un subdominio propio si está
// declarado explícitamente en RESEND_VERIFIED_DOMAINS.
describe('getFromAddress', () => {
  const originalEnv = process.env.RESEND_VERIFIED_DOMAINS;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.RESEND_VERIFIED_DOMAINS;
    else process.env.RESEND_VERIFIED_DOMAINS = originalEnv;
  });

  it('debe usar el dominio raíz verificado para cualquier tenant sin subdominio declarado', () => {
    delete process.env.RESEND_VERIFIED_DOMAINS;
    const result = getFromAddress('admin');
    expect(result).toContain('noreply@volkern.app');
    expect(result).toContain('Volkern');
    expect(result).not.toContain('admin.volkern.app');
  });

  it('debe usar el subdominio SOLO si está declarado en RESEND_VERIFIED_DOMAINS', () => {
    process.env.RESEND_VERIFIED_DOMAINS = 'volkern.app,demo.volkern.app';
    const result = getFromAddress('demo');
    expect(result).toContain('noreply@demo.volkern.app');
  });

  it('debe ignorar un subdomain no declarado aunque tenga datos del tenant', () => {
    delete process.env.RESEND_VERIFIED_DOMAINS;
    const result = getFromAddress('unknown-subdomain');
    expect(result).toContain('noreply@volkern.app');
    expect(result).not.toContain('unknown-subdomain.volkern.app');
  });

  it('debe devolver el dominio raíz para undefined', () => {
    delete process.env.RESEND_VERIFIED_DOMAINS;
    const result = getFromAddress(undefined);
    expect(result).toContain('noreply@volkern.app');
    expect(typeof result).toBe('string');
  });

  it('debe incluir el nombre del tenant si se pasa', () => {
    delete process.env.RESEND_VERIFIED_DOMAINS;
    const result = getFromAddress('dexpert', 'Dimension eXpert');
    expect(result).toContain('Dimension eXpert');
    expect(result).toContain('noreply@volkern.app');
  });

  it('todas las direcciones deben incluir "Volkern" o el nombre del tenant', () => {
    const addresses = [
      getFromAddress('admin'),
      getFromAddress('demo'),
      getFromAddress(undefined),
      getFromAddress('unknown'),
    ];
    for (const addr of addresses) {
      expect(addr).toContain('Volkern');
    }
  });
});
