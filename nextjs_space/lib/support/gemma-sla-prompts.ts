/**
 * Gemma Support SLA Prompt Templates & Contracts
 * 
 * Este archivo define los contratos de entrada/salida y las plantillas de prompt
 * para que Gemma actúe como el Orquestador de SLAs de Volkern.
 */

export interface GemmaSLARequest {
  tenantId: string;
  eventType: 'SLA_CHECK' | 'SLA_BREACH' | 'RESOLUTION_COILOT' | 'ESCALATE_REQUEST';
  ticketId: string;
  timestamp: string;
  contextSnapshot: {
    ticket: any;
    recentMessages?: any[];
    relevantEntities?: any[];
    timeline?: any[];
    timeRemaining?: string;
    overdueTime?: string;
    threshold?: string;
    lastActivity?: string;
  };
  policy: {
    allowed_actions: string[];
    critical: boolean;
  };
}

export const GEMMA_SLA_SYSTEM_PROMPT = `
You are Gemma, Volkern's operational AI. You analyze tickets and SLAs to ensure operational excellence.
ALWAYS return a STRICT JSON object that matches the requested schema. 
DO NOT include any extra commentary outside the JSON.
`;

export const getGemmaSLAPrompt = (request: GemmaSLARequest) => {
  const { eventType, ticketId, contextSnapshot, tenantId } = request;
  
  // 1. PRE-ALERTA (AT_RISK)
  if (eventType === 'SLA_CHECK') {
    return `
      TENANT_ID: ${tenantId}
      ACTION: ANALYZE_SLA_RISK
      TICKET_ID: ${ticketId}

      CONTEXTO:
      - Prioridad: ${contextSnapshot.ticket.priority}
      - Estado Actual: ${contextSnapshot.ticket.status}
      - Fecha Límite (slaDueAt): ${contextSnapshot.ticket.slaDueAt}
      - Tiempo Restante: ${contextSnapshot.timeRemaining || 'N/A'}
      - Última Actividad: ${contextSnapshot.lastActivity || 'N/A'}

      REGLAS:
      1. Si el tiempo restante es menor al umbral (${contextSnapshot.threshold}), marca la severidad como 'high' o 'critical'.
      2. Justifica el riesgo basándote en la falta de respuesta o la complejidad del hilo de mensajes.
      3. Sugiere acciones como 'asignar_refuerzo' o 'notificar_manager'.

      SALIDA: Strict JSON { suggestionId, type: "SLA_WARNING", message, confidence, evidence: [], suggestedActions: [], severity, category: "SLA" }
    `;
  }

  // 2. INCUMPLIMIENTO (BREACH & ESCALATION)
  if (eventType === 'SLA_BREACH') {
    return `
      TENANT_ID: ${tenantId}
      ACTION: ORCHESTRATE_BREACH_ESCALATION
      TICKET_ID: ${ticketId}

      DATOS FORENSES:
      - slaDueAt: ${contextSnapshot.ticket.slaDueAt}
      - Tiempo de Retraso: ${contextSnapshot.overdueTime || 'N/A'}
      - Asignado a: ${contextSnapshot.ticket.assignedId || 'SIN_ASIGNAR'}
      - Historial Directo: ${JSON.stringify(contextSnapshot.timeline || [])}

      REGLAS DE ESCALADO:
      1. Genera una instrucción de escalado obligatoria si la prioridad es CRITICAL.
      2. Identifica al OWNER del tenant como destino del escalado.
      3. El mensaje debe ser directo y profesional, indicando que la acción quedará sellada criptográficamente.

      SALIDA: Strict JSON { suggestionId, type: "SLA_BREACH", message, confidence, evidence: [], suggestedActions: [], severity, category: "SLA" }
    `;
  }

  // 3. COPILOTO DE RESOLUCIÓN (RECOGNITION)
  if (eventType === 'RESOLUTION_COILOT') {
    return `
      TENANT_ID: ${tenantId}
      TICKET_SUBJECT: ${contextSnapshot.ticket.subject}
      TICKET_DESCRIPTION: ${contextSnapshot.ticket.description}
      LINKED_ENTITY: ${contextSnapshot.ticket.entityType || 'N/A'} ${contextSnapshot.ticket.entityId || 'N/A'}

      TAREA:
      1. Busca patrones en tickets cerrados similares.
      2. Si la entidad es una factura (INVOICE), analiza si hay descuadres comunes.
      3. Propone una solución técnica paso a paso.

      SALIDA: Strict JSON { suggestionId, type: "RESOLUTION_SUGGESTION", message, confidence, evidence: [], suggestedActions: [], severity: "low", category: "KNOWLEDGE_BASE" }
    `;
  }

  return `OBJECT: General Support analysis for ${ticketId}`;
};
