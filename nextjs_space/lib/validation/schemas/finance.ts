import { z } from 'zod';

// ─── Telephony / Zadarma ────────────────────────────────────

export const ZadarmaTestSchema = z.object({
  apiKey: z.string().min(1, 'API Key es requerida'),
  apiSecret: z.string().min(1, 'API Secret es requerido'),
});

export const ZadarmaCallbackSchema = z.object({
  destination: z.string().min(1, 'Destination number is required'),
});

export const TelephonyConfigSchema = z.object({
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  fromExtension: z.string().optional(),
  recordingEnabled: z.boolean().optional().default(true),
  activo: z.boolean().optional().default(true),
});

// ─── Stripe Invoicing ────────────────────────────────────────

export const StripeInvoicingConfigSchema = z.object({
  activo: z.boolean().optional(),
});

// ─── External Invoicing ──────────────────────────────────────
// Los `.describe()` son metadata pura — no cambian la validación pero
// alimentan la spec OpenAPI 3.0 generada por scripts/generate-openapi.mjs
// vía zod-to-json-schema (`openApi3` target). Single source of truth:
// este archivo; Redoc + runtime derivan de aquí.

const InvoiceItemSchema = z.object({
  name: z.string().min(1, 'Nombre del item requerido')
    .describe('Nombre o concepto del item facturado (e.g. "Servicio de consultoría").'),
  quantity: z.coerce.number().min(1, 'Cantidad mínima 1').default(1)
    .describe('Cantidad de unidades (mínimo 1, default 1, acepta string coerced a number).'),
  price: z.coerce.number().min(0.01, 'Precio debe ser positivo')
    .describe('Precio unitario del item (mínimo 0.01, acepta string coerced a number).'),
  taxRate: z.coerce.number().min(0).max(100).default(21)
    .describe('Porcentaje de IVA aplicado a esta línea (0-100, default 21%). Total de línea = quantity * price * (1 + taxRate/100).'),
});

export const ExternalInvoiceCreateSchema = z.object({
  leadId: z.string().optional()
    .describe('CUID del lead existente. Requerido si no se envía contactId (uno de los dos es obligatorio).'),
  contactId: z.string().optional()
    .describe('CUID del contacto existente. Requerido si no se envía leadId (uno de los dos es obligatorio).'),
  amount: z.coerce.number().positive('amount debe ser un número positivo')
    .describe('Importe total de la factura (>0). Acepta string coerced a number (e.g. "750.50" → 750.5). Si envías `items`, se calcula del desglose.'),
  // Sin divisa por defecto: si el cliente no la envía, la factura se emite en la
  // moneda de reporte del tenant.
  currency: z.string().length(3).optional()
    .describe('Código de moneda ISO 4217 (exactamente 3 caracteres). Si se omite, se usa la del tenant.'),
  description: z.string().optional().default('Factura externa')
    .describe('Descripción visible de la factura (default "Factura externa").'),
  items: z.array(InvoiceItemSchema).optional()
    .describe('Desglose opcional con IVA por línea. Si omites, se crea una sola línea con `amount` y `taxRate=21%`.'),
  dueDate: z.string().datetime().optional()
    .describe('Fecha de vencimiento ISO 8601. Si se omite, se calcula automáticamente (e.g. +30 días).'),
}).refine(
  (data) => data.leadId || data.contactId,
  { message: 'leadId o contactId es requerido', path: ['leadId'] }
);

// ─── Expense Verification ────────────────────────────────────

export const VerifyExpenseSchema = z.object({
  expenseId: z.string().min(1, 'expenseId es requerido'),
  action: z.enum(['VALIDATE', 'REJECT'], {
    required_error: 'action es requerido (VALIDATE o REJECT)',
    invalid_type_error: 'action debe ser VALIDATE o REJECT',
  }),
  metadata: z.object({
    comments: z.string().optional(),
    overrideLocation: z.boolean().optional(),
  }).optional(),
});
