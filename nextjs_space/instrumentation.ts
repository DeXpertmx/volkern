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

    // Registrar los listeners EventBus → Contabilidad (EXPENSE_CREATED →
    // asiento + TaxRecords del Modelo 303/111, INVOICE_CREATED → asiento,
    // PAYROLL_GENERATED → asiento + retención IRPF). Sin esto, los gastos se
    // crean pero nunca se contabilizan y los modelos de impuestos quedan
    // vacíos. El event bus es en memoria: debe registrarse en el mismo
    // proceso que atiende los requests.
    try {
      const { initializeAccountingListeners } = await import('@/lib/accounting/accounting-listener');
      initializeAccountingListeners();
      console.log('[Instrumentation] Accounting listeners inicializados (EventBus → contabilidad activo)');
    } catch (error) {
      console.error('[Instrumentation] Error inicializando accounting listeners:', error);
    }

    // Registrar los listeners EventBus → AutomationRuleEngine de Hospitality
    // (plan maestro §22): reservation.created, checked_in, cleaning.completed,
    // etc. El event bus es en memoria: si estos listeners no se registran en
    // el mismo proceso que atiende los requests, los eventos se emiten pero
    // ninguna regla de automatización de Hospitality se dispara.
    try {
      const { setupHospitalityEventBridge } = await import('@/lib/hospitality/automation-bridge');
      setupHospitalityEventBridge();
      console.log('[Instrumentation] Hospitality Event Bridge inicializado (EventBus → AutomationRuleEngine activo)');
    } catch (error) {
      console.error('[Instrumentation] Error inicializando Hospitality Event Bridge:', error);
    }

    // Worker de acciones del Automation Engine (BullMQ, cola
    // `marketing_workflows`). Sin este worker las reglas se evalúan y las
    // acciones se ENCOLAN, pero nunca se ejecutan: no se crean tareas ni
    // limpiezas y no se envían mensajes. Solo arranca si Redis está
    // disponible (setupWorkflowWorker lo comprueba por dentro).
    try {
      const { AutomationRuleEngine } = await import('@/lib/marketing/automation/rule-engine');
      await AutomationRuleEngine.initialize();
      const { setupWorkflowWorker } = await import('@/lib/marketing/automation/workflow-worker');
      await setupWorkflowWorker();
      console.log('[Instrumentation] Cola + workflow worker inicializados (automatizaciones activas)');
    } catch (error) {
      console.error('[Instrumentation] Error inicializando automatizaciones (cola/worker):', error);
    }

    // Tareas programadas (node-cron). initCronJobs registra SOLO los jobs
    // seguros para producción: Morning Briefing, métricas SaaS, límites de
    // planes, renovación de webhooks de Google Calendar, analytics cleanup,
    // IMAP polling, ADS (schedule/AB/watchdog/sync), el cron del trigger
    // `lead_sin_respuesta` (cada 30 min, leads inactivos 24h) y el de
    // Hospitality check-in due (cada hora).
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
