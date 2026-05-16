import { prisma } from '@/lib/db';

export interface FormattedResponse {
  text: string;
  emoji: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'confirmation';
  markdown?: string;
  quickReplies?: string[];
  metadata?: Record<string, any>;
}

export interface FormatParams {
  intent: string;
  action: 'execute' | 'ask_clarification' | 'fallback_to_human' | 'reject' | 'confirmation_pending';
  success: boolean;
  data?: any;
  error?: string;
  missingParams?: string[];
  confirmationId?: string;
  entityType?: string;
}

export class ResponseFormatterAgent {
  private readonly intentEmojis: Record<string, string> = {
    'crear_lead': '👤', 'buscar_lead': '🔍', 'agendar_cita': '📅',
    'mis_citas': '📋', 'cancelar_cita': '❌', 'crear_tarea': '✅',
    'registrar_gasto': '💰', 'enviar_mensaje': '💬', 'convertir_lead': '⭐', 'consulta_general': '🤖',
    'registrar_interaccion': '📝', 'obtener_telefono': '📱'
  };

  private readonly templates: Record<string, Record<string, (params: any) => string>> = {
    'crear_lead': {
      execute: (data) => `He creado el contacto ${data?.nombre || 'nuevo'} con email ${data?.email || 'registrado'}. ¿Necesitas algo más?`,
      error: (error) => `No pude crear el contacto: ${error}. ¿Quieres intentarlo de nuevo?`,
      ask_clarification: (params) => `Para crear un contacto, necesito saber ${params.missingParams?.join(' y ') || 'nombre y email'}.`
    },
    'actualizar_lead': {
      execute: (data) => `¡Listo! He actualizado la información de ${data?.nombre || 'contacto'}. ¿Necesitas algo más?`,
      error: (error) => `No pude actualizar el contacto: ${error}. ¿Quieres intentarlo de nuevo?`,
      ask_clarification: (params) => `Para actualizar un contacto, necesito saber su nombre o email.`
    },
    'agendar_cita': {
      execute: (data) => `✅ Cita agendada para ${data?.fechaHora ? new Date(data.fechaHora).toLocaleString() : 'la fecha indicada'}.`,
      error: (error) => `No pude agendar la cita: ${error}.`,
      ask_clarification: (params) => `Para agendar una cita, necesito saber con quién, la fecha y la hora.`
    },
    'mis_citas': {
      execute: (data) => this.formatCitasList(data),
      error: () => 'No pude recuperar tus citas.',
      empty: () => 'No tienes citas programadas.'
    },
    'cancelar_cita': {
      confirmation_pending: () => `⚠️ ¿Seguro que quieres cancelar esta cita? Responde "SÍ" para confirmar.`,
      execute: (data) => `He cancelado la cita correctamente.`,
      error: (error) => `No pude cancelar: ${error}.`
    },
    'crear_tarea': {
      execute: (data) => `✅ Tarea creada: "${data?.titulo || 'sin título'}"${data?.fechaVencimiento ? `, vence ${new Date(data.fechaVencimiento).toLocaleDateString()}` : ''}.`,
      error: (error) => `No pude crear la tarea: ${error}.`,
      ask_clarification: () => `Necesito el título de la tarea para poder agendarla.`
    },
    'registrar_gasto': {
      execute: (data) => `💰 Gasto registrado: ${data?.concepto || 'Sin concepto'} por ${data?.monto || '0'}€.`,
      error: (error) => `No pude registrar el gasto: ${error}.`,
      ask_clarification: () => `Necesito saber el monto y el concepto del gasto.`
    },
    'buscar_lead': {
      execute: (data) => this.formatLeadsList(data),
      error: (error) => `No pude buscar los contactos: ${error}.`,
      ask_clarification: () => `¿A quién buscas? Dame un nombre o email.`
    },
    'registrar_interaccion': {
      execute: (data) => `¡Listo! He registrado la ${data?.tipo || 'interacción'} con ${data?.lead?.nombre || data?.contact?.nombre || 'el contacto'}.`,
      error: (error) => `Vaya, tuve un problema al registrar la interacción: ${error}`,
      ask_clarification: (params) => {
        if (params.missingParams?.includes('tipo')) return 'Claro, ¿qué tipo de interacción fue? (Llamada, Email, WhatsApp, etc.)';
        if (params.missingParams?.includes('contenido')) return 'Entendido, ¿qué fue lo más importante de la interacción? (Un breve resumen)';
        return 'Ayúdame con el tipo y resumen de la interacción para guardarla correctamente.';
      }
    },
    'obtener_telefono': {
      execute: (data) => `Claro, el teléfono de ${data?.nombre} es: ${data?.telefono}`,
      error: (error) => `Lo siento, no pude encontrar ese teléfono: ${error}`,
      ask_clarification: () => '¿De quién quieres que busque el teléfono? Dime su nombre completo.'
    },
    'consulta_general': {
      success: () => '¡Hola! Estoy aquí para ayudarte a gestionar tus contactos, citas, tareas y finanzas. ¿En qué puedo apoyarte hoy? 🌟',
      ask_clarification: () => 'Dime cómo puedo apoyarte. Puedo registrar contactos, agendar citas por ti o incluso anotar tus gastos. Por ejemplo: "Registra una llamada con Juan".',
      fallback_to_human: () => 'Parece que esto es algo complejo para mí por ahora. Te pondré en contacto con un agente humano enseguida. 👨‍💻',
      reject: () => 'No estoy del todo seguro de lo que necesitas. ¿Podrías explicármelo de otra forma? 😊'
    },
    'common': {
      rate_limited: () => '⏳ Demasiadas solicitudes. Espera un momento.',
      internal_error: () => 'Error interno. Por favor, intenta más tarde.',
      not_authorized: () => 'No tienes permisos para esta acción.'
    }
  };

