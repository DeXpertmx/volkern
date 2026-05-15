/**
 * @deprecated Este router está siendo reemplazado por IntentClassifierAgent (Minimax)
 * 
 * Se mantiene como fallback para:
 * - Conversación general no crítica
 * - Casos donde Minimax no está disponible
 * - Backward compatibility con flujos existentes
 * 
 * Para nuevos comandos, usar MinimaxOrchestratorAgent
 * 
 * @see lib/agents/intent-classifier.ts
 * @see lib/agents/orchestrator.ts
 */

import { callGemma } from '@/lib/ai/gemma-client';

export interface DetectedIntent {
  intent: string;
  confidence: number;
  entities: Record<string, string>;
  missingEntities: string[];
  suggestedResponse?: string;
}

export interface RouterResponse {
  success: boolean;
  data?: DetectedIntent;
  error?: string;
  fallbackMessage?: string;
}

// Intentos válidos del sistema
const ALLOWED_INTENTS = new Set([
  'consultar_servicios',
  'agendar_cita',
  'consultar_cita',
  'cancelar_cita',
  'consultar_precio',
  'contactar_humano',
  'consultar_estado_pedido',
  'help',
  'unknown'
]);

// Entidades requeridas por intent
const REQUIRED_ENTITIES: Record<string, string[]> = {
  'agendar_cita': ['date', 'time', 'service'],
  'cancelar_cita': ['appointment_id'],
  'consultar_cita': ['date'],
  'consultar_precio': ['service']
};

// Confidence threshold mínimo
const MIN_CONFIDENCE = 0.4;

export class GemmaRouterAgent {
  private static readonly TIMEOUT_MS = 15000;
  private static readonly MAX_RETRIES = 1;

  /**
   * Procesa mensaje y retorna intent + entidades
   */
  static async detectIntent(
    userMessage: string,
    context: {
      pendingIntent?: string;
      collectedEntities: Record<string, string>;
      missingEntities: string[];
    }
  ): Promise<RouterResponse> {
    const message = this.sanitizeMessage(userMessage);

    // 🧠 1. Context-aware routing (multi-turno)
    if (context.pendingIntent && context.missingEntities.length > 0) {
      const completionResult = this.tryCompletePendingIntent(message, context);
      if (completionResult) {
        console.log(`[GemmaRouter] Continuing pending intent: ${context.pendingIntent}`);
        return { success: true, data: completionResult };
      }
    }

    // 🧠 2. Construir prompt optimizado
    const prompt = this.buildPrompt({
      message,
      context
    });

    // 🤖 3. Llamar a Gemma
    let rawOutput: string | undefined;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await this.callGemmaWithTimeout(prompt);
        if (!result.error) {
          rawOutput = result.content;
          break;
        }
        lastError = result.error;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    if (!rawOutput) {
      return {
        success: false,
        error: lastError,
        fallbackMessage: this.getFallbackMessage(message)
      };
    }

    // 🔒 4. Parseo seguro
    const parsed = this.safeParse(rawOutput);

    // 🧠 5. Anti-alucinación: validar intent
    if (!ALLOWED_INTENTS.has(parsed.intent)) {
      parsed.intent = 'unknown';
      parsed.confidence = Math.min(parsed.confidence, 0.3);
    }

    // 🧠 6. Confidence threshold
    if (parsed.confidence < MIN_CONFIDENCE) {
      parsed.intent = 'unknown';
    }

    // 🧠 7. Merge entidades con contexto
    const mergedEntities = {
      ...context.collectedEntities,
      ...parsed.entities
    };

    // 🧠 8. Calcular missing entities
    const requiredEntities = Array.isArray(REQUIRED_ENTITIES[parsed.intent]) 
      ? REQUIRED_ENTITIES[parsed.intent] as string[]
      : [];
    
    const missingEntities = requiredEntities.filter(e => !mergedEntities[e]);

    return {
      success: true,
      data: {
        intent: parsed.intent,
        confidence: parsed.confidence,
        entities: mergedEntities,
        missingEntities,
        suggestedResponse: missingEntities.length > 0 
          ? this.getPromptForMissingEntity(missingEntities[0])
          : undefined
      }
    };
  }

