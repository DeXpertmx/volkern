/**
 * Parser para mensajes de Evolution API
 */
export function parseEvolutionMessage(body: any) {
  try {
    let messageData;
    
    // Detectar formato del payload
    if (body.event === 'messages.upsert' && body.data?.length > 0) {
      messageData = body.data[0];
    } else if (Array.isArray(body.data) && body.data.length > 0) {
      messageData = body.data[0];
    } else if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
      messageData = body.data;
    } else if (body.key || body.message) {
      messageData = body;
    } else {
      return null;
    }

    let messageText = '';
    let fromNumber = '';
    let fromName = '';
    let messageId = '';
    let direction: 'incoming' | 'outgoing' = 'incoming';

    // Dirección
    if (messageData.key?.fromMe === true || messageData.fromMe === true) {
      direction = 'outgoing';
    }

    // Número
    if (messageData.key?.remoteJid) {
      fromNumber = messageData.key.remoteJid
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '');
    } else if (messageData.from) {
      fromNumber = messageData.from
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '');
    }

    // Nombre
    fromName = messageData.pushName || messageData.key?.pushName || '';

    // Texto
    if (messageData.message) {
      messageText = messageData.message.conversation || 
                   messageData.message.extendedTextMessage?.text ||
                   messageData.message.imageMessage?.caption ||
                   messageData.message.documentMessage?.caption ||
                   messageData.message.videoMessage?.caption ||
                   '';
    } else if (messageData.body) {
      messageText = messageData.body;
    }

    // ID
    messageId = messageData.key?.id || messageData.id || `evo_${Date.now()}`;

    // Validar
    if (!fromNumber || !messageText) return null;

    // Filtrar mensajes del sistema
    if (messageText.includes('This message was deleted') || 
        messageText.includes('missed voice call') ||
        messageText.includes('missed video call')) {
      return null;
    }

    return {
      id: messageId,
      from: fromNumber,
      fromName,
      message: messageText,
      timestamp: new Date().toISOString(),
      direction,
    };

  } catch (error) {
    console.error('Error parseando mensaje:', error);
    return null;
  }
}