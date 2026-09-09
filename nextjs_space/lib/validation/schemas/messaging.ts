import { z } from 'zod';
import { CAMPAIGN_CHANNEL_IDS } from '@/lib/campaign-channels';

// ─── Image Generation ────────────────────────────────────────

const aspectRatioOptions = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;

export const ImageGenerateSchema = z.object({
  prompt: z.string().min(1, 'El prompt es requerido'),
  aspectRatio: z.enum(aspectRatioOptions).optional().default('1:1'),
});

// ─── Send Message ────────────────────────────────────────────

// Los canales soportados viven en el catálogo compartido lib/campaign-channels.ts
// (fuente única de verdad: UI de campañas + validación server + motor de envío).
const canalOptions = CAMPAIGN_CHANNEL_IDS;
const mediaTypeOptions = ['image', 'video', 'document'] as const;

export const DestinatarioSchema = z.object({
  nombre: z.string().min(1, 'El nombre del destinatario es requerido'),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
});

export const MensajeEnviarSchema = z.object({
  conversationId: z.string().optional(),
  contenido: z.string().min(1, 'El contenido del mensaje es requerido'),
  canal: z.enum(canalOptions, { message: 'Canal no soportado' }),
  destinatario: DestinatarioSchema.optional(),
  asunto: z.string().optional(),
  templateId: z.string().optional(),
  variables: z.record(z.string()).optional(),
  mediaUrl: z.string().optional(),
  mediaType: z.enum(mediaTypeOptions).optional(),
});

// ─── Message Templates ────────────────────────────────────────

export const MessageTemplateCreateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  canal: z.string().min(1, 'El canal es requerido'),
  contenido: z.string().min(1, 'El contenido es requerido'),
  asunto: z.string().optional(),
  variables: z.any().optional(),
  categoria: z.string().optional(),
  activo: z.boolean().optional().default(true),
});

export const MessageTemplateUpdateSchema = z.object({
  nombre: z.string().optional(),
  canal: z.string().optional(),
  asunto: z.string().optional(),
  contenido: z.string().optional(),
  variables: z.any().optional(),
  categoria: z.string().optional(),
  activo: z.boolean().optional(),
});

// ─── Send via Anytimebot ──────────────────────────────────────

const anytimebotMessageTypeOptions = ['text', 'template'] as const;

export const AnytimebotSendSchema = z.object({
  conversationId: z.string().optional(),
  leadId: z.string().optional(),
  to: z.string().min(1, 'El destinatario es requerido'),
  message: z.string().min(1, 'El mensaje es requerido'),
  messageType: z.enum(anytimebotMessageTypeOptions).optional().default('text'),
});

// ─── Summarize / Suggest Reply ────────────────────────────────

export const ConversationIdSchema = z.object({
  conversationId: z.string().min(1, 'ID de conversación requerido'),
});

// ─── Conversations ────────────────────────────────────────────

export const ConversacionCreateSchema = z.object({
  contactoNombre: z.string().min(1, 'El nombre de contacto es requerido'),
  contactoEmail: z.string().email().optional().nullable(),
  contactoTelefono: z.string().optional().nullable(),
  canal: z.string().min(1, 'El canal es requerido'),
  leadId: z.string().optional().nullable(),
  estudianteId: z.string().optional().nullable(),
});

// ─── Chatbot Config ───────────────────────────────────────────

export const ChatbotConfigSchema = z.object({
  activo: z.boolean().optional(),
  nombreAsistente: z.string().optional(),
  mensajeBienvenida: z.string().optional().nullable(),
  mensajeFueraHorario: z.string().optional().nullable(),
  personalidad: z.string().optional().nullable(),
  contextoNegocio: z.string().optional().nullable(),
  horarioInicio: z.coerce.number().int().min(0).max(23).optional(),
  horarioFin: z.coerce.number().int().min(0).max(23).optional(),
  diasActivos: z.string().optional(),
  timezone: z.string().optional(),
  horariosPersonalizados: z.any().optional().nullable(),
  puedeAgendarCitas: z.boolean().optional(),
  puedeMostrarServicios: z.boolean().optional(),
  puedeTransferirHumano: z.boolean().optional(),
  maxMensajesPorConversacion: z.coerce.number().int().optional(),
  tiempoEsperaTransferencia: z.coerce.number().int().optional(),
});

// ─── Chatbot Test Message ─────────────────────────────────────

const ChatMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

export const ChatbotTestMessageSchema = z.object({
  message: z.string().min(1, 'Mensaje requerido'),
  conversationHistory: z.array(ChatMessageSchema).optional().default([]),
});

// ─── Chatbot Widget ───────────────────────────────────────────

export const ChatbotWidgetMessageSchema = z.object({
  message: z.string().min(1, 'Mensaje requerido'),
  sessionId: z.string().optional(),
  conversationHistory: z.array(ChatMessageSchema).optional().default([]),
});

// ─── Connect Messages ─────────────────────────────────────────

export const ConnectMessageSendSchema = z.object({
  channelId: z.string().min(1, 'channelId es obligatorio'),
  content: z.string().min(1, 'El contenido es requerido'),
  isSystemMessage: z.boolean().optional(),
  attributions: z.any().optional(),
});

// ─── Connect Channels ─────────────────────────────────────────

export const ConnectChannelCreateSchema = z.object({
  name: z.string().min(1, 'El nombre del canal es obligatorio'),
  type: z.string().optional().default('public'),
  userIds: z.array(z.string()).optional(),
});

// ─── Connect Channel Subscription ─────────────────────────────

export const ConnectSubscriptionUpdateSchema = z.object({
  isPinned: z.boolean().optional(),
  markAsRead: z.boolean().optional(),
});
