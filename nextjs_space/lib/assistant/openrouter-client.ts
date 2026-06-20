import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenRouterToolCall[];
}

export interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenRouterTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface OpenRouterResponse {
  id: string;
  choices: {
    message: {
      content: string;
      role: string;
      tool_calls?: OpenRouterToolCall[];
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
 * Llama a google/gemma-4-31b-it:free via OpenRouter.
 */
async function callGemma4(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  return callOpenRouter('google/gemma-4-31b-it:free', messages, 0.3);
}

/**
 * Llama a nvidia/nemotron-3-ultra-550b-a55b:free via OpenRouter.
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
  messages: OpenRouterMessage[],
  tools?: OpenRouterTool[]
): Promise<OpenRouterResponse> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY no configurada');
  }

  const body: any = {
    model: 'deepseek-chat',
    messages,
    temperature: 0.4,
    max_tokens: 8192,
    top_p: 0.9
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
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
 * Llama a Google Gemini 2.5 Flash directamente (fallback cuando OpenRouter falla o como último recurso).
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
 * Pipeline de llamada con fallback — DeepSeek V4 Flash prioritario:
 * 1. DeepSeek V4 Flash directo (API nativa) — PRIMARIO
 * 2. deepseek/deepseek-chat:free via OpenRouter (respaldo 1)
 * 3. google/gemma-4-31b-it:free via OpenRouter (respaldo 2)
 * 4. nvidia/nemotron-3-ultra-550b-a55b:free via OpenRouter (respaldo 3)
 * 5. Google Gemini 2.5 Flash directo (respaldo final)
 */
export async function callAssistantWithFallback(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  // 1. DeepSeek V4 Flash directo
  if (DEEPSEEK_API_KEY) {
    try {
      console.log('[AI] Intentando DeepSeek V4 Flash (API directa)...');
      const response = await callDeepSeekV4FlashDirect(messages);
      console.log('[AI] ✅ DeepSeek V4 Flash respondió correctamente');
      return response;
    } catch (deepseekError) {
      console.warn('[AI] DeepSeek V4 Flash falló:', deepseekError);
    }
  }

  // 2. DeepSeek Chat via OpenRouter
  try {
    console.log('[AI] Fallback a deepseek/deepseek-chat:free...');
    const response = await callDeepSeekChat(messages);
    console.log('[AI] ✅ DeepSeek Chat respondió correctamente');
    return response;
  } catch (deepseekChatError) {
    console.warn('[AI] DeepSeek Chat falló:', deepseekChatError);
  }

  // 3. Gemma 4 via OpenRouter
  try {
    console.log('[AI] Fallback a google/gemma-4-31b-it:free...');
    const response = await callGemma4(messages);
    console.log('[AI] ✅ Gemma 4 respondió correctamente');
    return response;
  } catch (gemmaError) {
    console.warn('[AI] Gemma 4 falló:', gemmaError);
  }

  // 4. Nemotron via OpenRouter
  try {
    console.log('[AI] Fallback a nvidia/nemotron-3-ultra-550b-a55b:free...');
    const response = await callNemotron(messages);
    console.log('[AI] ✅ Nemotron respondió correctamente');
    return response;
  } catch (nemotronError) {
    console.warn('[AI] Nemotron falló:', nemotronError);
  }

  // 5. Fallback final: Google Gemini 2.5 Flash directo
  try {
    console.log('[AI] Fallback final a Google Gemini 2.5 Flash...');
    const response = await callGemini25Flash(messages);
    console.log('[AI] ✅ Gemini respondió correctamente');
    return response;
  } catch (geminiError) {
    console.error('[AI] ❌ Todos los modelos fallaron:', geminiError);
    throw geminiError;
  }
}

/**
 * Pipeline con soporte de function/tool calling para el chatbot.
 * 
 * 1. Intenta DeepSeek V4 Flash con tools → si el LLM pide ejecutar tools, las ejecuta
 *    y alimenta los resultados de vuelta (máx 2 iteraciones del loop).
 * 2. Si DeepSeek falla o no hay tool calls, fallback a callAssistantWithFallback (sin tools).
 *
 * @param messages - Historial de la conversación
 * @param tools - Definiciones de herramientas disponibles para el LLM
 * @param executeTool - Callback que ejecuta una herramienta y retorna el resultado como string
 */
export async function callAssistantWithToolLoop(
  messages: OpenRouterMessage[],
  tools: OpenRouterTool[],
  executeTool: (name: string, args: Record<string, any>) => Promise<string>
): Promise<OpenRouterResponse> {
  // 1. Intentar DeepSeek V4 Flash con tools
  if (DEEPSEEK_API_KEY) {
    try {
      console.log('[AI ToolLoop] Intentando DeepSeek V4 Flash con tools...');
      const response = await callDeepSeekV4FlashDirect(messages, tools);
      const choice = response.choices?.[0];

      // ¿El LLM decidió llamar una herramienta?
      if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        console.log(`[AI ToolLoop] 🔧 LLM solicita ${choice.message.tool_calls.length} tool(s): ${choice.message.tool_calls.map(t => t.function.name).join(', ')}`);
        const toolResult = await runToolLoop(choice.message.tool_calls, executeTool, messages, tools);
        if (toolResult) return toolResult;
      }

      // Sin tool calls: respuesta directa
      if (choice?.message?.content) {
        console.log('[AI ToolLoop] ✅ DeepSeek respondió directamente (sin tools)');
        return response;
      }
    } catch (err) {
      console.warn('[AI ToolLoop] DeepSeek con tools falló:', err);
    }
  }

  // 2. Fallback: llamada normal sin tools
  console.log('[AI ToolLoop] Fallback a callAssistantWithFallback (sin tools)...');
  return callAssistantWithFallback(messages);
}

/**
 * Ejecuta el loop de tool calls: ejecuta herramientas, alimenta resultados, re-consulta al LLM.
 * Máximo 2 iteraciones para evitar bucles infinitos.
 */
async function runToolLoop(
  toolCalls: OpenRouterToolCall[],
  executeTool: (name: string, args: Record<string, any>) => Promise<string>,
  originalMessages: OpenRouterMessage[],
  tools: OpenRouterTool[],
  maxIterations = 2
): Promise<OpenRouterResponse | null> {
  const messages = [...originalMessages];
  let currentToolCalls = toolCalls;

  for (let i = 0; i < maxIterations; i++) {
    // Añadir mensaje del assistant con tool_calls
    messages.push({
      role: 'assistant' as const,
      content: '',
      tool_calls: currentToolCalls,
    });

    // Ejecutar cada tool call y añadir resultado
    for (const tc of currentToolCalls) {
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        console.warn(`[AI ToolLoop] JSON inválido en argumentos de ${tc.function.name}: ${tc.function.arguments}`);
      }

      const result = await executeTool(tc.function.name, args);

      messages.push({
        role: 'tool' as const,
        content: result,
        tool_call_id: tc.id,
        name: tc.function.name,
      });
    }

    // Re-consultar al LLM con los resultados
    try {
      const response = await callDeepSeekV4FlashDirect(messages, tools);
      const choice = response.choices?.[0];

      // ¿Más tool calls?
      if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        console.log(`[AI ToolLoop] 🔧 Iteración ${i + 1}: LLM pide ${choice.message.tool_calls.length} tool(s) más`);
        currentToolCalls = choice.message.tool_calls;
        continue;
      }

      // Respuesta final
      if (choice?.message?.content) {
        console.log(`[AI ToolLoop] ✅ Respuesta final tras ${i + 1} iteraciones de tools`);
        return response;
      }

      return null;
    } catch (err) {
      console.warn(`[AI ToolLoop] Error en iteración ${i + 1}:`, err);
      return null;
    }
  }

  console.warn(`[AI ToolLoop] ⚠️ Límite de ${maxIterations} iteraciones alcanzado`);
  return null;
}

