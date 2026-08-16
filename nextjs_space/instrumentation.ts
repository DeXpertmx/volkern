export async function register() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://_:_@localhost/_'
  }

  // Registrar el agente Gemma (chatbot de Telegram/WhatsApp) SOLO en el runtime
  // de Node.js: suscribe el listener de MESSAGE_RECEIVED al event bus en
  // memoria. Sin esto, los webhooks emiten el evento pero nadie escucha y el
  // bot nunca responde.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initGemmaChatbot } = await import('@/lib/agents/chatwoot-chatbot-handler');
      initGemmaChatbot();
      console.log('[Instrumentation] Gemma chatbot inicializado (listener MESSAGE_RECEIVED activo)');
    } catch (error) {
      console.error('[Instrumentation] Error inicializando Gemma chatbot:', error);
    }
  }
}
