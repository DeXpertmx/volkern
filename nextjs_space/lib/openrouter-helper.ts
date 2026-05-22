/**
 * OpenRouter Helper — reemplaza las llamadas LLM de Abacus AI
 * Usa OpenRouter con fallback modelo → Gemini 2.5 Flash
 */
import {
  callOpenRouterWithFallback,
  OpenRouterMessage,
} from '@/lib/assistant/openrouter-client';

export interface LlmCallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash:free';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 500;

/**
 * Llama a un modelo LLM via OpenRouter con fallback automático a Gemini.
 * Simplifica la migración desde Abacus AI.
 */
export async function callLlm(
  systemPrompt: string,
  userPrompt: string,
  options: LlmCallOptions = {}
): Promise<string> {
  const {
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    responseFormat = 'text',
  } = options;

  // Agregar instrucción de formato si es JSON
  const systemWithFormat = responseFormat === 'json'
    ? `${systemPrompt}\n\nIMPORTANTE: Responde EXCLUSIVAMENTE en formato JSON válido, sin markdown ni texto adicional.`
    : systemPrompt;

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: systemWithFormat },
    { role: 'user', content: userPrompt },
  ];

  const response = await callOpenRouterWithFallback(
    model,
    messages,
    temperature,
    maxTokens
  );

  const content = response.choices?.[0]?.message?.content || '';

  if (!content) {
    throw new Error('OpenRouter devolvió respuesta vacía');
  }

  return content.trim();
}
