import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterResponse {
  id: string;
  choices: {
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callOpenRouter(model: string, messages: OpenRouterMessage[], temperature = 0.3, maxTokens = 8192): Promise<OpenRouterResponse> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY no configurada');
  }

  const response = await fetch(OPENROUTER_BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://volkern.app',
      'X-Title': 'Volkern CRM Assistant',
      'X-No-Logging': 'true'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      top_p: 0.9
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error (${model}): ${response.status} - ${error}`);
  }

  const data = await response.json();

  if (!data?.choices?.[0]?.message?.content) {
    throw new Error(`${model} retornó respuesta vacía o nula`);
  }

  return data;
}

/**
 * Llama a google/gemma-4-31b-it:free via OpenRouter — modelo principal.
 */
async function callGemma4(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  return callOpenRouter('google/gemma-4-31b-it:free', messages, 0.3);
}

/**
 * Llama a nvidia/nemotron-3-ultra-550b-a55b:free via OpenRouter — modelo de respaldo.
 */
async function callNemotron(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  return callOpenRouter('nvidia/nemotron-3-ultra-550b-a55b:free', messages, 0.3);
}

/**
 * Llama a DeepSeek V4 Flash directamente (API nativa, OpenAI-compatible).
 * Usa DEEPSEEK_API_KEY del environment.
 */
async function callDeepSeekV4FlashDirect(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY no configurada');
  }

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      messages,
      temperature: 0.4,
      max_tokens: 8192,
      top_p: 0.9
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek V4 Flash error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  if (!data?.choices?.[0]?.message?.content) {
    throw new Error('DeepSeek V4 Flash retornó respuesta vacía o nula');
  }

  return data;
}

/**
 * Llama a deepseek/deepseek-chat:free via OpenRouter (fallback si la API directa falla).
 */
async function callDeepSeekChat(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  return callOpenRouter('deepseek/deepseek-chat:free', messages, 0.4, 8192);
}

/**
 * Pipeline de llamada para Web Creator (DeepSeek V4 Flash prioritario):
 * 1. DeepSeek V4 Flash directo (API nativa) — PRIMARIO
 * 2. deepseek/deepseek-chat:free via OpenRouter (respaldo 1)
 * 3. google/gemma-4-31b-it:free via OpenRouter (respaldo 2)
 * 4. nvidia/nemotron-3-ultra-550b-a55b:free via OpenRouter (respaldo 3)
 * 5. Google Gemini 2.5 Flash directo (respaldo final)
 */
export async function callWebCreatorWithFallback(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  // 1. DeepSeek V4 Flash directo
  try {
    console.log('[AI WebCreator] Intentando DeepSeek V4 Flash (API directa)...');
    const response = await callDeepSeekV4FlashDirect(messages);
    console.log('[AI WebCreator] ✅ DeepSeek V4 Flash respondió correctamente');
    return response;
  } catch (error) {
    console.warn('[AI WebCreator] DeepSeek V4 Flash falló:', error);
  }

  // 2. DeepSeek Chat via OpenRouter
  try {
    console.log('[AI WebCreator] Fallback a deepseek/deepseek-chat:free...');
    const response = await callDeepSeekChat(messages);
    console.log('[AI WebCreator] ✅ DeepSeek Chat respondió correctamente');
    return response;
  } catch (error) {
    console.warn('[AI WebCreator] DeepSeek Chat falló:', error);
  }

  // 3. Gemma 4 via OpenRouter
  try {
    console.log('[AI WebCreator] Fallback a google/gemma-4-31b-it:free...');
    const response = await callGemma4(messages);
    console.log('[AI WebCreator] ✅ Gemma 4 respondió correctamente');
    return response;
  } catch (error) {
    console.warn('[AI WebCreator] Gemma 4 falló:', error);
  }

  // 4. Nemotron
  try {
    console.log('[AI WebCreator] Fallback a nvidia/nemotron-3-ultra-550b-a55b:free...');
    const response = await callNemotron(messages);
    console.log('[AI WebCreator] ✅ Nemotron respondió correctamente');
    return response;
  } catch (error) {
    console.warn('[AI WebCreator] Nemotron falló:', error);
  }

  // 5. Fallback final: Google Gemini 2.5 Flash directo
  try {
    console.log('[AI WebCreator] Fallback final a Google Gemini 2.5 Flash...');
    const response = await callGemini25Flash(messages);
    console.log('[AI WebCreator] ✅ Gemini respondió correctamente');
    return response;
  } catch (error) {
    console.error('[AI WebCreator] ❌ Todos los modelos fallaron:', error);
    throw error;
  }
}

/**
 * Llama a Google Gemini 2.5 Flash directamente (fallback cuando OpenRouter falla).
 */
async function callGemini25Flash(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_KEY}`;

  if (!GOOGLE_AI_KEY) {
    throw new Error('GOOGLE_AI_KEY no configurada');
  }

  const systemInstruction = messages.find(m => m.role === 'system')?.content;
  const history = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

  if (systemInstruction && history.length > 0 && history[0].role === 'user') {
    history[0].parts[0].text = `[System Instructions]\n${systemInstruction}\n\n[User Message]\n${history[0].parts[0].text}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: history,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        response_mime_type: 'application/json',
      }
    }),
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini 2.5 Flash error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (!content) {
    throw new Error('Gemini 2.5 Flash retornó respuesta vacía');
  }

  return {
    id: 'gemini-2.5-' + Date.now(),
    choices: [{
      message: { content, role: 'assistant' },
      finish_reason: 'stop'
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
}

/**
 * Pipeline de llamada con fallback:
 * 1. google/gemma-4-31b-it:free via OpenRouter (primario)
 * 2. nvidia/nemotron-3-ultra-550b-a55b:free via OpenRouter (respaldo)
 * 3. Google Gemini 2.5 Flash directo (respaldo final)
 */
export async function callAssistantWithFallback(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  // 1. Intentar Gemma 4 via OpenRouter
  try {
    console.log('[AI] Intentando google/gemma-4-31b-it:free...');
    const response = await callGemma4(messages);
    console.log('[AI] ✅ Gemma 4 respondió correctamente');
    return response;
  } catch (gemmaError) {
    console.warn('[AI] Gemma 4 falló:', gemmaError);
  }

  // 2. Intentar Nemotron via OpenRouter
  try {
    console.log('[AI] Intentando nvidia/nemotron-3-ultra-550b-a55b:free...');
    const response = await callNemotron(messages);
    console.log('[AI] ✅ Nemotron respondió correctamente');
    return response;
  } catch (nemotronError) {
    console.warn('[AI] Nemotron falló:', nemotronError);
  }

  // 3. Fallback final: Google Gemini 2.5 Flash directo
  try {
    console.log('[AI] Intentando Google Gemini 2.5 Flash...');
    const response = await callGemini25Flash(messages);
    console.log('[AI] ✅ Gemini respondió correctamente');
    return response;
  } catch (geminiError) {
    console.error('[AI] ❌ Todos los modelos fallaron:', geminiError);
    throw geminiError;
  }
}

/**
 * Pipeline genérico con modelo configurable y fallback a Nemotron / Gemini.
 */
export async function callOpenRouterWithFallback(
  model: string,
  messages: OpenRouterMessage[],
  temperature = 0.7,
  maxTokens = 500
): Promise<OpenRouterResponse> {
  try {
    console.log(`[AI] Intentando ${model} via OpenRouter...`);
    const response = await callOpenRouter(model, messages, temperature, maxTokens);
    console.log(`[AI] ✅ ${model} respondió correctamente`);
    return response;
  } catch (openRouterError) {
    console.warn(`[AI] ${model} falló:`, openRouterError);
  }

  // Fallback: nvidia/nemotron-3-ultra-550b-a55b:free via OpenRouter
  if (model !== 'nvidia/nemotron-3-ultra-550b-a55b:free') {
    try {
      console.log('[AI] Intentando nvidia/nemotron-3-ultra-550b-a55b:free...');
      const response = await callNemotron(messages);
      console.log('[AI] ✅ Nemotron respondió correctamente');
      return response;
    } catch (nemotronError) {
      console.warn('[AI] Nemotron falló:', nemotronError);
    }
  }

  // Fallback final: Google Gemini 2.5 Flash directo
  try {
    console.log('[AI] Intentando Google Gemini 2.5 Flash (fallback)...');
    const response = await callGemini25Flash(messages);
    console.log('[AI] ✅ Gemini respondió correctamente');
    return response;
  } catch (geminiError) {
    console.error('[AI] ❌ Todos fallaron:', geminiError);
    throw geminiError;
  }
}

// Para retrocompatibilidad
export const callDeepSeekV4Flash = callGemma4;
export { callGemini25Flash };
