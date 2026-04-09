
/**
 * Anytimebot API Integration Library
 * Handles communication with Anytimebot platform for chatbot and booking sync
 */

const ANYTIMEBOT_BASE_URL = 'https://anytimebot.app/api';

export interface AnytimebotConfig {
  username: string;
  name: string;
  avatar: string;
  avatarUrl?: string | null;
  greeting: string;
}

export interface AnytimebotChatResponse {
  response: string;
  success: boolean;
}

export interface AnytimebotAvailability {
  available: boolean;
  slots: string[];
}

export interface AnytimebotBooking {
  id: string;
  userId: string;
  eventTypeId: string;
  date: string;
  time: string;
  duration: number;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  status: string;
  notes?: string;
}

export interface AnytimebotLeadCapture {
  conversationId: string;
  timestamp: string;
  contactInfo: {
    nombre?: string;
    email?: string;
    telefono?: string;
    empresa?: string;
  };
  messages: {
    role: 'bot' | 'user';
    content: string;
    timestamp: string;
  }[];
  intent?: string;
  source: 'whatsapp' | 'webchat' | 'facebook' | 'instagram';
}

/**
 * Get public chatbot configuration
 */
export async function getAnytimebotConfig(username: string, timeoutMs: number = 15000): Promise<AnytimebotConfig | null> {
  try {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    console.log(`[Anytimebot] Fetching config for username: ${username}`);
    const url = `${ANYTIMEBOT_BASE_URL}/bot/public-config?username=${encodeURIComponent(username)}`;
    console.log(`[Anytimebot] URL: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`[Anytimebot] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Anytimebot] Failed to fetch config: ${response.status} ${response.statusText}`);
      console.error(`[Anytimebot] Error response: ${errorText}`);
      return null;
    }

    const data = await response.json();
    console.log(`[Anytimebot] Successfully fetched config for bot: ${data.name || 'unknown'}`);
    return data;
  } catch (error: any) {
    console.error('[Anytimebot] Error fetching config:', error);
    if (error.name === 'AbortError') {
      console.error('[Anytimebot] Request timeout - API did not respond in time');
    }
    return null;
  }
}

/**
 * Send a message to Anytimebot chatbot
 */
export async function sendChatMessage(
  username: string,
  message: string,
  conversationHistory?: any[]
): Promise<AnytimebotChatResponse | null> {
  try {
    const response = await fetch(`${ANYTIMEBOT_BASE_URL}/bot/public-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        message,
        conversationHistory: conversationHistory || [],
      }),
    });

    if (!response.ok) {
      console.error('Failed to send chat message:', response.statusText);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error sending chat message:', error);
    return null;
  }
}

/**
 * Check availability for booking
 */
