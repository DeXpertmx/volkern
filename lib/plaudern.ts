
/**
 * Plaudern Chatbot Bridge API Integration Library
 * Professional API for e-commerce chatbot platform
 */

// ==================== INTERFACES ====================

/**
 * Bot Configuration Interface
 */
export interface PlaudernBot {
  id: string;
  name: string;
  personality?: string;
  greetingMessage?: string;
  description?: string;
  whatsappNumber?: string;
  status: 'active' | 'inactive';
  settings?: {
    welcomeMessage?: string;
    fallbackMessage?: string;
    businessHours?: {
      enabled: boolean;
      schedule?: Record<string, any>;
    };
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Conversation Interface
 */
export interface PlaudernConversation {
  id: string;
  botId: string;
  customerPhone: string;
  customerName?: string;
  status: 'active' | 'closed' | 'archived';
  lastMessageAt: string;
  unreadCount: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

/**
 * Message Interface
 */
export interface PlaudernMessage {
  id: string;
  conversationId: string;
  direction: 'incoming' | 'outgoing';
  content: string;
  messageType: 'text' | 'image' | 'document' | 'audio' | 'video';
  mediaUrl?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * Knowledge Base Document Interface
 */
export interface PlaudernDocument {
  id: string;
  botId: string;
  title: string;
  content: string;
  chunks: number;
  status: 'processing' | 'ready' | 'failed';
  createdAt: string;
}

/**
 * Webhook Payload from Plaudern
 */
export interface PlaudernWebhookPayload {
  eventType: 'message.received' | 'message.sent' | 'conversation.created' | 'conversation.updated';
  botId: string;
  conversationId: string;
  message?: {
    id: string;
    content: string;
    messageType: string;
    mediaUrl?: string;
    timestamp: string;
  };
  customer: {
    phone: string;
    name?: string;
    metadata?: Record<string, any>;
  };
  metadata?: Record<string, any>;
}

/**
 * API Client Configuration
 */
interface PlaudernConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

// ==================== CONFIGURATION ====================

const PLAUDERN_BASE_URL = 'https://plaudern.abacusai.app';
const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Integration ID for accessing Plaudern's external API
 * This can be configured per tenant or use a default
 */
const DEFAULT_INTEGRATION_ID = 'volkern-prod';

// ==================== HELPER FUNCTIONS ====================

/**
 * Makes an authenticated request to Plaudern API
 */
async function plaudernRequest(
  endpoint: string,
  options: RequestInit & { apiKey: string; timeout?: number }
): Promise<any> {
  const { apiKey, timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const fullUrl = `${PLAUDERN_BASE_URL}${endpoint}`;
    console.log(`🌐 Plaudern ${fetchOptions.method || 'GET'} Request: ${fullUrl}`);
    
    const response = await fetch(fullUrl, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...fetchOptions.headers,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log(`📊 Plaudern Response Status: ${response.status} ${response.statusText}`);

    // Try to parse JSON response
    let data: any;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.log(`📝 Plaudern Response (non-JSON):`, text);
      data = { rawResponse: text };
    }

    if (!response.ok) {
      const errorMessage = data.message || data.error || data.rawResponse || `Plaudern API error: ${response.status}`;
      console.error(`❌ Plaudern API Error:`, {
        status: response.status,
        statusText: response.statusText,
        endpoint,
        errorData: data
      });
      throw new Error(errorMessage);
    }

    console.log(`✅ Plaudern Request Success:`, endpoint);
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error(`⏱️ Plaudern API Timeout: ${endpoint}`);
      throw new Error('Plaudern API request timeout');
    }
    console.error(`❌ Plaudern Request Failed:`, {
      endpoint,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// ==================== BOT MANAGEMENT ====================

/**
 * Get all bots for the current tenant using integration endpoint
 */
export async function getPlaudernBots(apiKey: string, integrationId?: string): Promise<PlaudernBot[]> {
  try {
    const intId = integrationId || DEFAULT_INTEGRATION_ID;
    const response = await plaudernRequest(`/api/integrations/plaudern/${intId}`, {
      method: 'GET',
      apiKey,
    });

    // The integration endpoint returns bots directly
    return response.bots || response || [];
  } catch (error: any) {
    console.error('Error fetching Plaudern bots:', error);
    throw new Error(`No se pudieron obtener los bots de Plaudern: ${error.message}`);
  }
}

/**
 * Get a specific bot configuration using integration endpoint
 */
export async function getPlaudernBot(apiKey: string, botId: string, integrationId?: string): Promise<PlaudernBot> {
  try {
    const intId = integrationId || DEFAULT_INTEGRATION_ID;
    const response = await plaudernRequest(`/api/integrations/plaudern/${intId}/bots/${botId}`, {
      method: 'GET',
      apiKey,
    });

    return response.bot || response;
  } catch (error: any) {
    console.error('Error fetching Plaudern bot:', error);
    throw new Error(`No se pudo obtener el bot de Plaudern: ${error.message}`);
  }
}

/**
 * Create a new bot using integration endpoint
 */
export async function createPlaudernBot(
  apiKey: string,
  botData: {
    name: string;
    personality: string;
    greetingMessage?: string;
    description?: string;
    whatsappNumber?: string;
    settings?: Record<string, any>;
  },
  integrationId?: string
): Promise<PlaudernBot> {
  try {
    const intId = integrationId || DEFAULT_INTEGRATION_ID;
    console.log(`📝 Creating bot in integration ${intId}`);
    
    const response = await plaudernRequest(`/api/integrations/plaudern/${intId}/bots`, {
      method: 'POST',
      apiKey,
      body: JSON.stringify(botData),
    });

    console.log(`✓ Bot created successfully in integration ${intId}`);
    return response.bot || response;
  } catch (error: any) {
    console.error('Error creating Plaudern bot:', error);
    throw new Error(`No se pudo crear el bot en Plaudern: ${error.message}`);
  }
}

/**
 * Update bot configuration using integration endpoint
 */
export async function updatePlaudernBot(
  apiKey: string,
  botId: string,
  updates: Partial<PlaudernBot>,
  integrationId?: string
): Promise<PlaudernBot> {
  const intId = integrationId || DEFAULT_INTEGRATION_ID;
  
  try {
    console.log(`🔄 Updating bot ${botId} in integration ${intId}`);
    console.log(`📤 Update payload:`, JSON.stringify(updates));
    
    const response = await plaudernRequest(`/api/integrations/plaudern/${intId}/bots/${botId}`, {
      method: 'PUT',
      apiKey,
      body: JSON.stringify(updates),
    });

    console.log(`✓ Bot ${botId} updated successfully in integration ${intId}`);
    return response.bot || response;
  } catch (error: any) {
    console.error('❌ Error updating Plaudern bot:', {
      botId,
      integrationId: intId,
      errorMessage: error.message,
      errorStack: error.stack
    });
    // Re-throw with more context
    throw error;
  }
}

/**
 * Delete a bot from Plaudern
 */
export async function deletePlaudernBot(
  apiKey: string,
  botId: string,
  integrationId?: string
): Promise<void> {
  const intId = integrationId || DEFAULT_INTEGRATION_ID;
  
  try {
    console.log(`🗑️  Deleting bot ${botId} from integration ${intId}`);
    console.log(`🔗 DELETE URL: ${PLAUDERN_BASE_URL}/api/integrations/plaudern/${intId}/bots/${botId}`);
    
    await plaudernRequest(`/api/integrations/plaudern/${intId}/bots/${botId}`, {
      method: 'DELETE',
      apiKey,
    });

    console.log(`✓ Bot ${botId} deleted successfully`);
  } catch (error: any) {
    console.error('❌ Error deleting Plaudern bot:', {
      botId,
      integrationId: intId,
      errorMessage: error.message,
      errorStack: error.stack
    });
    // Re-throw with more context
    throw error;
  }
}

// ==================== CONVERSATION MANAGEMENT ====================

/**
 * Get recent conversations
 */
export async function getPlaudernConversations(
  apiKey: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: string;
  }
): Promise<{ conversations: PlaudernConversation[]; total: number }> {
  try {
    const queryParams = new URLSearchParams();
    if (options?.limit) queryParams.append('limit', options.limit.toString());
    if (options?.offset) queryParams.append('offset', options.offset.toString());
    if (options?.status) queryParams.append('status', options.status);

    const endpoint = `/api/conversations${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

    const response = await plaudernRequest(endpoint, {
      method: 'GET',
      apiKey,
    });

    return {
      conversations: response.conversations || [],
      total: response.total || 0,
    };
  } catch (error: any) {
    console.error('Error fetching Plaudern conversations:', error);
    throw new Error(`No se pudieron obtener las conversaciones: ${error.message}`);
  }
}

/**
 * Get conversation details with message history
 */
export async function getPlaudernConversation(
  apiKey: string,
  conversationId: string
): Promise<{ conversation: PlaudernConversation; messages: PlaudernMessage[] }> {
  try {
    const response = await plaudernRequest(`/api/conversations/${conversationId}`, {
      method: 'GET',
      apiKey,
    });

    return {
      conversation: response.conversation,
      messages: response.messages || [],
    };
  } catch (error: any) {
    console.error('Error fetching Plaudern conversation:', error);
    throw new Error(`No se pudo obtener la conversación: ${error.message}`);
  }
}

/**
 * Get conversation statistics
 */
export async function getPlaudernConversationStats(apiKey: string): Promise<{
  total: number;
  active: number;
  closed: number;
  averageResponseTime: number;
}> {
  try {
    const response = await plaudernRequest('/api/conversations/stats', {
      method: 'GET',
      apiKey,
    });

    return response.stats;
  } catch (error: any) {
    console.error('Error fetching Plaudern conversation stats:', error);
    throw new Error(`No se pudieron obtener las estadísticas: ${error.message}`);
  }
}

// ==================== KNOWLEDGE BASE ====================

/**
 * Create a knowledge base document
 */
export async function createPlaudernDocument(
  apiKey: string,
  botId: string,
  file: File
): Promise<PlaudernDocument> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('botId', botId)

    const response = await fetch(`${PLAUDERN_BASE_URL}/api/knowledge-base/documents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    return data.document || data
  } catch (error: any) {
    console.error('Error creating Plaudern document:', error);
    throw new Error(`No se pudo crear el documento: ${error.message}`);
  }
}

/**
 * Get all documents for a bot
 */
export async function getPlaudernDocuments(
  apiKey: string,
  botId: string
): Promise<PlaudernDocument[]> {
  try {
    const response = await plaudernRequest(`/api/knowledge-base/documents/${botId}`, {
      method: 'GET',
      apiKey,
    });

    return response.documents || [];
  } catch (error: any) {
    console.error('Error fetching Plaudern documents:', error);
    throw new Error(`No se pudieron obtener los documentos: ${error.message}`);
  }
}

/**
 * Search knowledge base using RAG
 */
export async function searchPlaudernKnowledge(
  apiKey: string,
  query: string,
  botId?: string,
  limit: number = 5
): Promise<Array<{ content: string; score: number; metadata?: Record<string, any> }>> {
  try {
    const response = await plaudernRequest('/api/knowledge-base/search', {
      method: 'POST',
      apiKey,
      body: JSON.stringify({
        query,
        botId,
        limit,
      }),
    });

    return response.results || [];
  } catch (error: any) {
    console.error('Error searching Plaudern knowledge base:', error);
    throw new Error(`No se pudo realizar la búsqueda: ${error.message}`);
  }
}

/**
 * Delete a knowledge base document
 */
export async function deletePlaudernDocument(
  apiKey: string,
  documentId: string
): Promise<void> {
  try {
    await plaudernRequest(`/api/knowledge-base/document/${documentId}`, {
      method: 'DELETE',
      apiKey,
    });
  } catch (error: any) {
    console.error('Error deleting Plaudern document:', error);
    throw new Error(`No se pudo eliminar el documento: ${error.message}`);
  }
}

// ==================== AI CHAT ====================

/**
 * Test AI chat with RAG (for development/testing) using integration endpoint
 */
export async function testPlaudernChat(
  apiKey: string,
  message: string,
  botId?: string,
  integrationId?: string,
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<{ response: string; sources?: any[] }> {
  try {
    const intId = integrationId || DEFAULT_INTEGRATION_ID;
    const response = await plaudernRequest(`/api/integrations/plaudern/${intId}/chat`, {
      method: 'POST',
      apiKey,
      body: JSON.stringify({
        message,
        botId,
        conversationHistory: conversationHistory || [],
      }),
    });

    return {
      response: response.response || response.message,
      sources: response.sources,
    };
  } catch (error: any) {
    console.error('Error testing Plaudern chat:', error);
    throw new Error(`No se pudo probar el chat: ${error.message}`);
  }
}

// ==================== WEBHOOK VALIDATION ====================

/**
 * Validate incoming webhook signature (if implemented by Plaudern)
 */
export function validatePlaudernWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // If Plaudern implements webhook signature validation, add it here
  // For now, return true (assuming no signature validation)
  return true;
}

// ==================== HEALTH CHECK ====================

/**
 * Check Plaudern API health using integration endpoint
 * NO requiere autenticación según documentación oficial
 */
export async function checkPlaudernHealth(integrationId?: string): Promise<{ status: string; message: string; service?: string; version?: string }> {
  try {
    const intId = integrationId || DEFAULT_INTEGRATION_ID;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    console.log(`🔍 Checking Plaudern health: ${PLAUDERN_BASE_URL}/api/integrations/plaudern/${intId}/health`);

    const response = await fetch(`${PLAUDERN_BASE_URL}/api/integrations/plaudern/${intId}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // NO se envía Authorization - health check es público
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Health check failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log(`✓ Health check passed:`, data);
    
    return {
      status: data.status || 'ok',
      message: data.message || 'API is healthy',
      service: data.service,
      version: data.version,
    };
  } catch (error: any) {
    console.error('Error checking Plaudern health:', error);
    if (error.name === 'AbortError') {
      throw new Error('Health check timeout - Plaudern API no responde');
    }
    throw new Error(`Health check error: ${error.message}`);
  }
}

// ==================== EXPORTS ====================

export {
  PLAUDERN_BASE_URL,
  DEFAULT_TIMEOUT,
};
