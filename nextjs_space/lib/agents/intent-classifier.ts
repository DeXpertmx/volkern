import { callAssistantWithFallback } from '@/lib/assistant/openrouter-client';
import { prisma } from '@/lib/db';

export interface IntentClassification {
  intent: string;
  confidence: number;
  needsMoreInfo: boolean;
  missingParams: string[];
  extractedParams: Record<string, any>;
  rawResponse: string;
}

export interface IntentSchema {
  name: string;
  description: string;
  requiredParams: string[];
  optionalParams: string[];
  examples: string[];
  destructive: boolean;
}

export class IntentClassifierAgent {
  private readonly intentsSchema: IntentSchema[] = [
    {
      name: 'crear_lead',
      description: 'Crear un nuevo lead o contacto en el sistema',
      requiredParams: ['nombre', 'email', 'contexto'],
      optionalParams: ['telefono', 'empresa'],
      examples: [
        'agrega a Juan Pérez con email juan@email.com por tema de ventas',
        'nuevo lead: María García, maria@empresa.com, tel 123456789, contexto: interesado en software',
        'crea un contacto llamado Carlos Ruiz con email carlos@test.com para seguimiento'
      ],
      destructive: false
    },
    {
      name: 'buscar_lead',
      description: 'Buscar un lead existente por email o nombre',
      requiredParams: [],
      optionalParams: ['email', 'nombre'],
      examples: [
        'busca el lead con email juan@email.com',
        'encuentra a María García',
        'dame una lista de mis leads',
        'muéstrame los leads',
        'listar contactos'
      ],
      destructive: false
    },
    {
      name: 'actualizar_lead',
      description: 'Modificar o actualizar un lead o contacto existente',
      requiredParams: [],
      optionalParams: ['email', 'telefono', 'nombre', 'empresa', 'contexto'],
      examples: [
        'actualiza el telefono de juan@email.com a 555-1234',
        'ponle contexto a Alejandra Velázquez: Interesada en automatización',
        'cambia el nombre de maria@empresa.com a Maria Perez',
        'actualiza el contacto de Alejandra Vázquez',
        'agregar contexto a Alejandra Velázquez'
      ],
      destructive: false
    },
    {
      name: 'obtener_telefono',
      description: 'Obtener el número de teléfono de un contacto o lead por su nombre',
      requiredParams: ['nombre'],
      optionalParams: [],
      examples: [
        'dame el teléfono de Juan Pérez',
        'cuál es el número de María García',
        'pásame el cel de Carlos Ruiz'
      ],
      destructive: false
    },
    {
      name: 'registrar_interaccion',
      description: 'Registrar una interacción (llamada, email, whatsapp, reunión, nota) con un contacto o lead',
      requiredParams: ['tipo', 'contenido'],
      optionalParams: ['email', 'nombre', 'resultado'],
      examples: [
        'registra una llamada con Juan Pérez: "Hablamos sobre el presupuesto"',
        'nueva interacción tipo email con maria@test.com: "Enviado catálogo"',
        'anota una reunión con Carlos: "Quedamos en firmar contrato mañana"',
        'registra una interacción con Alejandra Velázquez',
        'quiero anotar algo sobre mi llamada con Juan',
        'tuve una reunión con el cliente y quiero registrarla'
      ],
      destructive: false
    },
    {
      name: 'agendar_cita',
      description: 'Agendar una cita o reunión',
      requiredParams: ['fecha', 'hora'],
      optionalParams: ['email', 'nombre', 'duracion', 'notas', 'tipo'],
      examples: [
        'agenda cita con juan@email.com para mañana a las 10am',
        'programa reunión con María el viernes a las 15:30 por 1 hora',
        'crea una cita con alejandra.vvalvede@gmail.com el 2024-12-20 a las 11:00'
      ],
      destructive: false
    },
    {
      name: 'mis_citas',
      description: 'Consultar citas próximas o existentes',
      requiredParams: [],
      optionalParams: ['fecha', 'email', 'estado'],
      examples: [
        'qué citas tengo hoy',
        'muéstrame mis citas de esta semana',
        'citas pendientes con juan@email.com'
      ],
      destructive: false
    },
    {
      name: 'cancelar_cita',
      description: 'Cancelar una cita existente',
      requiredParams: ['citaId'],
      optionalParams: ['email', 'fecha'],
      examples: [
        'cancela la cita #123',
        'elimina mi reunión con juan@email.com de mañana',
        'anula la cita del viernes con María'
      ],
      destructive: true
    },
    {
      name: 'crear_tarea',
      description: 'Crear una nueva tarea pendiente',
      requiredParams: ['titulo'],
      optionalParams: ['descripcion', 'fechaVencimiento', 'email', 'prioridad'],
      examples: [
        'crea tarea: llamar a Juan Pérez',
        'nueva tarea: revisar cotización para mañana',
        'agrega pendiente: enviar documento a María, vence el viernes'
      ],
      destructive: false
    },
    {
      name: 'registrar_gasto',
      description: 'Registrar un gasto o factura',
      requiredParams: ['monto', 'concepto'],
      optionalParams: ['fecha', 'proveedor', 'email', 'categoria', 'fotoUrl'],
      examples: [
        'registra gasto de 45.90 en comida',
        'nuevo gasto: 120€ de electricidad, proveedor Iberdrola',
        'gasto de 300€ en software, categoría herramientas'
      ],
      destructive: false
    },
    {
      name: 'enviar_mensaje',
      description: 'Enviar un mensaje a un lead',
      requiredParams: ['email', 'mensaje'],
      optionalParams: ['canal'],
      examples: [
        'envía mensaje a juan@email.com: "Hola, ¿cómo estás?"',
        'notifica a María por WhatsApp: tu cita está confirmada',
        'manda email a carlos@test.com con el presupuesto'
      ],
      destructive: false
    },
    {
      name: 'enviar_mensaje_interno',
      description: 'Envía un mensaje al equipo interno',
      requiredParams: ['to', 'message'],
      optionalParams: ['context'],
      examples: [
        'envía mensaje a @soporte: el cliente Juan necesita factura',
        'notifica a @maria que llegó un lead nuevo',
        'dile al #ventas que tenemos una reunión mañana'
      ],
      destructive: false
    },
    {
      name: 'consulta_general',
      description: 'Consulta general, saludo, o conversación no relacionada con CRUD',
      requiredParams: [],
      optionalParams: [],
      examples: [
        'hola, ¿cómo estás?',
        'gracias por tu ayuda',
        'qué puedes hacer?'
      ],
      destructive: false
    }
  ];

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