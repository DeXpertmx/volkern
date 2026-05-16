import { callMinimaxM25, callAssistantWithFallback } from '@/lib/assistant/openrouter-client';
import { prisma } from '@/lib/db';

export interface ExtractedEntities {
  nombre?: string;
  email?: string;
  telefono?: string;
  empresa?: string;
  fecha?: string;
  hora?: string;
  duracion?: number;
  citaId?: string;
  tipo?: string;
  titulo?: string;
  descripcion?: string;
  prioridad?: 'alta' | 'media' | 'baja';
  fechaVencimiento?: string;
  monto?: number;
  concepto?: string;
  proveedor?: string;
  categoria?: string;
  fotoUrl?: string;
  leadId?: string;
  estado?: string;
  rawMessage: string;
  confidence: number;
  missingRequired: string[];
}

export interface EntityExtractionResult {
  success: boolean;
  entities: ExtractedEntities;
  missingParams: string[];
  suggestedQuestion?: string;
}

export class EntityExtractorAgent {
  private readonly regexPatterns = {
    email: /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i,
    telefono: /(\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/g,
    monto: /(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?|eur|USD|usd|dólares?|pesos)/i,
    hora: /(\d{1,2}):?(\d{2})?\s*(?:am|pm|h|horas?)?/i,
    duracion: /(\d+)\s*(?:min|minutos?|horas?|h)/i,
    prioridad: /(alta|media|baja|urgente|normal|poca)/i,
    nombreCompleto: /(?:agrega|crea|nuevo|contacto|lead|cliente)\s+(?:a\s+)?([A-ZÁÉÍÓÚÜ][a-záéíóúü]+(?:\s+[A-ZÁÉÍÓÚÜ][a-záéíóúü]+){1,3})/i,
    tipoInteraccion: /(whatsapp|llamada|email|correo|reunión|reunion|nota interna)/i
  };

  private readonly entityDescriptions: Record<string, { required: string[]; optional: string[]; questions: Record<string, string> }> = {
    crear_lead: { required: ['nombre', 'email', 'contexto'], optional: ['telefono', 'empresa'], questions: { nombre: '¿Cuál es el nombre del contacto?', email: '¿Cuál es el email?', contexto: '¿Cuál es el contexto o razón para registrar a este contacto?', telefono: '¿Teléfono de contacto?', empresa: '¿De qué empresa?' } },
    actualizar_lead: { required: [], optional: ['email', 'nombre', 'telefono', 'empresa', 'contexto'], questions: { email: '¿Cuál es el email del contacto que deseas modificar?', nombre: '¿A qué contacto te refieres?' } },
    agendar_cita: { required: ['fecha', 'hora'], optional: ['email', 'nombre', 'duracion', 'tipo', 'notas'], questions: { fecha: '¿Para qué día?', hora: '¿A qué hora?', email: '¿Cuál es el email del contacto?', duracion: '¿Duración?' } },
    crear_tarea: { required: ['titulo'], optional: ['descripcion', 'fechaVencimiento', 'prioridad', 'email'], questions: { titulo: '¿Cuál es el título?', descripcion: '¿Descripción?', fechaVencimiento: '¿Cuándo vence?', prioridad: '¿Prioridad?' } },
    registrar_gasto: { required: ['monto', 'concepto'], optional: ['fecha', 'proveedor', 'categoria'], questions: { monto: '¿Monto?', concepto: '¿Concepto?', proveedor: '¿Proveedor?' } },
    obtener_telefono: { required: ['nombre'], optional: [], questions: { nombre: '¿De quién quieres saber el teléfono? Dime su nombre completo.' } },
    registrar_interaccion: { required: ['tipo', 'contenido'], optional: ['nombre', 'email', 'resultado'], questions: { tipo: '¿Por qué medio fue la interacción? (Ej: Llamada, WhatsApp, Email, Reunión)', contenido: '¿Me podrías dar un breve resumen de lo que se habló o se acordó?' } }
  };

  async extract(params: { message: string; intent: string; context?: string; previousEntities?: Partial<ExtractedEntities> }): Promise<EntityExtractionResult> {
    const startTime = Date.now();
    const { message, intent, context, previousEntities = {} } = params;

    const regexEntities = this.extractWithRegex(message);
    const aiEntities = await this.extractWithAI(message, intent, context);

    const combinedEntities: ExtractedEntities = {
      ...previousEntities,
      ...regexEntities,
      ...aiEntities,
      rawMessage: message,
      confidence: aiEntities.confidence || regexEntities.confidence || 0.5,
      missingRequired: []
    };

    const entitySchema = this.entityDescriptions[intent];
    const missingParams: string[] = [];

    if (entitySchema) {
      for (const required of entitySchema.required) {
        const value = combinedEntities[required as keyof ExtractedEntities];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          missingParams.push(required);
        }
      }
    }

    let suggestedQuestion: string | undefined;
    if (missingParams.length > 0) {
      suggestedQuestion = entitySchema?.questions[missingParams[0]] || `¿Podrías proporcionarme ${missingParams[0]}?`;
    }

    await this.logExtraction({ message, intent, entities: combinedEntities, missingParams, duration: Date.now() - startTime });

    return { success: missingParams.length === 0, entities: combinedEntities, missingParams, suggestedQuestion };
  }

