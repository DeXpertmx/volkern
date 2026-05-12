import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';
import { sanitizeInput } from './conversation-context';

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

const VALID_INTENTS = [
  'consultar_servicios',
  'agendar_cita',
  'consultar_cita',
  'cancelar_cita',
  'consultar_precio',
  'contactar_humano',
  'consultar_estado_pedido',
  'help',
  'unknown'
];

const REQUIRED_ENTITIES: Record<string, string[]> = {
  'agendar_cita': ['date', 'time', 'service'],
  'cancelar_cita': ['appointment_id'],
  'consultar_cita': ['date'],
  'consultar_precio': ['service']
};

const SYSTEM_PROMPT = `Eres un router de intents para un chatbot de empresa (Volkern).
Tu única tarea es detectar la intención del usuario y extraer entidades.

INTENTOS VÁLIDOS:
- consultar_servicios: El usuario quiere ver los servicios disponibles
- agendar_cita: El usuario quiere agendar una cita/reunión
- consultar_cita: El usuario quiere información sobre una cita existente
- cancelar_cita: El usuario quiere cancelar una cita
- consultar_precio: El usuario pregunta por precios
- contactar_humano: El usuario quiere hablar con una persona real
- consult_estado_pedido: El usuario pregunta por el estado de un pedido
- help: El usuario pide ayuda o información general
- unknown: No puedes determinar la intención

ENTIDADES A DETECTAR:
- date: Fecha de la cita (formato YYYY-MM-DD o relativo como "mañana", "hoy")
- time: Hora de la cita (formato HH:MM)
- service: Servicio o tipo de cita
- appointment_id: ID de la cita (si el usuario lo proporciona)
- customer_name: Nombre del cliente
- phone: Número de teléfono
- email: Correo electrónico

REGLAS:
1. Solo responde en formato JSON
2. confidence es un número entre 0 y 1
3. missingEntities son las entidades requeridas que NO se detectaron
4. suggestedResponse es una respuesta breve para pedir la información faltante
5. Si no puedes determinar el intent, usa "unknown" con confidence 0.3

EJEMPLO DE RESPUESTA:
{"intent": "agendar_cita", "confidence": 0.9, "entities": {"service": "consultoría"}, "missingEntities": ["date", "time"], "suggestedResponse": "¿Para qué fecha y hora te gustaría agendar la consultoría?"}`;

export class GemmaRouterAgent {
  private static readonly TIMEOUT_MS = 15000;
  private static readonly MAX_RETRIES = 1;