export async function checkAvailability(
  userId: string,
  date: string,
  eventTypeId: string
): Promise<AnytimebotAvailability | null> {
  try {
    const response = await fetch(`${ANYTIMEBOT_BASE_URL}/bookings/check-availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        date,
        eventTypeId,
      }),
    });

    if (!response.ok) {
      console.error('Failed to check availability:', response.statusText);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error checking availability:', error);
    return null;
  }
}

/**
 * Transform Anytimebot lead capture to Volkern CRM lead format
 */
export function transformAnytimebotLead(leadCapture: AnytimebotLeadCapture) {
  const { contactInfo, messages, intent, source, conversationId } = leadCapture;

  // Extract conversation summary
  const conversationSummary = messages
    .map(msg => `[${msg.role.toUpperCase()}]: ${msg.content}`)
    .join('\n');

  // Generate a temporary email if none provided
  const email = contactInfo.email || `anytimebot-${conversationId}@leads.volkern.com`;
  
  return {
    nombre: contactInfo.nombre || 'Lead desde Anytimebot',
    email: email,
    telefono: contactInfo.telefono || null,
    empresa: contactInfo.empresa || null,
    fuente: `Anytimebot - ${source.charAt(0).toUpperCase() + source.slice(1)}`,
    estado: 'nuevo' as const,
    scoreValue: calculateInitialScore(leadCapture),
    notas: `[CONVERSACIÓN DESDE ANYTIMEBOT]\n\nID: ${conversationId}\nCanal: ${source}\nIntención: ${intent || 'No identificada'}\n\n--- Historial de Conversación ---\n${conversationSummary}`,
    tags: generateLeadTags(leadCapture),
  };
}

/**
 * Calculate initial lead score based on conversation data
 */
function calculateInitialScore(leadCapture: AnytimebotLeadCapture): number {
  let score = 30; // Base score for Anytimebot leads

  // +15 if email provided
  if (leadCapture.contactInfo.email) {
    score += 15;
  }

  // +10 if phone provided
  if (leadCapture.contactInfo.telefono) {
    score += 10;
  }

  // +10 if company provided
  if (leadCapture.contactInfo.empresa) {
    score += 10;
  }

  // +5 per user message (engagement)
  const userMessages = leadCapture.messages.filter(m => m.role === 'user').length;
  score += Math.min(userMessages * 5, 25);

  // +10 if high-intent keywords detected
  const highIntentKeywords = ['comprar', 'precio', 'contratar', 'agendar', 'consulta', 'cotización'];
  const conversationText = leadCapture.messages.map(m => m.content.toLowerCase()).join(' ');
  const hasHighIntent = highIntentKeywords.some(keyword => conversationText.includes(keyword));
  if (hasHighIntent) {
    score += 10;
  }

  return Math.min(score, 100);
}

/**
 * Generate tags based on conversation context
 */
function generateLeadTags(leadCapture: AnytimebotLeadCapture): string {
  const tags: string[] = ['anytimebot'];

  // Add source tag
  tags.push(leadCapture.source);

  // Add intent tag if available
  if (leadCapture.intent) {
    tags.push(leadCapture.intent);
  }

  // Detect interest areas from conversation
  const conversationText = leadCapture.messages.map(m => m.content.toLowerCase()).join(' ');

  if (conversationText.includes('curso') || conversationText.includes('capacitación')) {
    tags.push('interesado-cursos');
  }

  if (conversationText.includes('consultoría') || conversationText.includes('asesoría')) {
    tags.push('interesado-consultoría');
  }

  if (conversationText.includes('demo') || conversationText.includes('demostración')) {
    tags.push('solicita-demo');
  }

  if (conversationText.includes('urgente') || conversationText.includes('inmediato')) {
    tags.push('alta-prioridad');
  }

  return tags.join(',');
}

/**
 * Transform Anytimebot lead capture to Volkern CRM conversation format
 */
export function transformAnytimebotConversation(leadCapture: AnytimebotLeadCapture, tenantId: string, leadId?: string) {
  const { contactInfo, messages, source, conversationId, timestamp } = leadCapture;

  // Map Anytimebot source to Volkern CRM channel
  const canalMap: Record<typeof source, string> = {
    'whatsapp': 'whatsapp',
    'webchat': 'web',
    'facebook': 'facebook',
    'instagram': 'instagram'
  };

  // Get last message for preview
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  return {
    conversation: {
      tenantId,
      contactoNombre: contactInfo.nombre || 'Lead desde Anytimebot',
      contactoEmail: contactInfo.email || null,
      contactoTelefono: contactInfo.telefono || null,
      canal: canalMap[source] || 'web',
      estado: 'abierta',
      leadId: leadId || null,
      ultimoMensaje: lastMessage?.content || 'Nueva conversación desde Anytimebot',
      fechaUltimoMensaje: lastMessage ? new Date(lastMessage.timestamp) : new Date(timestamp),
      noLeidos: messages.filter(m => m.role === 'user').length,
    },
    messages: messages.map((msg, index) => ({
      contenido: msg.content,
      direccion: msg.role === 'user' ? 'entrante' : 'saliente',
      canal: canalMap[source] || 'web',
      estado: 'enviado',
      metadatos: {
        anytimebotConversationId: conversationId,
        timestamp: msg.timestamp,
        messageIndex: index,
        intent: leadCapture.intent,
      },
      fechaCreacion: new Date(msg.timestamp),
    }))
  };
}

/**
 * Transform Anytimebot booking to Volkern CRM appointment format
 */
export function transformAnytimebotBooking(booking: AnytimebotBooking) {
  return {
    titulo: `Cita desde Anytimebot - ${booking.clientName}`,
    fechaHora: new Date(`${booking.date}T${booking.time}`),
    duracion: booking.duration,
    descripcion: booking.notes || `Cita agendada vía Anytimebot\nCliente: ${booking.clientName}\nEmail: ${booking.clientEmail}\nTeléfono: ${booking.clientPhone || 'No proporcionado'}`,
    estado: 'pendiente' as const, // Using valid schema estado values
  };
}

/**
 * Send message to WhatsApp via Anytimebot
 */
export async function sendAnytimebotMessage(
  username: string,
  to: string,
  message: string,
  messageType: 'text' | 'template' | 'image' = 'text',
  mediaUrl?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const body: any = {
      username,
      to,
      message,
      messageType,
    };

    // Si hay mediaUrl, incluirlo en el body
    if (mediaUrl && messageType === 'image') {
      body.mediaUrl = mediaUrl;
    }

    const response = await fetch(`${ANYTIMEBOT_BASE_URL}/bot/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('Failed to send message via Anytimebot:', response.statusText, errorText);
      return {
        success: false,
        error: `Error ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      messageId: data.messageId || data.id,
    };
  } catch (error) {
    console.error('Error sending message via Anytimebot:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Validate webhook signature (placeholder for future security implementation)
 */
export function validateAnytimebotWebhook(signature: string, payload: any): boolean {
  // TODO: Implement signature validation when Anytimebot provides signing mechanism
  // For now, we accept all webhooks from the expected endpoint
  return true;
}
