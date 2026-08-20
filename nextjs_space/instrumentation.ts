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

    // Registrar los listeners EventBus → AutomationEngine (formulario_enviado,
    // nuevo_lead, cita_agendada, etc.). El event bus es en memoria: si estos
    // listeners no se registran en el mismo proceso que atiende los requests,
    // los eventos se emiten pero ninguna automatización se dispara.
    try {
      const { initializeAutomationListeners } = await import('@/lib/skills/automation-listener');
      initializeAutomationListeners();
      console.log('[Instrumentation] Automation listeners inicializados (EventBus → AutomationEngine activo)');
    } catch (error) {
      console.error('[Instrumentation] Error inicializando automation listeners:', error);
    }

    // Tareas programadas (node-cron). initCronJobs registra SOLO los jobs
    // seguros para producción: Morning Briefing, métricas SaaS, límites de
    // planes, renovación de webhooks de Google Calendar, analytics cleanup,
    // IMAP polling, ADS (schedule/AB/watchdog/sync) y el cron del trigger
    // `lead_sin_respuesta` (cada 30 min, leads inactivos 24h).
    //
    // ⚠️ Quedan EXCLUIDOS a propósito: la recuperación proactiva de facturas
    // (creaba facturas mock con Math.random()) — eliminada —, el "Ritual
    // Dominical" de auditoría fiscal (GlobalAuditCloud masivo) y el churn
    // semanal (duplicado del MRR diario).
    try {
      const { initCronJobs } = await import('@/lib/cron/scheduler');
      initCronJobs();
    } catch (error) {
      console.error('[Instrumentation] Error inicializando tareas programadas:', error);
    }
  }
}
