import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  type?: 'text' | 'card' | 'quick_reply' | 'action' | 'error';
  metadata?: Record<string, unknown>;
}

export interface ChatRequest {
  message: string;
  chatId?: string;
  context?: {
    page?: string;
    moduleId?: string;
    recordId?: string;
  };
}

export interface ChatResponse {
  reply: string;
  chatId: string;
  suggestions?: string[];
  actions?: { label: string; action: string; }[];
  card?: {
    title: string;
    description: string;
    type: 'lead' | 'cita' | 'producto' | 'info';
    data: Record<string, string>;
  };
}

// ─── Chat Service ─────────────────────────────────────────────────────────────
export const chatService = {
  currentChatId: null as string | null,

  /**
   * Envía un mensaje al chatbot Gemma y procesa la respuesta
   */
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    const payload = {
      message: request.message,
      chatId: request.chatId || this.currentChatId,
      context: request.context,
    };

    const response = await api.post<{
      reply: string;
      chatId: string;
      suggestions?: string[];
      actions?: { label: string; action: string; }[];
      card?: ChatResponse['card'];
    }>('/customer/chat', payload);

    // Guardar el chatId para historial
    this.currentChatId = response.chatId;

    return {
      reply: response.reply,
      chatId: response.chatId,
      suggestions: response.suggestions,
      actions: response.actions,
      card: response.card,
    };
  },

  /**
   * Envía un mensaje de voz (simulado, el audio se procesa en el backend)
   */
  async sendVoice(audioUri: string): Promise<ChatResponse> {
    // En producción, enviar el archivo de audio al backend
    // Por ahora, enviamos un marcador de voz
    return this.sendMessage({
      message: '🎤 [Mensaje de voz]',
      context: { page: 'voice' },
    });
  },

  /**
   * Procesa un código QR escaneado
   */
  async processQR(qrData: string): Promise<ChatResponse> {
    return this.sendMessage({
      message: `📷 Escaneé: ${qrData}`,
      context: { page: 'scanner' },
    });
  },

  /**
   * Sube una imagen adjunta
   */
  async uploadAttachment(uri: string, type: string): Promise<ChatResponse> {
    // En producción, subir el archivo a S3/getUrl y enviar la URL
    return this.sendMessage({
      message: `📎 [Archivo adjunto: ${type}]`,
      context: { page: 'attachment' },
    });
  },
};

// ─── Funciones Helper ─────────────────────────────────────────────────────────
/**
 * Convierte una respuesta del backend en un mensaje para la UI
 */
export function responseToMessages(response: ChatResponse): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: response.reply,
      timestamp: new Date().toISOString(),
      type: response.card ? 'card' : 'text',
      metadata: response.card ? { card: response.card } : undefined,
    },
  ];

  if (response.actions && response.actions.length > 0) {
    messages.push({
      id: `actions-${Date.now()}`,
      role: 'assistant',
      content: JSON.stringify(response.actions),
      timestamp: new Date().toISOString(),
      type: 'action',
      metadata: { actions: response.actions },
    });
  }

  return messages;
}