  /**
   * Construye el prompt para Gemma
   */
  private static buildPrompt(params: { message: string; context: any }): string {
    const { message, context } = params;

    // Incluir contexto relevante pero no saturar
    const contextInfo = {
      lastIntent: context.pendingIntent || context.lastIntent,
      collected: context.collectedEntities,
      missing: context.missingEntities
    };

    return `
Eres un router de IA para un sistema de automatización empresarial.

Tu trabajo es:
1. Identificar la intención del usuario
2. Extraer entidades estructuradas
3. NO responder en lenguaje natural
4. SOLO devolver JSON válido

---

INTENTOS VÁLIDOS:
- consultar_servicios: El usuario quiere ver servicios o catálogo
- agendar_cita: El usuario quiere agendar una cita/reunión
- consultar_cita: El usuario quiere info sobre una cita existente
- cancelar_cita: El usuario quiere cancelar una cita
- consultar_precio: El usuario pregunta por precios
- contactar_humano: El usuario quiere hablar con una persona
- consultar_estado_pedido: El usuario pregunta por estado de pedido
- help: El usuario pide ayuda
- unknown: No puedes determinar la intención

---

ENTIDADES A DETECTAR:
- date: Fecha (YYYY-MM-DD o relativo: "mañana", "hoy", "lunes")
- time: Hora (HH:MM)
- service: Servicio o tipo de cita
- customer_name: Nombre
- phone: Teléfono
- email: Correo

---

CONTEXTO:
${JSON.stringify(contextInfo, null, 2)}

---

MENSAJE DEL USUARIO:
"${message}"

---

FORMATO DE RESPUESTA (SOLO JSON):
{"intent": "...", "entities": {...}, "confidence": 0.0}
`;
  }

