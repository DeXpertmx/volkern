/**
 * Gemma Client - Volkern AI Gateway
 * Utiliza la API de Google Generative AI para interactuar con modelos Gemma o Gemini.
 */

export interface GemmaMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface GemmaResponse {
  content: string;
  error?: string;
}

/**
 * Llama a la API de Google para obtener una respuesta del modelo.
 */
export async function callGemma(
  messages: GemmaMessage[],
  options: { temperature?: number; maxTokens?: number; responseMimeType?: string } = {}
): Promise<GemmaResponse> {
  const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;
  const MODEL = process.env.GEMMA_MODEL || 'gemini-flash-latest'; 
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GOOGLE_AI_KEY}`;

  if (!GOOGLE_AI_KEY) {
    console.error('[GemmaClient] Error: GOOGLE_AI_KEY no está configurada en process.env');
    return { content: '', error: 'GOOGLE_AI_KEY no configurada' };
  }

  try {
    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    const history = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

    // Gemma-2-27b-it o Gemini-1.5-flash soportan system_instruction en v1beta, 
    // pero para máxima compatibilidad seguimos inyectando si el historial tiene user.
    if (systemInstruction) {
      if (history.length > 0 && history[0].role === 'user') {
        history[0].parts[0].text = `[System Instructions]\n${systemInstruction}\n\n[User Message]\n${history[0].parts[0].text}`;
      } else {
        history.unshift({
          role: 'user',
          parts: [{ text: systemInstruction }]
        });
      }
    }

    const body: any = {
      contents: history,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 2048,
        response_mime_type: options.responseMimeType ?? 'text/plain',
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.text();
      let errorMessage = `API Error: ${response.status}`;
      try {
        const parsed = JSON.parse(errorData);
        errorMessage = parsed.error?.message || errorMessage;
      } catch (e) {}
      
      console.error('[GemmaClient] Google API Error:', errorMessage);
      return { content: '', error: errorMessage };
    }

    const data = await response.json();
    let content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (options.responseMimeType === 'application/json') {
      // 1. Limpieza básica de bloques de código
      content = content.replace(/```json\n?/, '').replace(/```\n?$/, '').trim();
      
      // 2. Si aún no parece un JSON puro (empieza con { o [), intentamos extraer el bloque JSON
      if (!content.startsWith('{') && !content.startsWith('[')) {
        const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) {
          content = jsonMatch[0];
        }
      }
    }

    return { content };

  } catch (error: any) {
    console.error('[GemmaClient] Fetch Error:', error);
    return { content: '', error: error.message };
  }
}
