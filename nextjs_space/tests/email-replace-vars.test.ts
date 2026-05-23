import { describe, it, expect } from 'vitest';
import { replaceTemplateVariables, getFromAddress } from '@/lib/ses-email';

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
describe('getFromAddress', () => {
  it('debe devolver dirección admin para subdomain "admin"', () => {
    const result = getFromAddress('admin');
    expect(result).toContain('noreply@volkern.app');
    expect(result).toContain('Volkern');
  });

  it('debe devolver dirección demo para subdomain "demo"', () => {
    const result = getFromAddress('demo');
    expect(result).toContain('noreply@volkern.app');
  });

  it('debe devolver dirección default para subdomain no definido', () => {
    const result = getFromAddress('unknown-subdomain');
    expect(result).toContain('noreply@volkern.app');
  });

  it('debe devolver dirección default para undefined', () => {
    const result = getFromAddress(undefined);
    expect(result).toContain('noreply@volkern.app');
    expect(typeof result).toBe('string');
  });

  it('todas las direcciones deben incluir "Volkern"', () => {
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
