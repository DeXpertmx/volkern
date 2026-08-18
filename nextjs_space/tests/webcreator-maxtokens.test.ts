import { describe, it, expect } from 'vitest';
import { callWebCreatorWithFallback } from '../lib/assistant/openrouter-client';

// Verifica los fixes de fiabilidad del Web Creator:
//  1. max_tokens ampliado a 16K (una página completa truncaba el JSON a 8K).
//  2. Google Gemini es el PRIMARIO (era el último recurso): es el único que
//     responde rápido y con JSON limpio, y evita que el request exceda el
//     límite de ~100s de Cloudflare (524) quemando timeouts en Ling/Nemotron.
describe('callWebCreatorWithFallback (fiabilidad)', () => {
  it('usa 16384 tokens como default (no reintroduce el tope corto de 8192)', () => {
    const src = callWebCreatorWithFallback.toString();
    expect(src).toContain('16384');
    expect(src).not.toMatch(/maxTokens = 8192/);
  });

  it('propaga maxTokens a todos los hops de la cadena', () => {
    const src = callWebCreatorWithFallback.toString();
    expect(src.match(/maxTokens/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(src).not.toMatch(/callDotsStudioFree\(messages, 60000\)/);
    expect(src).not.toMatch(/callNemotron3UltraFree\(messages, 60000\)/);
    expect(src).not.toMatch(/callGemini25Flash\(messages, 30000\)/);
  });

  it('Gemini va ANTES que Ling/Nemotron (primario, no último recurso)', () => {
    const src = callWebCreatorWithFallback.toString();
    const geminiIdx = src.indexOf('callGemini25Flash');
    const dotsIdx = src.indexOf('callDotsStudioFree');
    const nemotronIdx = src.indexOf('callNemotron3UltraFree');
    expect(geminiIdx).toBeGreaterThan(-1);
    expect(dotsIdx).toBeGreaterThan(geminiIdx);
    expect(nemotronIdx).toBeGreaterThan(geminiIdx);
    // Gemini es el PRIMARIO: aparece antes que el primer fallback
    expect(src.indexOf('Intentando Google Gemini')).toBeLessThan(src.indexOf('Fallback a dots-studio'));
  });

  it('DeepSeek quedó como último recurso (402 sin saldo no debe bloquear)', () => {
    const src = callWebCreatorWithFallback.toString();
    expect(src.indexOf('Último recurso: DeepSeek')).toBeGreaterThan(src.indexOf('Fallback a nvidia'));
  });
});
