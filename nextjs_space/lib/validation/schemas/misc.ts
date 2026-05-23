import { z } from 'zod';

// ─── Agency Branding ─────────────────────────────────────────

export const AgencyBrandingUpdateSchema = z.object({
  logo_url: z.string().optional(),
  primary_color: z.string().optional(),
  show_powered_by: z.boolean().optional(),
  custom_footer_text: z.string().optional(),
});

// ─── Agency Slots ───────────────────────────────────────────

export const AgencySlotCreateSchema = z.object({
  client_name: z.string().min(1, 'Nombre de cliente requerido'),
  admin_email: z.string().email('Email de admin inválido'),
  modules_enabled: z.array(z.string()).optional(),
});

// ─── Canales Telegram ───────────────────────────────────────

export const CanalTelegramUpdateSchema = z.object({
  isActive: z.boolean().optional(),
});

// ─── Canales WhatsApp ───────────────────────────────────────

export const CanalWhatsAppCreateSchema = z.object({
  nombreBandeja: z.string().optional(),
  numeroTelefono: z.string().optional(),
  phoneId: z.string().min(1, 'phoneId es requerido'),
  businessAccountId: z.string().min(1, 'businessAccountId es requerido'),
  accessToken: z.string().min(1, 'accessToken es requerido'),
});

// ─── Canva Create Design ────────────────────────────────────

export const CanvaDesignCreateSchema = z.object({
  designType: z.string().optional().default('SocialMedia'),
  width: z.coerce.number().optional(),
  height: z.coerce.number().optional(),
  title: z.string().optional(),
});

// ─── Canva Export Design ────────────────────────────────────

export const CanvaExportDesignSchema = z.object({
  designId: z.string().min(1, 'designId es requerido'),
  format: z.string().optional().default('png'),
});

// ─── Comunidad Moderación ───────────────────────────────────

export const ComunidadModeracionSchema = z.object({
  aprobado: z.boolean(),
});

// ─── Config Disponibilidad ──────────────────────────────────

export const DisponibilidadConfigSchema = z.object({
  timezone: z.string().optional(),
  horarios: z.array(z.object({
    diaSemana: z.number(),
    activo: z.boolean(),
    bloques: z.array(z.object({
      inicio: z.string(),
      fin: z.string(),
    })).optional(),
  })).optional(),
});

// ─── Cupones Validar ────────────────────────────────────────

export const CuponValidarSchema = z.object({
  codigo: z.string().min(1, 'Código de cupón requerido'),
  cursoId: z.string().min(1, 'cursoId requerido'),
});

// ─── Customer Auth Login ────────────────────────────────────

export const CustomerAuthLoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

// ─── Entrega Calificar ──────────────────────────────────────

export const EntregaCalificarSchema = z.object({
  puntuacion: z.coerce.number().optional(),
  retroalimentacion: z.string().optional(),
});

// ─── ERP HR Config (freeform) ───────────────────────────────

export const ErpHrConfigSchema = z.record(z.unknown());

// ─── ERP Production Asset (freeform) ────────────────────────

export const ErpProductionAssetSchema = z.record(z.unknown());

// ─── Estudiante ─────────────────────────────────────────────

export const EstudianteUpdateSchema = z.object({
  nombre: z.string().optional(),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
  primerNombre: z.string().optional(),
  apellidoPaterno: z.string().optional(),
  apellidoMaterno: z.string().optional(),
  pais: z.string().optional(),
  region: z.string().optional(),
  zonaHoraria: z.string().optional(),
  tipoAcceso: z.string().optional(),
  metodoPagoToken: z.string().optional(),
  fechaRenovacion: z.string().optional(),
  tags: z.any().optional(),
  consentimientoGDPR: z.boolean().optional(),
  metadataTecnica: z.any().optional(),
  metadatosAcademicos: z.any().optional(),
  historialCompletitud: z.any().optional(),
  dispositivosUsados: z.any().optional(),
  interaccionesChatbot: z.any().optional(),
  preferenciasNotificacion: z.any().optional(),
  preferenciasDatos: z.any().optional(),
  registroAccesos: z.any().optional(),
});

