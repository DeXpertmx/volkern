/**
 * Volkern CRM - Widget de Chatbot Embebible
 * 
 * Uso:
 * <script src="https://volkern.app/chatbot-widget.js" data-widget-key="TU_TENANT_ID"></script>
 */

(function() {
  'use strict';

  // Configuración
  const WIDGET_API_URL = 'https://volkern.app/api/chatbot/widget';
  
  // Obtener la key del script
  const scriptTag = document.currentScript || document.querySelector('script[data-widget-key]');
  const widgetKey = scriptTag?.getAttribute('data-widget-key');
  const customColor = scriptTag?.getAttribute('data-color') || '#2563eb';
  const position = scriptTag?.getAttribute('data-position') || 'right';

  if (!widgetKey) {
    console.error('Volkern Widget: data-widget-key es requerido');
    return;
  }

  // Estado
  let isOpen = false;
  let isLoading = false;
  let messages = [];
  let sessionId = localStorage.getItem('volkern_session_' + widgetKey) || generateId();
  let config = null;

  // Guardar sessionId
  localStorage.setItem('volkern_session_' + widgetKey, sessionId);

  // Utilidades
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Estilos CSS
  const styles = `
    #volkern-widget-container {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      position: fixed;
      bottom: 20px;
      ${position === 'left' ? 'left: 20px;' : 'right: 20px;'}
      z-index: 999999;
    }

    #volkern-widget-button {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${customColor};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: transform 0.3s, box-shadow 0.3s;
    }

    #volkern-widget-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(0,0,0,0.2);
    }

    #volkern-widget-button svg {
      width: 28px;
      height: 28px;
      fill: white;
    }

    #volkern-chat-window {
      display: none;
      position: absolute;
      bottom: 80px;
      ${position === 'left' ? 'left: 0;' : 'right: 0;'}
      width: 380px;
      height: 520px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      flex-direction: column;
      overflow: hidden;
    }

    #volkern-chat-window.open {
      display: flex;
    }

    #volkern-chat-header {
      background: ${customColor};
      color: white;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    #volkern-chat-header-icon {
      width: 40px;
      height: 40px;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #volkern-chat-header-icon svg {
      width: 24px;
      height: 24px;
      fill: white;
    }

    #volkern-chat-header-info h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    #volkern-chat-header-info p {
      margin: 2px 0 0 0;
      font-size: 12px;
      opacity: 0.9;
    }

    #volkern-chat-close {
      margin-left: auto;
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 8px;
      border-radius: 50%;
      transition: background 0.2s;
    }

    #volkern-chat-close:hover {
      background: rgba(255,255,255,0.2);
    }

    #volkern-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: #f8fafc;
    }

    .volkern-message {
      margin-bottom: 12px;
      display: flex;
      gap: 8px;
    }

    .volkern-message.user {
      flex-direction: row-reverse;
    }

    .volkern-message-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .volkern-message.assistant .volkern-message-avatar {
      background: ${customColor}20;
    }

    .volkern-message.user .volkern-message-avatar {
      background: ${customColor};
    }

    .volkern-message-avatar svg {
      width: 18px;
      height: 18px;
    }

    .volkern-message.assistant .volkern-message-avatar svg {
      fill: ${customColor};
    }

    .volkern-message.user .volkern-message-avatar svg {
      fill: white;
    }

    .volkern-message-bubble {
      max-width: 75%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.4;
    }

    .volkern-message.assistant .volkern-message-bubble {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 16px 16px 16px 4px;
    }

    .volkern-message.user .volkern-message-bubble {
      background: ${customColor};
      color: white;
      border-radius: 16px 16px 4px 16px;
    }

    .volkern-typing {
      display: flex;
      gap: 4px;
      padding: 4px 0;
    }

    .volkern-typing span {
      width: 8px;
      height: 8px;
      background: #94a3b8;
      border-radius: 50%;
      animation: volkernTyping 1.4s infinite;
    }

    .volkern-typing span:nth-child(2) { animation-delay: 0.2s; }
    .volkern-typing span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes volkernTyping {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-4px); }
    }

    #volkern-chat-input-area {
      padding: 16px;
      background: white;
      border-top: 1px solid #e2e8f0;
      display: flex;
      gap: 8px;
    }

    #volkern-chat-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #e2e8f0;
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    #volkern-chat-input:focus {
      border-color: ${customColor};
    }

    #volkern-chat-send {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: ${customColor};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
    }

    #volkern-chat-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    #volkern-chat-send svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    .volkern-quick-replies {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 4px 0 8px 0;
    }

    .volkern-quick-reply-chip {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 500;
      background: ${customColor}15;
      color: ${customColor};
      border: 1px solid ${customColor}30;
      border-radius: 16px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .volkern-quick-reply-chip:hover {
      background: ${customColor}25;
      border-color: ${customColor}50;
      transform: scale(1.02);
    }

    .volkern-quick-reply-chip:active {
      transform: scale(0.97);
    }

    #volkern-powered {
      text-align: center;
      padding: 8px;
      font-size: 11px;
      color: #94a3b8;
      background: white;
    }

    #volkern-powered a {
      color: ${customColor};
      text-decoration: none;
    }

    @media (max-width: 480px) {
      #volkern-chat-window {
        width: calc(100vw - 40px);
        height: calc(100vh - 140px);
        bottom: 80px;
        ${position === 'left' ? 'left: 0;' : 'right: 0;'}
      }
    }
  `;

  // SVG Icons
  const icons = {
    chat: '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    bot: '<svg viewBox="0 0 24 24"><path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zM7.5 13a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm9 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/></svg>',
    user: '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
  };

  // Crear el widget
  function createWidget() {
    // Inyectar estilos
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    // Crear contenedor
    const container = document.createElement('div');
    container.id = 'volkern-widget-container';
    container.innerHTML = `
      <button id="volkern-widget-button" aria-label="Abrir chat">
        ${icons.chat}
      </button>
      <div id="volkern-chat-window">
        <div id="volkern-chat-header">
          <div id="volkern-chat-header-icon">${icons.bot}</div>
          <div id="volkern-chat-header-info">
            <h3 id="volkern-assistant-name">Asistente</h3>
            <p id="volkern-company-name">En línea</p>
          </div>
          <button id="volkern-chat-close" aria-label="Cerrar chat">${icons.close}</button>
        </div>
        <div id="volkern-chat-messages"></div>
        <div id="volkern-chat-input-area">
          <input type="text" id="volkern-chat-input" placeholder="Escribe un mensaje..." />
          <button id="volkern-chat-send" aria-label="Enviar">${icons.send}</button>
        </div>
        <div id="volkern-powered">Powered by <a href="https://volkern.app" target="_blank">Volkern</a></div>
      </div>
    `;
    document.body.appendChild(container);

    // Event listeners
    document.getElementById('volkern-widget-button').addEventListener('click', toggleChat);
    document.getElementById('volkern-chat-close').addEventListener('click', toggleChat);
    document.getElementById('volkern-chat-send').addEventListener('click', sendMessage);
    document.getElementById('volkern-chat-input').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') sendMessage();
    });

    // Cargar configuración
    loadConfig();
  }

  // Cargar configuración del widget
  async function loadConfig() {
    try {
      const response = await fetch(WIDGET_API_URL + '?key=' + widgetKey);
      const data = await response.json();
      
      if (data.success && data.config) {
        config = data.config;
        document.getElementById('volkern-assistant-name').textContent = config.nombreAsistente || 'Asistente';
        document.getElementById('volkern-company-name').textContent = config.nombreEmpresa || 'En línea';
      }
    } catch (error) {
      console.error('Volkern Widget: Error al cargar configuración', error);
    }
  }

  // Toggle chat
  function toggleChat() {
    isOpen = !isOpen;
    const chatWindow = document.getElementById('volkern-chat-window');
    const button = document.getElementById('volkern-widget-button');
    
    if (isOpen) {
      chatWindow.classList.add('open');
      button.innerHTML = icons.close;
      
      // Mostrar mensaje de bienvenida si es primera vez
      if (messages.length === 0) {
        const welcomeMsg = config?.mensajeBienvenida || 
                          `¡Hola! Soy ${config?.nombreAsistente || 'tu asistente'}. ¿En qué puedo ayudarte?`;
        addMessage('assistant', welcomeMsg);
      }
      
      document.getElementById('volkern-chat-input').focus();
    } else {
      chatWindow.classList.remove('open');
      button.innerHTML = icons.chat;
    }
  }

  // Agregar mensaje a la UI
  function addMessage(role, content, quickReplies) {
    messages.push({ role, content, quickReplies });
    const messagesContainer = document.getElementById('volkern-chat-messages');
    
    // Limpiar quick replies anteriores
    const oldReplies = messagesContainer.querySelectorAll('.volkern-quick-replies');
    oldReplies.forEach(el => el.remove());
    
    const messageEl = document.createElement('div');
    messageEl.className = 'volkern-message ' + role;
    messageEl.innerHTML = `
      <div class="volkern-message-avatar">
        ${role === 'assistant' ? icons.bot : icons.user}
      </div>
      <div class="volkern-message-bubble">${escapeHtml(content)}</div>
    `;
    
    messagesContainer.appendChild(messageEl);
    
    // Agregar quick replies si existen
    if (quickReplies && quickReplies.length > 0) {
      const repliesEl = document.createElement('div');
      repliesEl.className = 'volkern-quick-replies';
      
      quickReplies.forEach(function(reply) {
        const chip = document.createElement('button');
        chip.className = 'volkern-quick-reply-chip';
        chip.textContent = reply;
        chip.addEventListener('click', function() {
          if (isLoading) return;
          addMessage('user', reply);
          sendTextMessage(reply);
        });
        repliesEl.appendChild(chip);
      });
      
      messagesContainer.appendChild(repliesEl);
    }
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Mostrar indicador de escritura
  function showTyping() {
    const messagesContainer = document.getElementById('volkern-chat-messages');
    const typingEl = document.createElement('div');
    typingEl.id = 'volkern-typing-indicator';
    typingEl.className = 'volkern-message assistant';
    typingEl.innerHTML = `
      <div class="volkern-message-avatar">${icons.bot}</div>
      <div class="volkern-message-bubble">
        <div class="volkern-typing">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Ocultar indicador de escritura
  function hideTyping() {
    const typingEl = document.getElementById('volkern-typing-indicator');
    if (typingEl) typingEl.remove();
  }

  // Enviar texto como mensaje (usado por quick replies)
  async function sendTextMessage(text) {
    if (!text || isLoading) return;
    isLoading = true;
    showTyping();
    
    try {
      const response = await fetch(WIDGET_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Key': widgetKey
        },
        body: JSON.stringify({
          message: text,
          sessionId,
          conversationHistory: messages.slice(-8)
        })
      });
      
      const data = await response.json();
      
      hideTyping();
      
      if (data.success && data.response) {
        addMessage('assistant', data.response, data.quickReplies);
        if (data.sessionId) sessionId = data.sessionId;
      } else {
        addMessage('assistant', 'Lo siento, hubo un error. Por favor intenta de nuevo.');
      }
    } catch (error) {
      hideTyping();
      addMessage('assistant', 'Error de conexión. Por favor intenta de nuevo.');
      console.error('Volkern Widget: Error al enviar mensaje', error);
    } finally {
      isLoading = false;
    }
  }

  // Enviar mensaje
  async function sendMessage() {
    const input = document.getElementById('volkern-chat-input');
    const message = input.value.trim();
    
    if (!message || isLoading) return;
    
    input.value = '';
    addMessage('user', message);
    isLoading = true;
    showTyping();
    
    try {
      const response = await fetch(WIDGET_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Key': widgetKey
        },
        body: JSON.stringify({
          message,
          sessionId,
          conversationHistory: messages.slice(-8)
        })
      });
      
      const data = await response.json();
      
      hideTyping();
      
      if (data.success && data.response) {
        addMessage('assistant', data.response, data.quickReplies);
        if (data.sessionId) sessionId = data.sessionId;
      } else {
        addMessage('assistant', 'Lo siento, hubo un error. Por favor intenta de nuevo.');
      }
    } catch (error) {
      hideTyping();
      addMessage('assistant', 'Error de conexión. Por favor intenta de nuevo.');
      console.error('Volkern Widget: Error al enviar mensaje', error);
    } finally {
      isLoading = false;
    }
  }

  // Escapar HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Iniciar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();
