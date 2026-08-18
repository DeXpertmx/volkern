import { describe, it, expect } from 'vitest';
import { callWebCreatorWithFallback } from '../lib/assistant/openrouter-client';

// Verifica que la cadena WebCreator pida generaciones largas (16K tokens) por
// defecto: una landing page espectacular supera los 8K tokens y con 8192 el
// JSON salía truncado e inválido (causa raíz del 502 "no se pudo generar").
describe('callWebCreatorWithFallback (max_tokens ampliado)', () => {
  it('usa 16384 tokens como default (no reintroduce el tope corto de 8192)', () => {
    const src = callWebCreatorWithFallback.toString();
    expect(src).toContain('16384');
    expect(src).not.toMatch(/maxTokens = 8192/);
  });

  it('propaga maxTokens a todos los hops de la cadena', () => {
    const src = callWebCreatorWithFallback.toString();
    // Cada hop recibe maxTokens (no el literal 8192 hardcodeado)
    expect(src.match(/maxTokens/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(src).not.toMatch(/callDotsStudioFree\(messages, 60000\)/);
    expect(src).not.toMatch(/callNemotron3UltraFree\(messages, 60000\)/);
    expect(src).not.toMatch(/callGemini25Flash\(messages, 30000\)/);
  });
});