export const EstudiantePerfilSchema = z.object({
  primerNombre: z.string().optional(),
  apellidoPaterno: z.string().optional(),
  apellidoMaterno: z.string().optional(),
  telefono: z.string().optional(),
  pais: z.string().optional(),
  region: z.string().optional(),
  zonaHoraria: z.string().optional(),
  preferenciasNotificacion: z.any().optional(),
  consentimientoGDPR: z.boolean().optional(),
});

// ─── Intento Calificar ──────────────────────────────────────

export const IntentoCalificarSchema = z.object({
  respuestas: z.array(z.object({
    preguntaId: z.string(),
    respuesta: z.any(),
  })),
});

// ─── Internal Queue Enqueue ─────────────────────────────────

export const InternalQueueEnqueueSchema = z.object({
  type: z.string().min(1, 'type es requerido'),
  targetId: z.string().min(1, 'targetId es requerido'),
  payload: z.any().optional(),
  priority: z.coerce.number().optional(),
  maxAttempts: z.coerce.number().optional(),
  delayMs: z.coerce.number().optional(),
});

// ─── Mensajes Conversación Update ───────────────────────────

export const ConversacionUpdateSchema = z.object({
  estado: z.string().optional(),
  leadId: z.string().optional().nullable(),
  estudianteId: z.string().optional().nullable(),
});

// ─── Meta Data Deletion ─────────────────────────────────────

export const MetaDataDeletionSchema = z.object({
  signed_request: z.string().min(1, 'signed_request es requerido').optional(),
  platform: z.string().optional(),
});

// ─── Notifications Config ───────────────────────────────────

export const NotificationsConfigSchema = z.object({
  channel: z.string().min(1, 'channel es requerido'),
  config: z.any(),
});

// ─── Notifications Send ─────────────────────────────────────

export const NotificationsSendSchema = z.object({
  title: z.string().min(1, 'title es requerido'),
  body: z.string().min(1, 'body es requerido'),
  channel: z.string().min(1, 'channel es requerido'),
  priority: z.string().optional(),
  scheduledFor: z.string().optional(),
  metadata: z.any().optional(),
  recipients: z.array(z.any()).min(1, 'Al menos un destinatario requerido'),
});

// ─── Plaudern Bots ──────────────────────────────────────────

export const PlaudernBotCreateSchema = z.object({
  tempAuth: z.literal(true).optional(),
  apiKey: z.string().optional(),
  integrationId: z.string().optional(),
  name: z.string().optional(),
  personality: z.string().optional(),
  greetingMessage: z.string().optional(),
  description: z.string().optional(),
  settings: z.any().optional(),
});

export const PlaudernBotUpdateSchema = z.object({
  name: z.string().optional(),
  personality: z.string().optional(),
  greetingMessage: z.string().optional(),
});

// ─── Portal Claim ───────────────────────────────────────────

export const PortalClaimSchema = z.object({
  token: z.string().min(1, 'Token requerido'),
  category: z.string().min(1, 'Categoría requerida'),
  title: z.string().min(1, 'Título requerido'),
  description: z.string().min(1, 'Descripción requerida'),
  evidenceUrl: z.string().optional(),
});

// ─── Portal Verify ──────────────────────────────────────────

export const PortalVerifySchema = z.object({
  type: z.string().min(1, 'type requerido'),
  id: z.string().min(1, 'id requerido'),
  hash: z.string().min(1, 'hash requerido'),
});

// ─── Progreso Lección ───────────────────────────────────────

export const ProgresoLeccionSchema = z.object({
  completada: z.boolean(),
});

// ─── Public AI Generator ────────────────────────────────────

export const PublicAiGeneratorSchema = z.object({
  prompt: z.string().min(1, 'Prompt requerido'),
  style: z.string().optional(),
});

// ─── Public Citas ───────────────────────────────────────────

export const PublicCitaCreateSchema = z.object({
  leadId: z.string().optional(),
  servicioId: z.string().optional(),
  fechaHora: z.string().min(1, 'fechaHora requerida'),
  titulo: z.string().optional(),
  tipo: z.string().optional(),
  notas: z.string().optional(),
  usuarioAsignadoId: z.string().optional(),
  leadData: z.object({
    email: z.string().email().optional(),
    nombre: z.string().optional(),
    telefono: z.string().optional(),
    empresa: z.string().optional(),
  }).optional(),
});

// ─── Public Leads ───────────────────────────────────────────

