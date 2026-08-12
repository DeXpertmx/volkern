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

export async function callOpenRouter(model: string, messages: OpenRouterMessage[], temperature = 0.3, maxTokens = 8192, timeoutMs = 20000): Promise<OpenRouterResponse> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY no configurada');
  }

  // Los modelos free de OpenRouter (google/gemma-4-*) usan un pool compartido
  // y devuelven 429 intermitente ("retry shortly"). Reintentamos con backoff
  // corto para que un rate-limit transitorio NO haga saltar todo el fallback
  // (antes TODOS los modelos daban 429 a la vez y la consulta agotaba el
  // timeout de 25s del webhook).
  const MAX_RETRIES = 2;
  const started = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Presupuesto TOTAL acotado a timeoutMs (deadline compartido entre intentos).
    // Si un modelo se cuelga (no 429, sino abort por timeout), el catch reintentaría
    // hasta 3×timeoutMs — eso reventaría el presupuesto del webhook de Telegram.
    // Con este deadline, un modelo colgado consume a lo sumo timeoutMs y la cadena
    // avanza al siguiente fallback.
    const elapsed = Date.now() - started;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) {
      throw lastError ?? new Error(`OpenRouter error (${model}): timeout total agotado`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), remaining);

    try {
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
        }),
        signal: controller.signal,
      });

      if (response.status === 429) {
        const errorBody = await response.text().catch(() => '');
        // 429 del pool compartido (upstream_provider_shared_pool) dura 30-60s:
        // reintentar en milisegundos es inútil → fallar rápido para que la
        // cadena pase al siguiente proveedor (Ling) sin quemar presupuesto.
        if (errorBody.includes('upstream_provider_shared_pool')) {
          throw new Error(`OpenRouter error (${model}): ${response.status} - ${errorBody}`);
        }
        if (attempt < MAX_RETRIES) {
          // Rate-limit individual/transitorio: esperar y reintentar
          await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
          continue;
        }
        throw new Error(`OpenRouter error (${model}): ${response.status} - ${errorBody}`);
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter error (${model}): ${response.status} - ${error}`);
      }

      const data = await response.json();

      if (!data?.choices?.[0]?.message?.content) {
        throw new Error(`${model} retornó respuesta vacía o nula`);
      }

      return data;
    } catch (e: any) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // Un 429 del pool compartido de Google dura 30-60s: reintentarlo en ms es
      // inútil. Falla rápido para que la cadena pase al siguiente proveedor
      // (Ling) sin quemar el presupuesto del webhook de 25s.
      if (attempt >= MAX_RETRIES || isGoogleSharedPool429(lastError)) throw lastError;
      // Si no fue un 429 de pool (p. ej. timeout de red), reintentar con backoff
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error(`OpenRouter error (${model})`);
}

/**
 * Llama a google/gemma-4-31b-it:free via OpenRouter.
 */
async function callGemma4(
  messages: OpenRouterMessage[],
  timeoutMs = 20000
): Promise<OpenRouterResponse> {
  return callOpenRouter('google/gemma-4-31b-it:free', messages, 0.3, 8192, timeoutMs);
}

/**
 * Llama a google/gemma-4-26b-a4b-it:free via OpenRouter.
 * Respaldo adicional más ligero/rápido que la 31b; útil cuando la 31b está
 * rate-limited upstream (429), que era un fallo común en producción.
 */
async function callGemma426b(
  messages: OpenRouterMessage[],
  timeoutMs = 20000
): Promise<OpenRouterResponse> {
  return callOpenRouter('google/gemma-4-26b-a4b-it:free', messages, 0.3, 8192, timeoutMs);
}

/**
 * Llama a inclusionai/ling-3.0-tiny:free via OpenRouter.
 * Proveedor DISTINTO a Google (Inclusion AI): no comparte el pool rate-limit
 * de Google AI Studio, así que sigue funcionando cuando gemma-4-31b/26b dan
 * 429 a la vez. El slug anterior (ling-3.0-flash:free) fue retirado en 2026
 * (404); el modelo free actual de Inclusion es ling-3.0-tiny:free.
 */
async function callLing30Flash(
  messages: OpenRouterMessage[],
  timeoutMs = 20000
): Promise<OpenRouterResponse> {
  return callOpenRouter('inclusionai/ling-3.0-tiny:free', messages, 0.3, 8192, timeoutMs);
}

/**
 * Llama a nvidia/nemotron-3-ultra-550b-a55b:free via OpenRouter.
 * Respaldo free de NVIDIA (mejor calidad general del tier free, 1M de
 * contexto) e inmune al pool rate-limit de Google AI Studio.
 */
async function callNemotron3UltraFree(
  messages: OpenRouterMessage[],
  timeoutMs = 20000
): Promise<OpenRouterResponse> {
  return callOpenRouter('nvidia/nemotron-3-ultra-550b-a55b:free', messages, 0.3, 8192, timeoutMs);
}

/**
 * True si el error es un 429 del pool compartido de Google AI Studio
 * (google/gemma-4-*). En ese caso gemma-4-26b dará el MISMO 429 — no vale la
 * pena reintentarlo: saltar directo al respaldo de otro proveedor (Ling).
 */
function isGoogleSharedPool429(error: unknown): boolean {
  const msg = String(error instanceof Error ? error.message : error);
  return msg.includes('upstream_provider_shared_pool') || msg.includes('Google AI Studio');
}

/**
 * Intenta la cadena Google (gemma-4-31b → gemma-4-26b) con un atajo:
 * si la 31b da 429 del pool compartido de Google, la 26b dará el mismo error
 * (comparten rate-limit), así que se salta directo y se ahorran ~2.4s de
 * reintentos inútiles por consulta — crítico para el presupuesto del webhook
 * de Telegram (25s), donde cada segundo cuenta.
 */
async function callGoogleGemmaChain(
  messages: OpenRouterMessage[],
  timeoutMs = 20000,
  skipModel?: string
): Promise<OpenRouterResponse | null> {
  if (skipModel !== 'google/gemma-4-31b-it:free') {
    try {
      const response = await callGemma4(messages, timeoutMs);
      return response;
    } catch (error) {
      console.warn('[AI] Gemma 4 falló:', error);
      // Pool compartido de Google → la 26b dará lo mismo: saltarla.
      if (isGoogleSharedPool429(error)) return null;
    }
  }
  if (skipModel !== 'google/gemma-4-26b-a4b-it:free') {
    try {
      const response = await callGemma426b(messages, timeoutMs);
      return response;
    } catch (error) {
      console.warn('[AI] Gemma 4 26b falló:', error);
    }
  }
  return null;
}

/**
 * Llama a DeepSeek V4 Flash directamente (API nativa, OpenAI-compatible).
 * Usa DEEPSEEK_API_KEY del environment.
 */
async function callDeepSeekV4FlashDirect(
  messages: OpenRouterMessage[],
  tools?: OpenRouterTool[],
  timeoutMs = 20000
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

  // Timeout acotado: DeepSeek directo debe responder rápido; si se cuelga,
  // el fallback (OpenRouter/Gemma) toma el relevo sin colgar el webhook.
  // En el camino caliente del chatbot se pasa 10s para entrar al fallback
  // antes del límite de 25s del webhook de Telegram.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Pipeline de llamada para Web Creator (DeepSeek V4 Flash prioritario):
 * 1. DeepSeek V4 Flash directo (API nativa) — PRIMARIO
 * 2. google/gemma-4-31b-it:free via OpenRouter (respaldo 1)
 * 3. google/gemma-4-26b-a4b-it:free via OpenRouter (respaldo 2)
 * 4. Google Gemini 2.5 Flash directo (respaldo final)
 */
export async function callWebCreatorWithFallback(
  messages: OpenRouterMessage[]
): Promise<OpenRouterResponse> {
  // 1. DeepSeek V4 Flash directo
  try {
    console.log('[AI WebCreator] Intentando DeepSeek V4 Flash (API directa)...');
    // Generaciones largas (hasta 8K tokens): timeout amplio para no caer en
    // fallbacks espurios por latencia legítima.
    const response = await callDeepSeekV4FlashDirect(messages, undefined, 45000);
    console.log('[AI WebCreator] ✅ DeepSeek V4 Flash respondió correctamente');
    return response;
  } catch (error) {
    console.warn('[AI WebCreator] DeepSeek V4 Flash falló:', error);
  }

  // 2. Ling 3.0 Flash via OpenRouter — proveedor distinto a Google, inmune al
  //     pool rate-limit de Google AI Studio
  try {
    console.log('[AI WebCreator] Fallback a inclusionai/ling-3.0-tiny:free...');
    const response = await callLing30Flash(messages, 45000);
    console.log('[AI WebCreator] ✅ Ling 3.0 Flash respondió correctamente');
    return response;
  } catch (error) {
    console.warn('[AI WebCreator] Ling 3.0 Flash falló:', error);
  }

  // 3+4. Gemma 4 (31b → 26b) via OpenRouter — con atajo ante 429 del pool
  //       compartido de Google
  {
    const gemmaResponse = await callGoogleGemmaChain(messages, 45000);
    if (gemmaResponse) {
      console.log('[AI WebCreator] ✅ Gemma 4 respondió correctamente');
      return gemmaResponse;
    }
  }

  // 5. Nemotron 3 Ultra free (NVIDIA) via OpenRouter
  try {
    console.log('[AI WebCreator] Fallback a nvidia/nemotron-3-ultra-550b-a55b:free...');
    const response = await callNemotron3UltraFree(messages, 45000);
    console.log('[AI WebCreator] ✅ Nemotron 3 Ultra respondió correctamente');
    return response;
  } catch (error) {
    console.warn('[AI WebCreator] Nemotron 3 Ultra falló:', error);
  }

  // 6. Fallback final: Google Gemini directo (GEMINI_MODEL)
  try {
    console.log(`[AI WebCreator] Fallback final a Google Gemini (${GEMINI_MODEL})...`);
    const response = await callGemini25Flash(messages, 15000);
    console.log('[AI WebCreator] ✅ Gemini respondió correctamente');
    return response;
  } catch (error) {
    console.error('[AI WebCreator] ❌ Todos los modelos fallaron:', error);
    throw error;
  }
}

/**
 * Modelo Gemini usado como fallback final. `gemini-2.5-flash` fue retirado
 * para nuevos usuarios (404) en 2026; la familia estable actual es Gemini 3.
 * `gemini-3.5-flash-lite` es estable, rápido y económico (alto rendimiento a
 * bajo costo). Configurable vía GOOGLE_GEMINI_MODEL sin tocar código.
 */
const GEMINI_MODEL = process.env.GOOGLE_GEMINI_MODEL || 'gemini-3.5-flash-lite';

/**
 * Llama a Google Gemini (fallback cuando OpenRouter falla o como último recurso).
 * Usa GEMINI_MODEL (default gemini-3.5-flash-lite; antes gemini-2.5-flash, retirado).
 */
async function callGemini25Flash(
  messages: OpenRouterMessage[],
  timeoutMs = 90000
): Promise<OpenRouterResponse> {
  const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_AI_KEY}`;

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
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
    throw new Error(`Gemini (${GEMINI_MODEL}) error: ${response.status} - ${error}`);
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
 * 2. google/gemma-4-31b-it:free via OpenRouter (respaldo 1)
 * 3. google/gemma-4-26b-a4b-it:free via OpenRouter (respaldo 2)
 * 4. Google Gemini 2.5 Flash directo (respaldo final)
 */
export async function callAssistantWithFallback(
  messages: OpenRouterMessage[],
  timeoutMs?: number
): Promise<OpenRouterResponse> {
  // Timeout por hop de la cadena de fallback.
  // - Default 20s: preserve el comportamiento para jobs en background
  //   (summarizer, analyzer, etc.) que generan texto largo y antes no tenían timeout.
  // - Camino caliente del chatbot (intent-classifier / fact-extractor) pasa 10s
  //   para que TODA la cadena entre en el presupuesto de 25s del webhook.
  const hopTimeout = timeoutMs ?? 20000

  // 1. DeepSeek V4 Flash directo
  if (DEEPSEEK_API_KEY) {
    try {
      console.log('[AI] Intentando DeepSeek V4 Flash (API directa)...');
      const response = await callDeepSeekV4FlashDirect(messages, undefined, hopTimeout);
      console.log('[AI] ✅ DeepSeek V4 Flash respondió correctamente');
      return response;
    } catch (deepseekError) {
      console.warn('[AI] DeepSeek V4 Flash falló:', deepseekError);
    }
  }

  // 2. Ling 3.0 Flash via OpenRouter — proveedor DISTINTO a Google, inmune al
  //     rate-limit compartido del pool de Google AI Studio. Va ANTES que Gemma
  //     porque cuando el pool de Google está 429 (lo más común), los Gemma
  //     desperdician segundos preciosos del presupuesto de 25s del webhook.
  try {
    console.log('[AI] Fallback a inclusionai/ling-3.0-flash:free...');
    const response = await callLing30Flash(messages, hopTimeout);
    console.log('[AI] ✅ Ling 3.0 Flash respondió correctamente');
    return response;
  } catch (lingError) {
    console.warn('[AI] Ling 3.0 Flash falló:', lingError);
  }

  // 3. Gemma 4 (31b → 26b) via OpenRouter — con atajo ante 429 del pool
  //     compartido de Google (la 26b daría el mismo error y solo quemaría
  //     el presupuesto del webhook con reintentos inútiles)
  {
    const gemmaResponse = await callGoogleGemmaChain(messages, hopTimeout);
    if (gemmaResponse) {
      console.log('[AI] ✅ Gemma 4 respondió correctamente');
      return gemmaResponse;
    }
  }

  // 4. Nemotron 3 Ultra free (NVIDIA) via OpenRouter — otro proveedor no-Google
  //     (inmune al pool 429) y de mayor calidad que Gemma dentro del tier free.
  try {
    console.log('[AI] Fallback a nvidia/nemotron-3-ultra-550b-a55b:free...');
    const response = await callNemotron3UltraFree(messages, hopTimeout);
    console.log('[AI] ✅ Nemotron 3 Ultra respondió correctamente');
    return response;
  } catch (nemotronError) {
    console.warn('[AI] Nemotron 3 Ultra falló:', nemotronError);
  }

  // 5. Fallback final: Google Gemini directo (GEMINI_MODEL, default
  //     gemini-3.5-flash-lite — gemini-2.5-flash fue retirado en 2026)
  try {
    console.log(`[AI] Fallback final a Google Gemini (${GEMINI_MODEL})...`);
    // El último recurso debe caber en el presupuesto del webhook de Telegram
    // (25s): el clasificador pasa 10s por hop, así que Gemini no puede esperar
    // 30s (reventaría el PIPELINE_TIMEOUT). Se acota a máx 15s.
    const response = await callGemini25Flash(messages, Math.min(Math.max(hopTimeout, 10000), 15000));
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
 * Pipeline genérico con modelo configurable y fallback a Gemma 4 (31b/26b) / Gemini.
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
    const response = await callOpenRouter(model, messages, temperature, maxTokens, 45000);
    console.log(`[AI] ✅ ${model} respondió correctamente`);
    return response;
  } catch (openRouterError) {
    console.warn(`[AI] ${model} falló:`, openRouterError);
  }

  // 2. Ling 3.0 Flash via OpenRouter — proveedor distinto a Google
  if (model !== 'inclusionai/ling-3.0-flash:free') {
    try {
      console.log('[AI] Fallback a inclusionai/ling-3.0-flash:free...');
      const response = await callLing30Flash(messages);
      console.log('[AI] ✅ Ling 3.0 Flash respondió correctamente');
      return response;
    } catch (lingError) {
      console.warn('[AI] Ling 3.0 Flash falló:', lingError);
    }
  }

  // 3+4. Gemma 4 (31b → 26b) via OpenRouter — con atajo ante 429 del pool
  //       compartido de Google
  {
    const gemmaResponse = await callGoogleGemmaChain(messages, 20000, model);
    if (gemmaResponse) {
      console.log('[AI] ✅ Gemma 4 respondió correctamente');
      return gemmaResponse;
    }
  }

  // 5. Nemotron 3 Ultra free (NVIDIA) via OpenRouter
  try {
    console.log('[AI] Fallback a nvidia/nemotron-3-ultra-550b-a55b:free...');
    const response = await callNemotron3UltraFree(messages, 20000);
    console.log('[AI] ✅ Nemotron 3 Ultra respondió correctamente');
    return response;
  } catch (nemotronError) {
    console.warn('[AI] Nemotron 3 Ultra falló:', nemotronError);
  }

  // 6. Fallback final: Google Gemini directo (GEMINI_MODEL)
  try {
    console.log(`[AI] Fallback final a Google Gemini (${GEMINI_MODEL})...`);
    const response = await callGemini25Flash(messages, 15000);
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