  /**
   * Llama a Gemma con timeout
   */
  private static async callGemmaWithTimeout(prompt: string): Promise<{ content: string; error?: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const result = await callGemma(
        [{ role: 'user', content: prompt }],
        {
          temperature: 0.2, // 🔥 Baja temperatura = más estable
          maxTokens: 500,
          responseMimeType: 'application/json'
        }
      );

      clearTimeout(timeoutId);
      return { content: result.content, error: result.error };
    } catch (error) {
      clearTimeout(timeoutId);
      return { content: '', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Parseo seguro - limpia y valida JSON
   */
  private static safeParse(raw: string): { intent: string; confidence: number; entities: Record<string, any> } {
    try {
      // Limpiar texto basura
      const cleaned = raw
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .replace(/^\s*```\s*/gm, '')
        .trim();

      // Encontrar inicio y fin del JSON
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON found');
      }

      const jsonString = cleaned.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonString);

      // Validar estructura mínima
      return {
        intent: parsed.intent || 'unknown',
        confidence: typeof parsed.confidence === 'number' 
          ? Math.max(0, Math.min(1, parsed.confidence)) 
          : 0.5,
        entities: typeof parsed.entities === 'object' && parsed.entities !== null 
          ? parsed.entities 
          : {}
      };
    } catch (error) {
      console.error('[GemmaRouter] Parse error:', raw.substring(0, 200));
      return {
        intent: 'unknown',
        confidence: 0,
        entities: {}
      };
    }
  }

  /**
   * Fallback inteligente basado en palabras clave
   */
  private static getFallbackMessage(message: string): string {
    const lower = message.toLowerCase();
    
    if (lower.includes('cita') || lower.includes('reunión') || lower.includes('agendar')) {
      return '¿Qué fecha y hora te gustaría agendar?';
    }
    if (lower.includes('servicio') || lower.includes('producto') || lower.includes('catálogo')) {
      return '¿Qué servicio o producto te interesa?';
    }
    if (lower.includes('precio') || lower.includes('costo') || lower.includes('cuánto')) {
      return '¿Qué servicio o producto quieres consultar?';
    }
    if (lower.includes('cancelar')) {
      return '¿Cuál es el ID de la cita que deseas cancelar?';
    }
    if (lower.includes('ayuda') || lower.includes('hablar')) {
      return '¿En qué puedo ayudarte?';
    }

    return 'No entendí bien. ¿Puedes reformular tu mensaje?';
  }

  /**
   * Intenta completar un intent pendiente desde el contexto
   */
  private static tryCompletePendingIntent(
    message: string,
    context: { pendingIntent?: string; collectedEntities: Record<string, string>; missingEntities: string[] }
  ): DetectedIntent | null {
    if (!context.pendingIntent || context.missingEntities.length === 0) {
      return null;
    }

    const nextMissing = context.missingEntities[0];
    const newEntities = { ...context.collectedEntities };

    // Extraer entidad según tipo
    const extracted = this.extractEntity(message, nextMissing);
    if (!extracted) {
      return null;
    }

    newEntities[nextMissing] = extracted;

    // Recalcular missing
    const required = Array.isArray(REQUIRED_ENTITIES[context.pendingIntent])
      ? REQUIRED_ENTITIES[context.pendingIntent] as string[]
      : [];
    
    const stillMissing = required.filter(e => !newEntities[e]);

    return {
      intent: context.pendingIntent,
      confidence: 0.9, // Alta confianza porque viene del contexto
      entities: newEntities,
      missingEntities: stillMissing,
      suggestedResponse: stillMissing.length > 0
        ? this.getPromptForMissingEntity(stillMissing[0])
        : undefined
    };
  }

  /**
   * Extrae entidad del mensaje según tipo
   */
  private static extractEntity(message: string, entityType: string): string | null {
    const lower = message.toLowerCase();

    switch (entityType) {
      case 'date':
        // Buscar fecha YYYY-MM-DD
        const dateMatch = message.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) return dateMatch[0];
        
        // Fechas relativas
        if (lower.includes('hoy')) return new Date().toISOString().split('T')[0];
        if (lower.includes('mañana')) {
          const d = new Date(); d.setDate(d.getDate() + 1);
          return d.toISOString().split('T')[0];
        }
        if (lower.includes('pasado')) {
          const d = new Date(); d.setDate(d.getDate() + 2);
          return d.toISOString().split('T')[0];
        }
        // Día de la semana
        const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        for (let i = 0; i < days.length; i++) {
          if (lower.includes(days[i])) {
            const d = new Date();
            const diff = (i - d.getDay() + 7) % 7 || 7;
            d.setDate(d.getDate() + diff);
            return d.toISOString().split('T')[0];
          }
        }
        return null;

      case 'time':
        const timeMatch = message.match(/\d{1,2}:\d{2}/);
        return timeMatch ? timeMatch[0] : null;

      case 'service':
        return message.trim();

      case 'phone':
        const phoneMatch = message.match(/\d{10,15}/);
        return phoneMatch ? phoneMatch[0] : null;

      case 'email':
        const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w+/);
        return emailMatch ? emailMatch[0] : null;

      case 'customer_name':
        return message.trim();

      case 'appointment_id':
        return message.trim();

      default:
        return message.trim();
    }
  }

  /**
   * Prompt para entidad faltante
   */
  private static getPromptForMissingEntity(entity: string): string {
    const prompts: Record<string, string> = {
      date: '📅 ¿Para qué fecha? (puedes decir "mañana", "hoy", o "15/05")',
      time: '⏰ ¿A qué hora? (ej: 10:00, 14:30)',
      service: '📋 ¿Qué servicio necesitas?',
      customer_name: '👤 ¿Cuál es tu nombre?',
      phone: '📱 ¿Tu número de teléfono?',
      email: '📧 ¿Tu correo electrónico?',
      appointment_id: '🔖 ¿Cuál es el ID de la cita?'
    };
    return prompts[entity] || `❓ ¿Podrías darme ${entity}?`;
  }

  /**
   * Sanitizar mensaje de entrada
   */
  private static sanitizeMessage(message: string): string {
    return message
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim()
      .substring(0, 4000);
  }

  /**
   * Verificar si el intent es accionable
   */
  static isActionableIntent(intent: string): boolean {
    return intent !== 'unknown' && intent !== 'help';
  }
}

export default GemmaRouterAgent;