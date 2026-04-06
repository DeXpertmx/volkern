/**
 * Volkern Integrations Module
 * Capa de integración centralizada
 * 
 * Exporta todo lo necesario para manejar integraciones externas
 */

export {
  handleIncomingWebhook,
  validateWebhookSignature,
  listIntegrations,
  getIntegrationDocs,
  type IntegrationType,
  type WebhookPayload,
  type WebhookResult,
  type IntegrationConfig,
} from './integration-handler';

/**
 * Documentación de uso:
 * 
 * ## Endpoint Genérico
 * POST /api/integrations/webhook?type=n8n&event=workflow.completed&tenantId=xxx
 * Body: { ...datos del webhook }
 * 
 * ## Endpoints Específicos
 * POST /api/integrations/webhook/n8n
 * POST /api/integrations/webhook/chatwoot
 * 
 * ## Integraciones Soportadas
 * - n8n: workflow.completed, workflow.failed, lead.enriched
 * - chatwoot: conversation.created, message.created, contact.created
 * - calcom: booking.created, booking.cancelled, booking.rescheduled
 * - evolution: message.received, connection.update
 * - whatsapp: message
 * - telegram: message
 * - generic: lead.create, contact.create, booking.create, task.create
 * 
 * ## Seguridad
 * Usar header X-Webhook-Signature con HMAC-SHA256 del body
 * El secret se configura en la integración del tenant
 */
