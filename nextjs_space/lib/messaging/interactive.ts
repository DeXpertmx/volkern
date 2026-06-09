/**
 * Interactive WhatsApp Message Builders
 * Genera content_attributes para mensajes interactivos vía Chatwoot API.
 *
 * Tipos soportados:
 * - quick_reply: Botones de respuesta rápida (max 3)
 * - cta_button: Botones CTA (reply + URL, max 3)
 * - list: Mensaje de lista (menú de opciones)
 *
 * Referencia: Chatwoot envía estos content_attributes al proveedor de WhatsApp
 * que los convierte en el formato nativo de WhatsApp Cloud API.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface InteractiveButton {
  id: string;
  title: string;
  type: 'reply' | 'url';
  url?: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title?: string;
  rows: ListRow[];
}

export interface InteractiveContent {
  type: 'button' | 'list';
  header?: { type: 'text'; text: string };
  body: { text: string };
  footer?: { text: string };
  action: {
    buttons?: Array<{ type: 'reply'; reply: { id: string; title: string } } | { type: 'url'; url: { text: string; url: string } }>;
    button?: string;        // list trigger text
    sections?: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }>;
  };
}

// ─── Builders ─────────────────────────────────────────────────────────────

/**
 * Construye botones de respuesta rápida (quick reply)
 * Útil para: saludo inicial, confirmación, opciones simples
 */
export function buildQuickReplyButtons(
  bodyText: string,
  buttons: InteractiveButton[],
  headerText?: string,
  footerText?: string
): { content: string; contentType: string; contentAttributes: Record<string, any> } {
  const interactive: InteractiveContent = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.slice(0, 3).map(btn => ({
        type: 'reply' as const,
        reply: { id: btn.id, title: btn.title },
      })),
    },
  };

  if (headerText) interactive.header = { type: 'text', text: headerText };
  if (footerText) interactive.footer = { text: footerText };

  return {
    content: bodyText,
    contentType: 'input_select',
    contentAttributes: { interactive },
  };
}

/**
 * Construye botones CTA (Call To Action)
 * Útil para: links a página web, llamar por teléfono, ver catálogo
 */
export function buildCTAButtons(
  bodyText: string,
  buttons: InteractiveButton[],
  headerText?: string,
  footerText?: string
): { content: string; contentType: string; contentAttributes: Record<string, any> } {
  const interactive: InteractiveContent = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.slice(0, 3).map(btn => {
        if (btn.type === 'url' && btn.url) {
          return {
            type: 'url' as const,
            url: { text: btn.title, url: btn.url },
          };
        }
        return {
          type: 'reply' as const,
          reply: { id: btn.id, title: btn.title },
        };
      }),
    },
  };

  if (headerText) interactive.header = { type: 'text', text: headerText };
  if (footerText) interactive.footer = { text: footerText };

  return {
    content: bodyText,
    contentType: 'input_select',
    contentAttributes: { interactive },
  };
}

/**
 * Construye mensaje de lista (hasta 10 filas en 1 sección)
 * Útil para: mostrar servicios, productos, horarios disponibles
 */
export function buildListMessage(
  bodyText: string,
  buttonText: string,
  sections: ListSection[],
  headerText?: string,
  footerText?: string
): { content: string; contentType: string; contentAttributes: Record<string, any> } {
  const interactive: InteractiveContent = {
    type: 'list',
    body: { text: bodyText },
    action: {
      button: buttonText,
      sections: sections.slice(0, 1).map(section => ({
        title: section.title,
        rows: section.rows.slice(0, 10).map(row => ({
          id: row.id,
          title: row.title,
          description: row.description,
        })),
      })),
    },
  };

  if (headerText) interactive.header = { type: 'text', text: headerText };
  if (footerText) interactive.footer = { text: footerText };

  return {
    content: bodyText,
    contentType: 'input_select',
    contentAttributes: { interactive },
  };
}

// ─── Presets para el chatbot ─────────────────────────────────────────────

/**
 * Botones de bienvenida / menú principal
 */
export function buildWelcomeButtons(tenantName: string, assistantName: string) {
  return buildQuickReplyButtons(
    `¡Hola! 👋 Soy *${assistantName}*, asistente virtual de *${tenantName}*. ¿En qué puedo ayudarte?`,
    [
      { id: 'ver_servicios', title: '📋 Ver servicios', type: 'reply' },
      { id: 'agendar_cita', title: '📅 Agendar cita', type: 'reply' },
      { id: 'hablar_asesor', title: '👤 Hablar con asesor', type: 'reply' },
    ],
    undefined,
    'Responde con una opción o escribe tu consulta'
  );
}

