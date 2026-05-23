import { z } from 'zod';

// ─── Messaging Hub ──────────────────────────────────────────

export const MessagingHubConfigSchema = z.object({
  hubApiToken: z.string().optional(),
  webhookSecret: z.string().optional(),
  isActive: z.boolean().optional(),
  channels: z.record(z.unknown()).optional(),
}).passthrough();

export type MessagingHubConfigInput = z.infer<typeof MessagingHubConfigSchema>;

// ─── Notifications ──────────────────────────────────────────

export const NotificationMarkReadSchema = z.object({
  id: z.string().optional(),
  all: z.boolean().optional(),
}).refine(
  data => data.id || data.all,
  { message: 'Se requiere id o all=true' }
);

export type NotificationMarkReadInput = z.infer<typeof NotificationMarkReadSchema>;

// ─── Integraciones ──────────────────────────────────────────

const INTEGRACION_TIPOS = [
  'twilio', 'meta_pixel', 'ga4', 'mailchimp', 'brevo',
  'stripe', 'google_calendar', 'telegram', 'meta',
  'stripe_invoicing', 'square', 'gocardless',
] as const;

// Schemas de credenciales por tipo
const TwilioCredencialesSchema = z.object({
  accountSid: z.string().min(1, 'Twilio requiere accountSid'),
  authToken: z.string().min(1, 'Twilio requiere authToken'),
});

const MetaPixelCredencialesSchema = z.object({
  pixelId: z.string().min(1, 'Meta Pixel requiere pixelId'),
});

const Ga4CredencialesSchema = z.object({
  measurementId: z.string().min(1, 'GA4 requiere measurementId'),
});

const MailchimpCredencialesSchema = z.object({
  apiKey: z.string().min(1, 'Mailchimp requiere apiKey'),
});

const BrevoCredencialesSchema = z.object({
  apiKey: z.string().min(1, 'Brevo requiere apiKey'),
});

const StripeCredencialesSchema = z.object({
  secretKey: z.string().min(1, 'Stripe requiere secretKey'),
});

const GoogleCalendarCredencialesSchema = z.object({
  clientId: z.string().min(1, 'Google Calendar requiere clientId'),
  clientSecret: z.string().min(1, 'Google Calendar requiere clientSecret'),
});

const TelegramCredencialesSchema = z.object({
  bot_token: z.string().min(1, 'Telegram requiere bot_token'),
});

const MetaCredencialesSchema = z.object({
  page_access_token: z.string().min(1, 'Meta requiere page_access_token'),
  page_id: z.string().min(1, 'Meta requiere page_id'),
});

const SquareCredencialesSchema = z.object({
  accessToken: z.string().min(1, 'Square requiere accessToken'),
  locationId: z.string().min(1, 'Square requiere locationId'),
});

const GoCardlessCredencialesSchema = z.object({
  accessToken: z.string().min(1, 'GoCardless requiere accessToken'),
});

// Map tipo → credencial schema
const credencialesSchemas: Record<string, z.ZodTypeAny> = {
  twilio: TwilioCredencialesSchema,
  meta_pixel: MetaPixelCredencialesSchema,
  ga4: Ga4CredencialesSchema,
  mailchimp: MailchimpCredencialesSchema,
  brevo: BrevoCredencialesSchema,
  stripe: StripeCredencialesSchema,
  google_calendar: GoogleCalendarCredencialesSchema,
  telegram: TelegramCredencialesSchema,
  meta: MetaCredencialesSchema,
  square: SquareCredencialesSchema,
  gocardless: GoCardlessCredencialesSchema,
};

export const IntegracionCreateSchema = z.object({
  tipo: z.enum(INTEGRACION_TIPOS),
  nombre: z.string().min(1, 'Nombre es requerido'),
  credenciales: z.record(z.unknown()).optional(),
  configuracion: z.record(z.unknown()).optional(),
  activo: z.boolean().optional(),
}).superRefine((data, ctx) => {
  // Validar credenciales según el tipo (solo si se proporcionan)
  if (data.credenciales && data.tipo !== 'stripe_invoicing') {
    const schema = credencialesSchemas[data.tipo];
    if (schema) {
      const result = schema.safeParse(data.credenciales);
      if (!result.success) {
        result.error.issues.forEach(issue => {
          ctx.addIssue({
            ...issue,
            path: ['credenciales', ...issue.path],
          });
        });
      }
    }
  }
});

export type IntegracionCreateInput = z.infer<typeof IntegracionCreateSchema>;
