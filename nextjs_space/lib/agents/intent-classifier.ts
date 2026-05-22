import { callAssistantWithFallback } from '@/lib/assistant/openrouter-client';
import { prisma } from '@/lib/db';
import { ALL_INTENTS } from './intents/operations-intents';

export type { IntentSchema } from './intents/types';

export interface IntentClassification {
  intent: string;
  confidence: number;
  needsMoreInfo: boolean;
  missingParams: string[];
  extractedParams: Record<string, any>;
  rawResponse: string;
}

export class IntentClassifierAgent {
  private readonly intentsSchema: IntentSchema[] = ALL_INTENTS;

  private readonly MIN_CONFIDENCE = 0.5;

  async classify(params: {
    message: string;
    context?: string;
    userId: string;
    tenantId: string;
  }): Promise<IntentClassification> {
     const startTime = Date.now();
    
    const systemPrompt = this.buildSystemPrompt(params.context);
    const userPrompt = this.buildUserPrompt(params.message);
    console.log(`[IntentClassifier] Using classification-only prompt for: "${params.message}"`);
    
    try {
      console.log(`[IntentClassifier] Classifying: "${params.message}"`);
      const response = await callAssistantWithFallback([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      
      const content = response.choices[0].message.content;
      console.log(`[IntentClassifier] AI Response: "${content}"`);
      const rawResponse = content || '';
      const parsed = this.parseResponse(rawResponse);
      
      const intentExists = this.intentsSchema.some(i => i.name === parsed.intent);
      if (!intentExists && parsed.intent !== 'unknown') {
        console.warn(`Intent desconocido: ${parsed.intent}, usando consulta_general`);
        parsed.intent = 'consulta_general';
        parsed.confidence = Math.min(parsed.confidence, 0.3);
      }

      if (Object.keys(parsed.extractedParams || {}).length === 0 && parsed.intent !== 'consulta_general') {
        parsed.extractedParams = this.fallbackExtract(params.message, parsed.intent);
      }

      await this.logClassification({
        ...params,
        intent: parsed.intent,
        confidence: parsed.confidence,
        duration: Date.now() - startTime,
        rawResponse
      });

      const missingParams = this.getMissingParams(parsed.intent, parsed.extractedParams);
      const needsMoreInfo = missingParams.length > 0;
      
      if (needsMoreInfo) {
        parsed.missingParams = missingParams;
      }
      
      return {
        intent: parsed.intent,
        confidence: parsed.confidence,
        needsMoreInfo,
        missingParams,
        extractedParams: parsed.extractedParams || {},
        rawResponse
      };
      
    } catch (error) {
      console.error('Error en IntentClassifierAgent:', error);
      
      return {
        intent: 'consulta_general',
        confidence: 0.1,
        needsMoreInfo: false,
        missingParams: [],
        extractedParams: {},
        rawResponse: 'Error en clasificación'
      };
    }
  }

  private getMissingParams(intent: string, extractedParams: Record<string, any>): string[] {
    const schema = this.intentsSchema.find(i => i.name === intent);
    if (!schema) return [];
    
    return schema.requiredParams.filter(param => !extractedParams[param]);
  }

  private buildSystemPrompt(context?: string): string {
    const intentsList = this.intentsSchema.map(i => 
      `- ${i.name}: ${i.description}. Parámetros requeridos: ${i.requiredParams.join(', ') || 'ninguno'}`
    ).join('\n');
    
    return `Eres un clasificador de intenciones para Volkern CRM.

INTENCIONES DISPONIBLES:
${intentsList}

REGLAS ESTRICTAS:
1. Devuelve SOLO JSON, nada más.
2. confidence debe ser un número entre 0 y 1.
3. Si faltan parámetros requeridos, needsMoreInfo = true y lista missingParams.
4. Si todos los parámetros requeridos están presentes, needsMoreInfo = false.
5. Para mensajes ambiguos, confidence < 0.7 y usa consulta_general.
6. Extrae los parámetros del mensaje en extractedParams.
7. Para fechas relativas ("mañana", "viernes"), conviértelas a YYYY-MM-DD.

FORMATO DE RESPUESTA:
{
  "intent": "nombre_intent",
  "confidence": 0.95,
  "needsMoreInfo": false,
  "missingParams": [],
  "extractedParams": {
    "nombre": "Juan Pérez",
    "email": "juan@email.com"
  }
}

${context ? `CONTEXTO DE CONVERSACIÓN PREVIA:\n${context}\n` : ''}
`;
  }

  private buildUserPrompt(message: string): string {
    return `Mensaje del usuario: "${message}"\n\nClasifica la intención y extrae los parámetros.`;
  }

  private parseResponse(rawResponse: string): any {
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(rawResponse);
    } catch (error) {
      console.error('Error parsing response:', rawResponse);
      return {
        intent: 'consulta_general',
        confidence: 0.1,
        needsMoreInfo: false,
        missingParams: [],
        extractedParams: {}
      };
    }
  }

  private fallbackExtract(message: string, intent: string): Record<string, any> {
    const extracted: Record<string, any> = {};
    
    const emailMatch = message.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    if (emailMatch) {
      extracted.email = emailMatch[1];
    }
    
    const nameMatch = message.match(/(?:agrega|crea|nuevo|contacto)\s+(?:a\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch) {
      extracted.nombre = nameMatch[1];
    }
    
    const amountMatch = message.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros|euro|pesos|dolares|USD|EUR)/i);
    if (amountMatch && intent === 'registrar_gasto') {
      extracted.monto = parseFloat(amountMatch[1].replace(',', '.'));
    }
    
    return extracted;
  }

  private async logClassification(data: {
    message: string;
    userId: string;
    tenantId: string;
    intent: string;
    confidence: number;
    duration: number;
    rawResponse: string;
  }): Promise<void> {
    try {
      await prisma.chatbotAuditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          intent: data.intent,
          status: 'PENDING',
          inputRaw: data.message.substring(0, 500),
          executionTimeMs: data.duration,
          gemmaOutput: data.rawResponse.substring(0, 1000),
          detectedEntities: { confidence: data.confidence },
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.error('Error logging classification:', error);
    }
  }

  getIntentSchema(intentName: string): IntentSchema | undefined {
    return this.intentsSchema.find(i => i.name === intentName);
  }

  isDestructive(intentName: string): boolean {
    const schema = this.getIntentSchema(intentName);
    return schema?.destructive || false;
  }

  getRequiredParams(intentName: string): string[] {
    const schema = this.getIntentSchema(intentName);
    return schema?.requiredParams || [];
  }
}

export const intentClassifier = new IntentClassifierAgent();