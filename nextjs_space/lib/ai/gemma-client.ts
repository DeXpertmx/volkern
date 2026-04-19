/**
 * Gemma Client - Volkern AI Gateway
 * Utiliza la API de Google Generative AI para interactuar con modelos Gemma 2.
 */

const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;
const MODEL = process.env.GEMMA_MODEL || 'gemma-3-27b-it'; // Gemma 4 Intelligence Engine
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GOOGLE_AI_KEY}`;

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
  if (!GOOGLE_AI_KEY) {
    return { content: '', error: 'GOOGLE_AI_KEY no configurada' };
  }

  try {
    // El formato de Google AI Studio es diferente a OpenAI
    // Los mensajes de sistema se pasan en system_instruction si el modelo lo permite,
    // o se inyectan en el historial.
    
    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    const history = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

    // El formato de Google AI Studio es diferente a OpenAI
    // Los mensajes de sistema se pasan en system_instruction si el modelo lo permite,
    // o se inyectan en el historial. Gemma-3-27b-it no soporta developer instructions, 
    // así que lo inyectamos en el primer mensaje.
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
      }
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[GemmaClient] API Error:', errorData);
      return { content: '', error: `API Error: ${response.status}` };
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return { content };

  } catch (error: any) {
    console.error('[GemmaClient] Fetch Error:', error);
    return { content: '', error: error.message };
  }
}
