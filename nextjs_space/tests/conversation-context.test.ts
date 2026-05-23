import { describe, it, expect } from 'vitest';
import { sanitizeInput } from '@/lib/agents/conversation-context';

describe('sanitizeInput', () => {
  it('debe eliminar tags HTML (angle brackets)', () => {
    const result = sanitizeInput('<script>alert("xss")</script>');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('script');
    expect(result).toContain('alert');
  });

  it('debe eliminar protocolo javascript:', () => {
    const result = sanitizeInput('javascript:void(0)');
    expect(result).not.toMatch(/javascript:/i);
  });

  it('debe eliminar handlers inline (onX=)', () => {
    const result = sanitizeInput('onclick=alert(1) onerror=evil()');
    expect(result).not.toMatch(/onclick=/i);
    expect(result).not.toMatch(/onerror=/i);
    // onX se elimina pero el contenido después del = queda
  });

  it('debe hacer trim de espacios laterales', () => {
    const result = sanitizeInput('   hello world   ');
    expect(result).toBe('hello world');
  });

  it('debe truncar a 4000 caracteres', () => {
    const longInput = 'a'.repeat(5000);
    const result = sanitizeInput(longInput);
    expect(result.length).toBeLessThanOrEqual(4000);
  });

  it('debe preservar input dentro del límite intacto (sin HTML)', () => {
    const input = 'Hola, ¿cómo estás? #123';
    const result = sanitizeInput(input);
    expect(result).toBe(input);
  });

  it('debe manejar input vacío', () => {
    const result = sanitizeInput('');
    expect(result).toBe('');
  });

  it('debe manejar solo espacios', () => {
    const result = sanitizeInput('     ');
    expect(result).toBe('');
  });

  it('debe eliminar javascript: case-insensitive', () => {
    const result = sanitizeInput('JavaScript:void(0)');
    expect(result).not.toMatch(/javascript:/i);
  });

  it('debe eliminar onX handlers con cualquier sufijo', () => {
    const result = sanitizeInput('onfocus=steal() onblur=hack() onmouseover=trap()');
    expect(result).not.toMatch(/onfocus=/i);
    expect(result).not.toMatch(/onblur=/i);
    expect(result).not.toMatch(/onmouseover=/i);
    // El contenido después del = permanece
    expect(result).toContain('steal()');
  });

  it('debe soportar texto con emojis y unicode', () => {
    const input = 'Hola 👋 mundo 🌍 — café ñoño';
    const result = sanitizeInput(input);
    expect(result).toBe(input);
  });

  it('debe ser determinista', () => {
    const input = '<b>test</b> onclick=x';
    const r1 = sanitizeInput(input);
    const r2 = sanitizeInput(input);
    expect(r1).toBe(r2);
  });

  it('debe preservar texto normal con caracteres especiales', () => {
    const input = 'user@example.com / path/to/file #hashtag @mention';
    const result = sanitizeInput(input);
    expect(result).toBe(input);
  });
});
