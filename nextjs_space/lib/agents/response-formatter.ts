export interface FormattedResponse {
  message: string;
  metadata: {
    skill?: string;
    timestamp: string;
    sessionId?: string;
    intent?: string;
    success?: boolean;
    executionTimeMs?: number;
  };
}

export class ResponseFormatter {
  static formatSuccess(
    message: string,
    options?: {
      skill?: string;
      sessionId?: string;
      intent?: string;
      executionTimeMs?: number;
    }
  ): FormattedResponse {
    return {
      message,
      metadata: {
        skill: options?.skill,
        timestamp: new Date().toISOString(),
        sessionId: options?.sessionId,
        intent: options?.intent,
        success: true,
        executionTimeMs: options?.executionTimeMs
      }
    };
  }

  static formatError(
    message: string,
    options?: {
      skill?: string;
      sessionId?: string;
      intent?: string;
    }
  ): FormattedResponse {
    return {
      message,
      metadata: {
        skill: options?.skill,
        timestamp: new Date().toISOString(),
        sessionId: options?.sessionId,
        intent: options?.intent,
        success: false
      }
    };
  }

  static formatFallback(message: string): FormattedResponse {
    return {
      message,
      metadata: {
        timestamp: new Date().toISOString(),
        success: false
      }
    };
  }

  static formatHelp(): FormattedResponse {
    return {
      message: `¡Hola! 👋 Soy el asistente de Volkern.\n\nPuedo ayudarte con:\n\n📋 *Servicios*: Ver nuestro catálogo\n📅 *Citas*: Agendar, consultar o cancelar\n💰 *Precios*: Consultar precios\n👤 *Ayuda humana*: Transferirte a un agente\n\n¿En qué puedo ayudarte?`,
      metadata: {
        timestamp: new Date().toISOString(),
        success: true
      }
    };
  }

  static formatMissingEntity(entity: string, prompt?: string): FormattedResponse {
    const prompts: Record<string, string> = {
      date: '¿Para qué fecha te gustaría? (puedes decir "mañana", "hoy", o "15/05")',
      time: '¿A qué hora te viene bien? (por ejemplo, 10:00, 14:30)',
      service: '¿Qué servicio necesitas?',
      appointment_id: '¿Podrías darme el ID de la cita?',
      customer_name: '¿Cuál es tu nombre?',
      phone: '¿Cuál es tu número de teléfono?',
      email: '¿Cuál es tu correo electrónico?'
    };

    return {
      message: prompt || `¿Podrías proporcionarme ${entity}?`,
      metadata: {
        timestamp: new Date().toISOString(),
        success: true,
        intent: 'clarification'
      }
    };
  }

  static escapeMarkdown(text: string): string {
    return text
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!');
  }

  static toTelegramMarkdown(text: string): string {
    return this.escapeMarkdown(text);
  }
}