  static async detectIntent(
    userMessage: string,
    context: {
      pendingIntent?: string;
      collectedEntities: Record<string, string>;
      missingEntities: string[];
    }
  ): Promise<RouterResponse> {
    const sanitizedMessage = sanitizeInput(userMessage);

    // Si hay un pendingIntent y hay missingEntities, el usuario está completando el flujo
    if (context.pendingIntent && context.missingEntities.length > 0) {
      const completionResult = this.tryCompletePendingIntent(
        sanitizedMessage,
        context
      );
      if (completionResult) {
        return { success: true, data: completionResult };
      }
    }

    const messages: GemmaMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: sanitizedMessage }
    ];

    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await this.callGemmaWithTimeout(messages);

        if (result.error) {
          lastError = result.error;
          continue;
        }

        const parsed = this.parseGemmaOutput(result.content);
        
        if (!parsed) {
          lastError = 'Failed to parse Gemma output';
          continue;
        }

        // Validar estructura
        const validation = this.validateGemmaOutput(parsed);
        if (!validation.valid) {
          lastError = validation.error;
          continue;
        }

        // Añadir entidades ya.collected del contexto
        const mergedEntities = {
          ...context.collectedEntities,
          ...parsed.entities
        };

        // Calcular missing entities
        const requiredEntities = REQUIRED_ENTITIES[parsed.intent] || [];
        const missingEntities = requiredEntities.filter(
          e => !mergedEntities[e]
        );

        return {
          success: true,
          data: {
            intent: parsed.intent,
            confidence: parsed.confidence,
            entities: mergedEntities,
            missingEntities,
            suggestedResponse: parsed.suggestedResponse
          }
        };

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    // Fallback en caso de fallo total
    return {
      success: false,
      error: lastError,
      fallbackMessage: 'No entendí bien tu mensaje. ¿Puedes reformularlo?'
    };
  }

  private static async callGemmaWithTimeout(
    messages: GemmaMessage[]
  ): Promise<{ content: string; error?: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const result = await callGemma(messages, {
        temperature: 0.3,
        maxTokens: 500,
        responseMimeType: 'application/json'
      });

      clearTimeout(timeoutId);
      return { content: result.content, error: result.error };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private static parseGemmaOutput(output: string): any | null {
    try {
      // Limpiar markdown si existe
      const cleaned = output
        .replace(/```json\n?/g, '')
        .replace(/```\n?$/g, '')
        .trim();

      const parsed = JSON.parse(cleaned);

      return {
        intent: parsed.intent || 'unknown',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        entities: typeof parsed.entities === 'object' ? parsed.entities : {},
        suggestedResponse: parsed.suggestedResponse || undefined
      };
    } catch {
      // Intentar extraer JSON del texto
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private static validateGemmaOutput(output: any): { valid: boolean; error?: string } {
    if (!output.intent || typeof output.intent !== 'string') {
      return { valid: false, error: 'Invalid or missing intent' };
    }

    if (!VALID_INTENTS.includes(output.intent)) {
      return { valid: false, error: `Invalid intent: ${output.intent}` };
    }

    if (typeof output.confidence !== 'number' || output.confidence < 0 || output.confidence > 1) {
      return { valid: false, error: 'Invalid confidence value' };
    }

    if (typeof output.entities !== 'object' || output.entities === null) {
      return { valid: false, error: 'Invalid entities (must be object)' };
    }

    return { valid: true };
  }

  private static tryCompletePendingIntent(
    userMessage: string,
    context: {
      pendingIntent?: string;
      collectedEntities: Record<string, string>;
      missingEntities: string[];
    }
  ): DetectedIntent | null {
    if (!context.pendingIntent) return null;

    const nextMissing = context.missingEntities[0];
    if (!nextMissing) return null;

    const newEntities = { ...context.collectedEntities };

    // Detectar entidad basada en el missing entity
    switch (nextMissing) {
      case 'date':
        const dateMatch = userMessage.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) {
          newEntities.date = dateMatch[0];
        } else if (userMessage.includes('hoy')) {
          newEntities.date = new Date().toISOString().split('T')[0];
        } else if (userMessage.includes('mañana')) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          newEntities.date = tomorrow.toISOString().split('T')[0];
        }
        break;

      case 'time':
        const timeMatch = userMessage.match(/\d{1,2}:\d{2}/);
        if (timeMatch) {
          newEntities.time = timeMatch[0];
        }
        break;

      case 'service':
        newEntities.service = userMessage.trim();
        break;
    }

    // Verificar si se detectó la entidad
    if (!newEntities[nextMissing]) {
      return null;
    }

    // Recalcular missing entities
    const requiredEntities = REQUIRED_ENTITIES[context.pendingIntent] || [];
    const newMissingEntities = requiredEntities.filter(e => !newEntities[e]);

    return {
      intent: context.pendingIntent,
      confidence: 0.9,
      entities: newEntities,
      missingEntities: newMissingEntities,
      suggestedResponse: newMissingEntities.length > 0
        ? this.getPromptForEntity(newMissingEntities[0])
        : undefined
    };
  }

  private static getPromptForEntity(entity: string): string {
    const prompts: Record<string, string> = {
      date: '¿Para qué fecha te gustaría? (YYYY-MM-DD)',
      time: '¿A qué hora? (HH:MM)',
      service: '¿Qué servicio necesitas?',
      appointment_id: '¿Cuál es el ID de la cita?',
      customer_name: '¿Cuál es tu nombre?',
      phone: '¿Cuál es tu número de teléfono?',
      email: '¿Cuál es tu correo electrónico?'
    };
    return prompts[entity] || `¿Puedes proporcionar ${entity}?`;
  }

  static isActionableIntent(intent: string): boolean {
    return !['unknown', 'help'].includes(intent);
  }
}