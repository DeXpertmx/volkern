import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

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

/**
 * Llama a Gemini 2.5 Flash directamente (fallback cuando OpenRouter falla).
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
 * Intento principal: MiniMax M2.5 (free) via OpenRouter.
 * Es gratuito con rate limits.
 */
export async function callMinimaxM25(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY no configurada');
  }

  const response = await fetch(OPENROUTER_BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://volkern.app',
      'X-Title': 'Volkern CRM Assistant'
    },
    body: JSON.stringify({
      model: 'minimax/minimax-m2.5:free',
      messages,
      temperature: 0.3,
      max_tokens: 8192,
      top_p: 0.9
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  
  // Validar que la respuesta tenga contenido
  if (!data?.choices?.[0]?.message?.content) {
    throw new Error('MiniMax retornó una respuesta vacía o nula');
  }

  return data;
}

/**
 * Pipeline de llamada con fallback:
 * 1. Google Gemini directo (primario - gratis y sin límites)
 * 2. MiniMax M2.5 (free) via OpenRouter (fallback)
 */
export async function callAssistantWithFallback(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  // 1. Intentar Google Gemini directo (primario - sin límites de uso)
  try {
    console.log('[AI] Intentando Google Gemini 2.5 Flash...');
    const response = await callGemini25Flash(messages);
    console.log('[AI] ✅ Gemini respondió correctamente');
    return response;
  } catch (geminiError) {
    console.warn('[AI] Gemini falló:', geminiError);
  }

  // 2. Fallback: MiniMax via OpenRouter (puede tener rate limits)
  try {
    console.log('[AI] Intentando MiniMax M2.5 via OpenRouter...');
    const response = await callMinimaxM25(messages);
    console.log('[AI] ✅ MiniMax respondió correctamente');
    return response;
  } catch (minimaxError) {
    console.error('[AI] ❌ Ambos fallaron:', minimaxError);
    throw minimaxError;
  }
}