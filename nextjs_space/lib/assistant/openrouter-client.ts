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
 * Llama a la API directa de Google (Gemini Flash) usando GOOGLE_AI_KEY.
 * Es gratuita y no requiere créditos de OpenRouter.
 */
async function callGoogleDirect(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  const gemmaMessages: GemmaMessage[] = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : m.role,
    content: m.content
  }));

  const result = await callGemma(gemmaMessages, {
    temperature: 0.1,
    maxTokens: 1000,
    responseMimeType: 'application/json'
  });

  if (result.error) {
    throw new Error(`Google AI error: ${result.error}`);
  }

  if (!result.content) {
    throw new Error('Google AI retornó respuesta vacía');
  }

  // Adaptar la respuesta de Google al formato de OpenRouter
  return {
    id: 'google-direct-' + Date.now(),
    choices: [{
      message: {
        content: result.content,
        role: 'assistant'
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

/**
 * Intento principal: MiniMax M2.5 via OpenRouter.
 * Solo se usa si OpenRouter tiene créditos disponibles.
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
      model: 'minimax/minimax-m2.5',
      messages,
      temperature: 0.1,
      max_tokens: 1000,
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
 * 1. Google Gemini directo (gratis, via GOOGLE_AI_KEY)
 * 2. MiniMax M2.5 via OpenRouter (si Google falla)
 */
export async function callAssistantWithFallback(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  // 1. Intentar Google Gemini directo (gratis, sin límites de crédito)
  try {
    console.log('[AI] Intentando Google Gemini directo...');
    const response = await callGoogleDirect(messages);
    console.log('[AI] ✅ Google Gemini respondió correctamente');
    return response;
  } catch (googleError) {
    console.warn('[AI] Google Gemini falló:', googleError);
  }

  // 2. Fallback: MiniMax via OpenRouter
  try {
    console.log('[AI] Intentando MiniMax M2.5 via OpenRouter...');
    const response = await callMinimaxM25(messages);
    console.log('[AI] ✅ MiniMax respondió correctamente');
    return response;
  } catch (minimaxError) {
    console.error('[AI] ❌ MiniMax también falló:', minimaxError);
    throw minimaxError;
  }
}