/**
 * Pipeline genérico con modelo configurable y fallback a DeepSeek Chat / Nemotron / Gemini.
 */
export async function callOpenRouterWithFallback(
  model: string,
  messages: OpenRouterMessage[],
  temperature = 0.7,
  maxTokens = 500
): Promise<OpenRouterResponse> {
  // 1. Modelo configurado via OpenRouter
  try {
    console.log(`[AI] Intentando ${model} via OpenRouter...`);
    const response = await callOpenRouter(model, messages, temperature, maxTokens);
    console.log(`[AI] ✅ ${model} respondió correctamente`);
    return response;
  } catch (openRouterError) {
    console.warn(`[AI] ${model} falló:`, openRouterError);
  }

  // 2. DeepSeek Chat via OpenRouter
  if (model !== 'deepseek/deepseek-chat:free') {
    try {
      console.log('[AI] Fallback a deepseek/deepseek-chat:free...');
      const response = await callDeepSeekChat(messages);
      console.log('[AI] ✅ DeepSeek Chat respondió correctamente');
      return response;
    } catch (dsChatError) {
      console.warn('[AI] DeepSeek Chat falló:', dsChatError);
    }
  }

  // 3. Nemotron via OpenRouter
  if (model !== 'nvidia/nemotron-3-ultra-550b-a55b:free') {
    try {
      console.log('[AI] Fallback a nvidia/nemotron-3-ultra-550b-a55b:free...');
      const response = await callNemotron(messages);
      console.log('[AI] ✅ Nemotron respondió correctamente');
      return response;
    } catch (nemotronError) {
      console.warn('[AI] Nemotron falló:', nemotronError);
    }
  }

  // 4. Fallback final: Google Gemini 2.5 Flash directo
  try {
    console.log('[AI] Fallback final a Google Gemini 2.5 Flash...');
    const response = await callGemini25Flash(messages);
    console.log('[AI] ✅ Gemini respondió correctamente');
    return response;
  } catch (geminiError) {
    console.error('[AI] ❌ Todos fallaron:', geminiError);
    throw geminiError;
  }
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

const OPENROUTER_EMBEDDING_MODEL = 'intfloat/e5-large-v2';

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
}

type EmbeddingType = 'passage' | 'query';

/**
 * Llama al endpoint de embeddings de OpenRouter.
 * e5 models require "query: " or "passage: " prefix.
 */
async function callEmbeddingAPI(text: string, type: EmbeddingType): Promise<EmbeddingResult> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY no configurada');
  }

  const input = `${type}: ${text}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://volkern.app',
        'X-Title': 'Volkern Knowledge Embeddings',
      },
      body: JSON.stringify({
        model: OPENROUTER_EMBEDDING_MODEL,
        input,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter Embedding error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    if (!data?.data?.[0]?.embedding) {
      throw new Error('OpenRouter Embedding: respuesta vacía o sin embedding');
    }

    return {
      embedding: data.data[0].embedding,
      tokens: data.usage?.total_tokens || 0,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Genera un embedding vectorial para un artículo/documento.
 * Costo: ~$0.00013/1K tokens — insignificante para artículos de KB.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  return callEmbeddingAPI(text, 'passage');
}

/**
 * Genera un embedding para una query de búsqueda.
 */
export async function generateQueryEmbedding(query: string): Promise<EmbeddingResult> {
  return callEmbeddingAPI(query, 'query');
}

// Para retrocompatibilidad
export const callDeepSeekV4Flash = callDeepSeekV4FlashDirect;
export { callGemini25Flash };