export const PublicLeadCreateSchema = z.object({
  email: z.string().email('Email inválido'),
  name: z.string().optional(),
  empresa: z.string().optional(),
  rol: z.string().optional(),
  necesidad: z.string().optional(),
  fuente: z.string().optional(),
});

// ─── Quizzes ────────────────────────────────────────────────

export const QuizIntentoCreateSchema = z.object({
  respuestas: z.record(z.any()),
  tiempoTomadoMinutos: z.coerce.number().optional(),
});

export const QuizUpdateSchema = z.object({
  titulo: z.string().optional(),
  descripcion: z.string().optional(),
  tipoQuiz: z.string().optional(),
  puntuajeMinimo: z.coerce.number().optional(),
  intentosPermitidos: z.coerce.number().optional(),
  tiempoLimiteMinutos: z.coerce.number().optional(),
  preguntas: z.array(z.any()).optional(),
});

// ─── Rate Limits Status ─────────────────────────────────────

export const RateLimitActionSchema = z.object({
  action: z.string().optional(),
  resetAll: z.boolean().optional(),
});

// ─── RBAC Authorize ─────────────────────────────────────────

export const RbacAuthorizeSchema = z.object({
  permission: z.string().optional(),
  module: z.string().optional(),
  roleId: z.string().optional(),
});

// ─── Skills Execute (generic tool execution) ────────────────

export const ToolExecuteSchema = z.object({
  tool: z.string().optional(),
  action: z.string().optional(),
  arguments: z.record(z.unknown()).optional(),
  args: z.record(z.unknown()).optional(),
});

// ─── Support Tickets ────────────────────────────────────────

export const SupportTicketCreateSchema = z.object({
  subject: z.string().min(1, 'Asunto requerido'),
  description: z.string().min(1, 'Descripción requerida'),
  priority: z.string().optional(),
  source: z.string().optional(),
  channelId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

export const SupportTicketUpdateSchema = z.object({
  status: z.string().optional(),
  assignedId: z.string().optional(),
  note: z.string().optional(),
});

export const SupportTicketEscalateSchema = z.object({
  note: z.string().min(1, 'Nota de escalado requerida'),
});

// ─── Tareas Entregas ────────────────────────────────────────

export const TareaEntregaSchema = z.object({
  estudianteId: z.string().min(1, 'estudianteId requerido'),
  contenido: z.string().optional(),
  archivoUrl: z.string().optional(),
  enlaceUrl: z.string().optional(),
});

// ─── Tasks ──────────────────────────────────────────────────

export const TaskUpdateSchema = z.object({
  completada: z.boolean().optional(),
  titulo: z.string().optional(),
  descripcion: z.string().optional().nullable(),
  tipo: z.string().optional(),
  fechaVencimiento: z.string().optional().nullable(),
  asignadoA: z.string().optional().nullable(),
});

// ─── Test Telegram Notification ─────────────────────────────

export const TelegramNotificationTestSchema = z.object({
  tenantId: z.string().min(1, 'tenantId requerido'),
  message: z.string().optional(),
});

// ─── Trials Status ──────────────────────────────────────────

export const TrialActionSchema = z.object({
  action: z.enum(['start', 'convert', 'extend', 'cancel', 'expire', 'markActivation']),
  diasTrial: z.coerce.number().optional(),
  plan: z.string().optional(),
  days: z.coerce.number().optional(),
});

// ─── Upload Catalogo Presigned ──────────────────────────────

export const UploadPresignedSchema = z.object({
  fileName: z.string().min(1, 'fileName requerido'),
  fileType: z.string().min(1, 'fileType requerido'),
});

// ─── V1 Sovereignty Audit Logs ──────────────────────────────

export const SovereigntyAuditLogSchema = z.object({
  level: z.string().optional(),
  message: z.string().min(1, 'Mensaje requerido'),
  category: z.string().optional(),
  metadata: z.any().optional(),
});

// ─── V1 Sovereignty Batch Sign ──────────────────────────────

export const SovereigntyBatchSignSchema = z.object({
  category: z.string().optional(),
});

// ─── V1 User Layout ─────────────────────────────────────────

export const UserLayoutSchema = z.object({
  layout: z.any().refine(val => val != null, 'Layout no proporcionado'),
});

// ─── Volkern Proxy ──────────────────────────────────────────

export const VolkernProxySchema = z.record(z.unknown());
