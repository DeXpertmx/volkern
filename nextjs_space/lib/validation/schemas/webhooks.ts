import { z } from 'zod';

// ─── Incoming Webhooks ────────────────────────────────────────

export const IncomingWebhookCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  descripcion: z.string().optional(),
  accion: z.enum([
    'crear_lead',
    'actualizar_lead',
    'crear_tarea',
    'disparar_automatizacion',
    'webhook_personalizado',
  ], { errorMap: () => ({ message: 'Acción no válida' }) }),
  mapeoNombre: z.string().optional(),
  mapeoEmail: z.string().optional(),
  mapeoTelefono: z.string().optional(),
  mapeoEmpresa: z.string().optional(),
  mapeoNotas: z.string().optional(),
  mapeoCustom: z.record(z.unknown()).optional(),
  automationId: z.string().optional(),
  generarSecret: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.accion === 'disparar_automatizacion' && !data.automationId) {
      return false;
    }
    return true;
  },
  { message: 'Se requiere seleccionar una automatización', path: ['automationId'] }
);

export const IncomingWebhookUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  activo: z.boolean().optional(),
  accion: z.enum([
    'crear_lead',
    'actualizar_lead',
    'crear_tarea',
    'disparar_automatizacion',
    'webhook_personalizado',
  ]).optional(),
  mapeoNombre: z.string().optional(),
  mapeoEmail: z.string().optional(),
  mapeoTelefono: z.string().optional(),
  mapeoEmpresa: z.string().optional(),
  mapeoNotas: z.string().optional(),
  mapeoCustom: z.record(z.unknown()).optional(),
  automationId: z.string().nullable().optional(),
  regenerarSecret: z.boolean().optional(),
});

// ─── Outgoing Webhooks ────────────────────────────────────────

export const OutgoingWebhookCreateSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  descripcion: z.string().optional(),
  url: z.string().url('URL inválida'),
  eventos: z.array(z.string()).min(1, 'Al menos un evento requerido'),
  metodoHttp: z.enum(['POST', 'PUT', 'PATCH', 'GET', 'DELETE']).optional().default('POST'),
  headers: z.record(z.string()).nullable().optional(),
  generarSecret: z.boolean().optional(),
  maxReintentos: z.number().int().min(0).max(10).optional().default(3),
  timeoutSegundos: z.number().int().min(1).max(300).optional().default(30),
});

export const OutgoingWebhookUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  url: z.string().url('URL inválida').optional(),
  activo: z.boolean().optional(),
  eventos: z.array(z.string()).min(1).optional(),
  metodoHttp: z.enum(['POST', 'PUT', 'PATCH', 'GET', 'DELETE']).optional(),
  headers: z.record(z.string()).nullable().optional(),
  regenerarSecret: z.boolean().optional(),
  maxReintentos: z.number().int().min(0).max(10).optional(),
  timeoutSegundos: z.number().int().min(1).max(300).optional(),
});

// ─── Billing Webhook ──────────────────────────────────────────

export const BillingWebhookSchema = z.object({
  event: z.enum(['payment_failed', 'payment_succeeded', 'subscription_cancelled', 'subscription_created']),
  subscriptionId: z.string().min(1),
  error: z.string().optional(),
});

// ─── Fiscal Inbound Invoice Webhook ───────────────────────────

export const InboundInvoiceWebhookSchema = z.object({
  tenantId: z.string().min(1, 'tenantId requerido'),
  format: z.string().optional().default('volkern_json'),
  data: z.record(z.unknown(), { required_error: 'data es requerido' }),
});

// ─── Signature Webhook ────────────────────────────────────────

export const SignatureWebhookSchema = z.object({
  event: z.string().min(1),
  documentId: z.string().optional(),
  signerId: z.string().optional(),
  status: z.string().optional(),
  signedAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
}).passthrough(); // Allow additional fields from external signature service