  private extractWithRegex(message: string): Partial<ExtractedEntities> {
    const entities: Partial<ExtractedEntities> = {};

    const emailMatch = message.match(this.regexPatterns.email);
    if (emailMatch) entities.email = emailMatch[1];

    const phoneMatch = message.match(this.regexPatterns.telefono);
    if (phoneMatch) entities.telefono = phoneMatch[0];

    const amountMatch = message.match(this.regexPatterns.monto);
    if (amountMatch) entities.monto = parseFloat(amountMatch[1].replace(',', '.'));

    const fechaMatch = this.extractFecha(message);
    if (fechaMatch) entities.fecha = fechaMatch;

    const horaMatch = this.extractHora(message);
    if (horaMatch) entities.hora = horaMatch;

    const duracionMatch = message.match(this.regexPatterns.duracion);
    if (duracionMatch) {
      let duracion = parseInt(duracionMatch[1]);
      if (message.includes('hora') || message.includes('h')) duracion *= 60;
      entities.duracion = duracion;
    }

    const prioridadMatch = message.match(this.regexPatterns.prioridad);
    if (prioridadMatch) {
      const prioridad = prioridadMatch[1].toLowerCase();
      if (['alta', 'media', 'baja'].includes(prioridad)) entities.prioridad = prioridad as any;
    }

    const nombreMatch = message.match(this.regexPatterns.nombreCompleto);
    if (nombreMatch && !entities.nombre) entities.nombre = nombreMatch[1];

    const tipoMatch = message.match(this.regexPatterns.tipoInteraccion);
    if (tipoMatch) {
      let tipo = tipoMatch[1].toLowerCase();
      if (tipo === 'correo') tipo = 'email';
      if (tipo === 'reunión') tipo = 'reunion';
      entities.tipo = tipo;
    }

    if (message.match(/gasto|pago|compra|factura/i)) {
      const conceptoMatch = message.match(/(?:en|por|de|concepto de?)\s+([a-zA-Záéíóúüñ\s]{5,50})/i);
      if (conceptoMatch) entities.concepto = conceptoMatch[1].trim();
    }

    return entities;
  }

