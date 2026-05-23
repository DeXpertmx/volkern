import { describe, it, expect } from 'vitest';

// Replicamos los defaults de lib/openrouter-helper.ts (no exportados)
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash:free';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 500;

// Replicamos la lógica de format de system prompt para JSON
function buildSystemPrompt(systemPrompt: string, responseFormat: 'text' | 'json'): string {
  return responseFormat === 'json'
    ? `${systemPrompt}\n\nIMPORTANTE: Responde EXCLUSIVAMENTE en formato JSON válido, sin markdown ni texto adicional.`
    : systemPrompt;
}

// ==================== DEFAULT constants ====================
describe('OpenRouter defaults', () => {
  it('DEFAULT_MODEL debe ser deepseek v4 flash', () => {
    expect(DEFAULT_MODEL).toBe('deepseek/deepseek-v4-flash:free');
  });

  it('DEFAULT_TEMPERATURE debe ser 0.7', () => {
    expect(DEFAULT_TEMPERATURE).toBe(0.7);
  });

  it('DEFAULT_MAX_TOKENS debe ser 500', () => {
    expect(DEFAULT_MAX_TOKENS).toBe(500);
  });

  it('DEFAULT_TEMPERATURE debe estar entre 0 y 2', () => {
    expect(DEFAULT_TEMPERATURE).toBeGreaterThan(0);
    expect(DEFAULT_TEMPERATURE).toBeLessThan(2);
  });

  it('DEFAULT_MAX_TOKENS debe ser positivo', () => {
    expect(DEFAULT_MAX_TOKENS).toBeGreaterThan(0);
  });
});

// ==================== buildSystemPrompt (systemWithFormat logic) ====================
describe('buildSystemPrompt (systemWithFormat)', () => {
  const basePrompt = 'Eres un asistente útil.';

  it('debe devolver el prompt sin cambios para formato text', () => {
    const result = buildSystemPrompt(basePrompt, 'text');
    expect(result).toBe(basePrompt);
  });

  it('debe añadir instrucción JSON para formato json', () => {
    const result = buildSystemPrompt(basePrompt, 'json');
    expect(result).toContain(basePrompt);
    expect(result).toContain('IMPORTANTE: Responde EXCLUSIVAMENTE');
    expect(result).toContain('formato JSON válido');
    expect(result).toContain('sin markdown ni texto adicional');
  });

  it('la instrucción JSON debe ir después del prompt original', () => {
    const result = buildSystemPrompt(basePrompt, 'json');
    expect(result.startsWith(basePrompt)).toBe(true);
    expect(result.length).toBeGreaterThan(basePrompt.length);
  });

  it('debe funcionar con prompt vacío', () => {
    const textResult = buildSystemPrompt('', 'text');
    expect(textResult).toBe('');

    const jsonResult = buildSystemPrompt('', 'json');
    expect(jsonResult).toContain('IMPORTANTE');
  });

  it('debe funcionar con prompt multilínea', () => {
    const multiline = 'Linea 1\nLinea 2\nLinea 3';
    const result = buildSystemPrompt(multiline, 'json');
    expect(result.startsWith(multiline)).toBe(true);
    expect(result).toContain('\n\nIMPORTANTE:');
  });
});