/**
 * Lista de servicios disponibles
 */
export function buildServicesList(
  services: Array<{ id: string; nombre: string; descripcion?: string; precio: number; moneda: string; duracionMinutos: number }>,
  tenantName: string
) {
  return buildListMessage(
    `Estos son los servicios de *${tenantName}*:`,
    'Ver servicios',
    [{
      title: 'Servicios disponibles',
      rows: services.map(s => ({
        id: `servicio_${s.id}`,
        title: s.nombre,
        description: `${s.duracionMinutos} min · $${s.precio} ${s.moneda}${s.descripcion ? ' · ' + s.descripcion.substring(0, 30) : ''}`,
      })),
    }],
    undefined,
    'Selecciona un servicio para más información'
  );
}

/**
 * Botones de confirmación para agendamiento
 */
export function buildBookingConfirmation(serviceName: string, fecha: string, precio: number, moneda: string) {
  return buildQuickReplyButtons(
    `✅ *¿Confirmamos tu cita?*\n\n📌 *Servicio:* ${serviceName}\n📅 *Fecha:* ${fecha}\n💰 *Precio:* $${precio} ${moneda}\n\n¿Todo correcto?`,
    [
      { id: 'confirmar_cita', title: '✅ Confirmar', type: 'reply' },
      { id: 'cambiar_fecha', title: '📅 Cambiar fecha', type: 'reply' },
      { id: 'cancelar', title: '❌ Cancelar', type: 'reply' },
    ]
  );
}

/**
 * Botones de seguimiento post-cita
 */
export function buildPostBookingButtons() {
  return buildQuickReplyButtons(
    '¿Necesitas algo más?',
    [
      { id: 'ver_servicios', title: '📋 Ver más servicios', type: 'reply' },
      { id: 'hablar_asesor', title: '👤 Hablar con asesor', type: 'reply' },
    ],
    undefined,
    'Estoy aquí para ayudarte'
  );
}

// ─── Detección de intenciones para mensajes interactivos ──────────────────

export interface InteractiveContext {
  /** Mostrar menú de bienvenida con quick replies */
  showWelcome?: boolean;
  /** Mostrar lista de servicios */
  showServices?: boolean;
  /** Confirmación de cita */
  showBookingConfirm?: { serviceName: string; fecha: string; precio: number; moneda: string };
  /** Post-ci ta */
  showPostBooking?: boolean;
}

/**
 * Detecta qué elementos interactivos mostrar según el mensaje del usuario
 * y la respuesta del LLM.
 */
export function detectInteractiveContext(
  userMessage: string,
  llmResponse: string,
  hasServices: boolean
): InteractiveContext {
  // Normalizar: quitar acentos y pasar a minúsculas para matching robusto
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita acentos

  const userLower = normalize(userMessage);
  const responseLower = normalize(llmResponse);

  // Saludo inicial → welcome buttons
  const greetings = ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'hi', 'hey', 'ola', 'inicio', 'empezar', 'saludos', 'buenas'];
  const isGreeting = greetings.some(g => userLower.includes(g));
  // Permitir saludos en mensajes de hasta 100 chars (antes 30 era muy restrictivo)
  if (isGreeting && userLower.length < 100) {
    return { showWelcome: true };
  }

  // Pregunta por servicios → mostrar lista
  if (hasServices) {
    const serviceKeywords = [
      'servicio', 'servicios', 'que ofrecen', 'que hacen', 'catalogo',
      'precios', 'costo', 'cuanto cuesta', 'planes', 'productos',
      'precio', 'catalogo de', 'lista de', 'opciones', 'disponible',
    ];
    if (serviceKeywords.some(s => userLower.includes(normalize(s)))) {
      return { showServices: true };
    }
  }

  // Confirmación de cita detectada en la respuesta del LLM
  if (
    responseLower.includes('confirmada') ||
    responseLower.includes('cita confirmada') ||
    responseLower.includes('agendada') ||
    responseLower.includes('te esperamos')
  ) {
    return { showPostBooking: true };
  }

  return {};
}