  async format(params: FormatParams): Promise<FormattedResponse> {
    const { intent, action, success, data, error, missingParams, confirmationId } = params;

    if (intent === 'rate_limited') return this.formatRateLimited();

    const intentTemplates = this.templates[intent] || this.templates['consulta_general'];
    let template = intentTemplates[action];

    if (!template) template = this.getGenericTemplate(action, success);

    let text = '';
    try {
      text = typeof template === 'function' ? template({ data, error, missingParams, confirmationId }) : template || this.getDefaultResponse(action, success);
    } catch (err) {
      text = this.getDefaultResponse(action, success);
    }

    const responseType = this.getResponseType(action, success);
    const quickReplies = this.getQuickReplies(intent, action, success);
    const emoji = this.intentEmojis[intent] || this.getEmojiByType(responseType);

    return { text, emoji, type: responseType, quickReplies, metadata: { intent, action, success, ...(confirmationId && { confirmationId }) } };
  }

  private formatCitasList(data: any): string {
    if (!data?.citas || data.citas.length === 0) return 'No tienes citas programadas.';
    const citas = data.citas.slice(0, 5);
    let response = '📋 Tus próximas citas:\n\n';
    citas.forEach((cita: any, i: number) => { response += `${i + 1}. ${cita.fecha || 'Pendiente'} a las ${cita.hora || '?'}\n${cita.nombre ? `   Con: ${cita.nombre}\n` : ''}\n`; });
    if (data.citas.length > 5) response += `Y ${data.citas.length - 5} más...\n`;
    return response;
  }

  private formatLeadsList(data: any): string {
    if (!data?.leads || data.leads.length === 0) return 'No se encontraron contactos.';
    const leads = data.leads.slice(0, 5);
    let response = `🔍 He encontrado ${data.count || data.leads.length} contactos:\n\n`;
    leads.forEach((lead: any, i: number) => {
      response += `${i + 1}. *${lead.name || 'Sin nombre'}*\n`;
      if (lead.email) response += `   📧 ${lead.email}\n`;
      if (lead.phone) response += `   📱 ${lead.phone}\n`;
      if (lead.stage) response += `   📊 Estado: ${lead.stage}\n`;
      response += '\n';
    });
    if (data.leads.length > 5) response += `...y ${data.leads.length - 5} más.`;
    return response;
  }

  private getGenericTemplate(action: string, success: boolean): (params: any) => string {
    if ((action === 'success' || action === 'execute') && success) return () => '✅ ¡Hecho! ¿Necesitas algo más?';
    if (action === 'error') return (p) => `❌ ${p.error || 'Hubo un problema.'}`;
    if (action === 'ask_clarification') return (p) => `Necesito ${p.missingParams?.join(', ') || 'más información'}.`;
    return () => 'Procesando...';
  }

  private getDefaultResponse(action: string, success: boolean): string {
    const defaults: Record<string, string> = { 'success_execute': '✅ Completado.', 'error_execute': '❌ Error.', 'ask_clarification': '¿Más información?', 'fallback_to_human': 'Te atiende un agente.', 'reject': 'No entendí.' };
    return defaults[`${action}_${success ? 'success' : 'error'}`] || 'Procesando...';
  }

  private getResponseType(action: string, success: boolean): FormattedResponse['type'] {
    if (action === 'success') return success ? 'success' : 'error';
    if (action === 'error') return 'error';
    if (action === 'confirmation_pending') return 'warning';
    if (action === 'fallback_to_human' || action === 'ask_clarification') return 'info';
    if (action === 'reject') return 'warning';
    return 'info';
  }

  private getEmojiByType(type: FormattedResponse['type']): string {
    const emojis: Record<string, string> = { 'success': '✅', 'error': '❌', 'info': 'ℹ️', 'warning': '⚠️', 'confirmation': '🤔' };
    return emojis[type] || '🤖';
  }

  private getQuickReplies(intent: string, action: string, success: boolean): string[] | undefined {
    if (action === 'confirmation_pending') return ['SÍ', 'NO'];
    if (action === 'ask_clarification') {
      if (intent === 'mis_citas') return ['📅 Hoy', '📆 Esta semana'];
    }
    if (action === 'success' && success) return ['✅ Ver más', '➕ Nueva acción'];
    return undefined;
  }

  private formatRateLimited(): FormattedResponse {
    return { text: '⏳ Demasiados mensajes. Espera un momento.', emoji: '⏳', type: 'warning' };
  }

  async formatAndLog(params: FormatParams & { userId: string; tenantId: string }): Promise<FormattedResponse> {
    const response = await this.format(params);
    try {
      await prisma.chatbotAuditLog.create({
        data: { event: 'response_formatted', userId: params.userId, tenantId: params.tenantId, intent: params.intent, metadata: { action: params.action, success: params.success, responseType: response.type }, severity: params.success ? 'info' : 'warning' }
      });
    } catch (e) { console.error('Error logging response:', e); }
    return response;
  }
}

export const responseFormatter = new ResponseFormatterAgent();