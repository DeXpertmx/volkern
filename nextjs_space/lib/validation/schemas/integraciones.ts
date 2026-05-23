import { z } from 'zod';

// ─── Anytimebot ──────────────────────────────────────────────

export const AnytimebotConnectSchema = z.object({
  username: z.string().min(1, 'Username es requerido'),
  apiKey: z.string().min(1, 'API Key es requerida'),
  webhookUrl: z.string().optional(),
});

export type AnytimebotConnectInput = z.infer<typeof AnytimebotConnectSchema>;

// ─── Evolution API ──────────────────────────────────────────

export const EvolutionConnectSchema = z.object({
  instanceName: z.string().min(1, 'instanceName es requerido'),
  apiKey: z.string().min(1, 'API Key es requerida'),
  apiUrl: z.string().url('URL inválida').optional(),
  webhookUrl: z.string().optional(),
  webhookByEvents: z.boolean().optional(),
  events: z.array(z.string()).optional(),
  qrcode: z.boolean().optional().default(true),
});

export type EvolutionConnectInput = z.infer<typeof EvolutionConnectSchema>;

export const EvolutionTestSchema = z.object({
  instanceName: z.string().min(1, 'instanceName es requerido'),
  apiKey: z.string().min(1, 'API Key es requerida'),
  apiUrl: z.string().url('URL inválida').optional().default('https://evolution.volkern.app'),
});

export type EvolutionTestInput = z.infer<typeof EvolutionTestSchema>;

// ─── Update Integración ─────────────────────────────────────

export const IntegracionUpdateSchema = z.object({
  activo: z.boolean().optional(),
  nombre: z.string().optional(),
  credenciales: z.record(z.unknown()).optional(),
  configuracion: z.record(z.unknown()).optional(),
});

export type IntegracionUpdateInput = z.infer<typeof IntegracionUpdateSchema>;

// ─── My WhatsApp ────────────────────────────────────────────

export const MyWhatsappConnectSchema = z.object({
  phoneNumberId: z.string().min(1, 'Phone Number ID es requerido'),
  accessToken: z.string().min(1, 'Access Token es requerido'),
  businessAccountId: z.string().optional(),
  webhookVerifyToken: z.string().optional(),
});

export type MyWhatsappConnectInput = z.infer<typeof MyWhatsappConnectSchema>;

// ─── Plaudern ──────────────────────────────────────────────

export const PlaudernConnectSchema = z.object({
  apiKey: z.string().min(10, 'API Key debe tener al menos 10 caracteres'),
  botId: z.string().optional(),
  integrationId: z.string().optional(),
  activo: z.boolean().optional(),
  webhookSecret: z.string().optional(),
  sincronizarConversaciones: z.boolean().optional(),
  sincronizarMensajes: z.boolean().optional(),
  crearLeadsAutomatico: z.boolean().optional(),
  fuenteLeads: z.string().optional(),
  estadoLeadsNuevos: z.string().optional(),
  asignacionAutomatica: z.boolean().optional(),
  usuarioAsignadoId: z.string().optional(),
  knowledgeBaseActiva: z.boolean().optional(),
});

export type PlaudernConnectInput = z.infer<typeof PlaudernConnectSchema>;

export const PlaudernTestSchema = z.object({
  testType: z.enum(['connection', 'chat']).optional().default('connection'),
  apiKey: z.string().optional(),
  botId: z.string().optional(),
  message: z.string().optional(),
  integrationId: z.string().optional(),
});

export type PlaudernTestInput = z.infer<typeof PlaudernTestSchema>;

// ─── Telegram ───────────────────────────────────────────────

export const TelegramConnectSchema = z.object({
  bot_token: z.string().min(1, 'El token del bot es requerido'),
  bot_username: z.string().optional(),
  webhookUrl: z.string().url('URL inválida').optional(),
});

export type TelegramConnectInput = z.infer<typeof TelegramConnectSchema>;

// ─── Twilio ────────────────────────────────────────────────

export const TwilioConnectSchema = z.object({
  accountSid: z.string().min(1, 'Account SID es requerido'),
  authToken: z.string().min(1, 'Auth Token es requerido'),
  phoneNumber: z.string().optional(),
});

export type TwilioConnectInput = z.infer<typeof TwilioConnectSchema>;

export const TwilioTestSchema = z.object({
  accountSid: z.string().min(1, 'Account SID es requerido'),
  authToken: z.string().min(1, 'Auth Token es requerido'),
});

export type TwilioTestInput = z.infer<typeof TwilioTestSchema>;

export const TwilioTestSendSchema = z.object({
  phoneNumber: z.string().min(1, 'Número de teléfono requerido'),
  testMessage: z.string().optional(),
});

export type TwilioTestSendInput = z.infer<typeof TwilioTestSendSchema>;

// ─── WhatsApp Business API ──────────────────────────────────

export const WhatsappBusinessConnectSchema = z.object({
  phone_number_id: z.string().min(1, 'Phone Number ID es requerido'),
  business_account_id: z.string().min(1, 'Business Account ID es requerido'),
  access_token: z.string().min(1, 'Access Token es requerido'),
  wabaId: z.string().optional(),
  webhookVerifyToken: z.string().optional(),
});

export type WhatsappBusinessConnectInput = z.infer<typeof WhatsappBusinessConnectSchema>;

// ─── WhatsApp Twilio ────────────────────────────────────────

export const WhatsappTwilioConnectSchema = z.object({
  account_sid: z.string().min(1, 'Account SID es requerido'),
  auth_token: z.string().min(1, 'Auth Token es requerido'),
  phone_number: z.string().min(1, 'Número de teléfono es requerido'),
});

export type WhatsappTwilioConnectInput = z.infer<typeof WhatsappTwilioConnectSchema>;

// ─── Test Integración ───────────────────────────────────────

export const IntegracionTestSchema = z.object({
  tipo: z.string().min(1, 'tipo de integración es requerido'),
  credenciales: z.record(z.unknown()).optional(),
  configuracion: z.record(z.unknown()).optional(),
  username: z.string().optional(),
  apiKey: z.string().optional(),
  apiUrl: z.string().optional(),
  phoneNumberId: z.string().optional(),
  accessToken: z.string().optional(),
  accountSid: z.string().optional(),
  authToken: z.string().optional(),
  bot_token: z.string().optional(),
  instanceName: z.string().optional(),
});

export type IntegracionTestInput = z.infer<typeof IntegracionTestSchema>;

// ─── Test Evolution ─────────────────────────────────────────

export const EvolutionTestDiagnosticSchema = z.object({
  action: z.enum(['basic', 'create-test']).optional().default('basic'),
});

export type EvolutionTestDiagnosticInput = z.infer<typeof EvolutionTestDiagnosticSchema>;