  private async extractWithAI(message: string, intent: string, context?: string): Promise<Partial<ExtractedEntities>> {
    const schema = this.entityDescriptions[intent];
    const fields = schema ? [...schema.required, ...schema.optional].join(', ') : 'nombre, email, telefono, empresa, fecha, hora, titulo, descripcion, monto, concepto';
    
    const systemPrompt = `Eres un extractor de entidades para Volkern CRM. INTENCIÓN: ${intent}. Extrae los siguientes campos si están presentes: ${fields}. IMPORTANTE: Para interacciones, el campo "contenido" es el resumen del mensaje. Retorna EXCLUSIVAMENTE un JSON válido. Mensaje: "${message}" ${context ? `Contexto: ${context}` : ''}`;

    try {
      const response = await callAssistantWithFallback([{ role: 'system', content: systemPrompt }]);
      const content = response.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const entities = JSON.parse(jsonMatch[0]);
        return { ...entities, confidence: 0.85 };
      }
      return { confidence: 0.5 };
    } catch (error) {
      console.error('Error en EntityExtractorAgent (AI):', error);
      return { confidence: 0.3 };
    }
  }

  private extractFecha(message: string): string | undefined {
    const lowerMsg = message.toLowerCase();
    const today = new Date();

    if (lowerMsg.includes('hoy')) return this.formatDate(today);
    if (lowerMsg.includes('mañana')) { const t = new Date(today); t.setDate(today.getDate() + 1); return this.formatDate(t); }
    if (lowerMsg.includes('pasado mañana')) { const t = new Date(today); t.setDate(today.getDate() + 2); return this.formatDate(t); }

    const weekDays: Record<string, number> = { 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3, 'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0 };
    for (const [day, targetDay] of Object.entries(weekDays)) {
      if (lowerMsg.includes(day)) {
        let daysToAdd = targetDay - today.getDay();
        if (daysToAdd <= 0) daysToAdd += 7;
        const d = new Date(today); d.setDate(today.getDate() + daysToAdd);
        return this.formatDate(d);
      }
    }

    const dateMatch = message.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dateMatch) {
      let day = parseInt(dateMatch[1]), month = parseInt(dateMatch[2]), year = parseInt(dateMatch[3]);
      if (year < 100) year += 2000;
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    const isoMatch = message.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;

    return undefined;
  }

  private extractHora(message: string): string | undefined {
    const hourMatch = message.match(/(\d{1,2}):(\d{2})/);
    if (hourMatch) return `${hourMatch[1].padStart(2, '0')}:${hourMatch[2]}`;

    const ampmMatch = message.match(/(\d{1,2})\s*(?:am|pm|a\.m\.|p\.m\.)/i);
    if (ampmMatch) {
      let hour = parseInt(ampmMatch[1]);
      if (/pm|p\.m\./i.test(ampmMatch[0]) && hour !== 12) hour += 12;
      return `${hour.toString().padStart(2, '0')}:00`;
    }

    const naturalMatch = message.match(/a las\s+(\d{1,2})(?:\s*(?:de la mañana|de la tarde))?/i);
    if (naturalMatch) {
      let hour = parseInt(naturalMatch[1]);
      if (message.includes('tarde') && hour < 12) hour += 12;
      return `${hour.toString().padStart(2, '0')}:00`;
    }

    return undefined;
  }

  private formatDate(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  }

  private async logExtraction(data: { message: string; intent: string; entities: Partial<ExtractedEntities>; missingParams: string[]; duration: number }): Promise<void> {
    try {
      await prisma.chatbotAuditLog.create({
        data: {
          event: 'entity_extraction',
          metadata: { message: data.message.substring(0, 200), intent: data.intent, entities: data.entities, missingParams: data.missingParams, durationMs: data.duration },
          severity: data.missingParams.length > 0 ? 'warning' : 'info'
        }
      });
    } catch (error) {
      console.error('Error logging entity extraction:', error);
    }
  }

  getRequiredParams(intent: string): string[] {
    return this.entityDescriptions[intent]?.required || [];
  }

  getMissingParamsMessage(intent: string, missingParams: string[]): string {
    const schema = this.entityDescriptions[intent];
    if (!schema || missingParams.length === 0) return '';
    return schema.questions[missingParams[0]] || `¿Podrías proporcionarme ${missingParams[0]}?`;
  }
}

export const entityExtractor = new EntityExtractorAgent();