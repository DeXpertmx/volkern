import { z } from 'zod';

// ─── Curso ──────────────────────────────────────────────────

const nivelOptions = ['principiante', 'intermedio', 'avanzado', 'todos'] as const;
const monetizacionOptions = ['one_time', 'suscripcion', 'gratuito'] as const;
const accesoOptions = ['immediate', 'scheduled', 'membresia'] as const;

export const CursoCreateSchema = z.object({
  titulo: z.string().min(1, 'El título es obligatorio'),
  subtitulo: z.string().optional(),
  descripcion: z.string().optional(),
  descripcionLarga: z.string().optional(),
  imagenDestacada: z.string().optional(),
  categoria: z.string().optional(),
  nivel: z.enum(nivelOptions).optional().default('principiante'),
  duracionEstimadaHoras: z.coerce.number().optional(),
  instructorNombre: z.string().optional(),
  instructorBio: z.string().optional(),
  instructorImagen: z.string().optional(),
  instructorFirma: z.string().optional(),
  tipoMonetizacion: z.enum(monetizacionOptions).optional().default('one_time'),
  precio: z.coerce.number().optional().default(0),
  precioSuscripcion: z.coerce.number().optional(),
  moneda: z.string().optional().default('EUR'),
  permiteCupones: z.boolean().optional().default(true),
  tipoAcceso: z.enum(accesoOptions).optional().default('immediate'),
  fechaInicio: z.string().datetime().optional().nullable(),
  diasExpiracion: z.coerce.number().int().optional(),
  nivelMembresia: z.string().optional(),
  publicado: z.boolean().optional().default(false),
  permiteComentarios: z.boolean().optional().default(true),
  permiteCalificaciones: z.boolean().optional().default(true),
  certificadoHabilitado: z.boolean().optional().default(true),
  puntuajeMinimoCertificado: z.coerce.number().optional().default(80),
  urlSlug: z.string().optional(),
  metaDescripcion: z.string().optional(),
  testimonios: z.any().optional(),
  faq: z.any().optional(),
});

export const CursoUpdateSchema = z.object({
  titulo: z.string().min(1).optional(),
  subtitulo: z.string().optional(),
  descripcion: z.string().optional(),
  descripcionLarga: z.string().optional(),
  imagenDestacada: z.string().optional(),
  categoria: z.string().optional(),
  nivel: z.enum(nivelOptions).optional(),
  duracionEstimadaHoras: z.coerce.number().optional(),
  instructorNombre: z.string().optional(),
  instructorBio: z.string().optional(),
  instructorImagen: z.string().optional(),
  instructorFirma: z.string().optional(),
  tipoMonetizacion: z.enum(monetizacionOptions).optional(),
  precio: z.coerce.number().optional(),
  precioSuscripcion: z.coerce.number().optional(),
  moneda: z.string().optional(),
  permiteCupones: z.boolean().optional(),
  tipoAcceso: z.enum(accesoOptions).optional(),
  fechaInicio: z.string().datetime().optional().nullable(),
  diasExpiracion: z.coerce.number().int().optional(),
  nivelMembresia: z.string().optional().nullable(),
  publicado: z.boolean().optional(),
  permiteComentarios: z.boolean().optional(),
  permiteCalificaciones: z.boolean().optional(),
  certificadoHabilitado: z.boolean().optional(),
  puntuajeMinimoCertificado: z.coerce.number().optional(),
  urlSlug: z.string().optional(),
  metaDescripcion: z.string().optional(),
  testimonios: z.any().optional(),
  faq: z.any().optional(),
});

// ─── Módulo ──────────────────────────────────────────────────

export const ModuloCreateSchema = z.object({
  titulo: z.string().min(1, 'El título es obligatorio'),
  descripcion: z.string().optional(),
  orden: z.coerce.number().int().optional(),
});

export const ModuloUpdateSchema = z.object({
  titulo: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  orden: z.coerce.number().int().optional(),
});

// ─── Lección ─────────────────────────────────────────────────

const tipoContenidoOptions = ['video', 'articulo', 'presentacion', 'pdf', 'audio', 'enlace'] as const;
const videoTipoOptions = ['youtube', 'vimeo', 'directo', 'embed'] as const;

export const LeccionCreateSchema = z.object({
  titulo: z.string().min(1, 'El título es obligatorio'),
  descripcion: z.string().optional(),
  contenido: z.string().optional(),
  videoUrl: z.string().optional(),
  videoTipo: z.enum(videoTipoOptions).optional(),
  duracionMinutos: z.coerce.number().optional(),
  materialesUrl: z.string().optional(),
  orden: z.coerce.number().int().optional(),
  tipoContenido: z.enum(tipoContenidoOptions).optional().default('video'),
});

// ─── Quiz ────────────────────────────────────────────────────

const tipoQuizOptions = ['quiz', 'examen', 'encuesta', 'practica'] as const;
const tipoPreguntaOptions = ['multiple_choice', 'true_false', 'open_ended', 'fill_blank'] as const;

const PreguntaSchema = z.object({
  pregunta: z.string().min(1, 'La pregunta es obligatoria'),
  tipoPregunta: z.enum(tipoPreguntaOptions).optional().default('multiple_choice'),
  orden: z.coerce.number().int().optional(),
  puntaje: z.coerce.number().optional().default(1),
  opciones: z.any().optional(),
  explicacion: z.string().optional(),
});

export const QuizCreateSchema = z.object({
  titulo: z.string().min(1, 'El título es obligatorio'),
  descripcion: z.string().optional(),
  tipoQuiz: z.enum(tipoQuizOptions).optional().default('quiz'),
  puntuajeMinimo: z.coerce.number().optional().default(70),
  intentosPermitidos: z.coerce.number().int().optional().default(-1),
  tiempoLimiteMinutos: z.coerce.number().optional(),
  mostrarRespuestas: z.boolean().optional().default(true),
  barajarPreguntas: z.boolean().optional().default(false),
  preguntas: z.array(PreguntaSchema).optional().default([]),
});

// ─── Tarea ───────────────────────────────────────────────────

const tipoEntregaOptions = ['file', 'text', 'url', 'file_text'] as const;

export const TareaCreateSchema = z.object({
  titulo: z.string().min(1, 'El título es obligatorio'),
  descripcion: z.string().optional(),
  instrucciones: z.string().optional(),
  tipoEntrega: z.enum(tipoEntregaOptions).optional().default('file'),
  archivoPermitido: z.string().optional(),
  tamanoMaxMB: z.coerce.number().optional().default(10),
  fechaLimite: z.string().datetime().optional(),
  puntuajeMaximo: z.coerce.number().optional().default(100),
});

// ─── Review ──────────────────────────────────────────────────

export const ReviewCreateSchema = z.object({
  estudianteId: z.string().min(1, 'estudianteId es requerido'),
  calificacion: z.coerce.number().min(0).max(5, 'La calificación debe ser entre 0 y 5'),
  titulo: z.string().optional(),
  comentario: z.string().optional(),
});

// ─── Cupón ───────────────────────────────────────────────────

const tipoDescuentoOptions = ['porcentaje', 'fijo'] as const;

export const CuponCreateSchema = z.object({
  codigo: z.string().min(1, 'El código es obligatorio'),
  descripcion: z.string().optional(),
  tipoDescuento: z.enum(tipoDescuentoOptions).optional().default('porcentaje'),
  valorDescuento: z.coerce.number().min(0, 'El valor debe ser positivo'),
  usosMaximos: z.coerce.number().int().optional().default(-1),
  fechaInicio: z.string().datetime().optional(),
  fechaExpiracion: z.string().datetime().optional(),
  activo: z.boolean().optional().default(true),
});

// ─── Comunidad ───────────────────────────────────────────────

export const ComentarioCreateSchema = z.object({
  comentario: z.string().min(1, 'El comentario es obligatorio'),
  comentarioPadreId: z.string().optional().nullable(),
});

// ─── Inscripción ─────────────────────────────────────────────

const tipoAccesoInscripcionOptions = ['compra', 'suscripcion', 'gratuito', 'cortesia'] as const;

export const InscripcionCreateSchema = z.object({
  estudianteId: z.string().min(1, 'estudianteId es requerido'),
  cursoId: z.string().min(1, 'cursoId es requerido'),
  tipoAcceso: z.enum(tipoAccesoInscripcionOptions).optional().default('compra'),
  montoPagado: z.coerce.number().optional(),
  cuponUsado: z.string().optional(),
  stripePaymentId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
});

export const ProgresoUpdateSchema = z.object({
  leccionId: z.string().min(1, 'leccionId es requerido'),
  completado: z.boolean(),
  tiempoVisto: z.coerce.number().optional(),
});

// ─── Certificado ─────────────────────────────────────────────

export const CertificadoGenerarSchema = z.object({
  estudianteId: z.string().min(1, 'estudianteId es requerido'),
  cursoId: z.string().min(1, 'cursoId es requerido'),
});

// ─── Academy Auth ────────────────────────────────────────────

export const AcademyLoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export const QuizSubmitSchema = z.object({
  quizId: z.string().min(1, 'quizId es requerido'),
  answers: z.any(),
});

// ─── Estudiante ───────────────────────────────────────────────

export const EstudianteCreateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  email: z.string().email('Email inválido'),
  telefono: z.string().optional(),
  primerNombre: z.string().optional(),
  apellidoPaterno: z.string().optional(),
  apellidoMaterno: z.string().optional(),
  pais: z.string().optional(),
  region: z.string().optional(),
  zonaHoraria: z.string().optional(),
  tipoAcceso: z.string().optional().default('free'),
  metodoPagoToken: z.string().optional().nullable(),
  fechaRenovacion: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  consentimientoGDPR: z.boolean().optional().default(false),
  metadataTecnica: z.any().optional(),
});

// ─── Progreso Lección ─────────────────────────────────────────

export const ProgresoLeccionCreateSchema = z.object({
  estudianteId: z.string().min(1, 'estudianteId es requerido'),
  leccionId: z.string().min(1, 'leccionId es requerido'),
  completado: z.coerce.boolean(),
  tiempoVisto: z.coerce.number().optional().default(0),
});

// ─── Ausencia ─────────────────────────────────────────────────

export const AusenciaCreateSchema = z.object({
  titulo: z.string().min(1, 'El título es requerido'),
  fechaInicio: z.string().min(1, 'fechaInicio es requerida'),
  fechaFin: z.string().min(1, 'fechaFin es requerida'),
  razon: z.string().optional(),
  tipo: z.string().optional().default('vacaciones'),
  color: z.string().optional().default('#ef4444'),
}).refine(
  data => new Date(data.fechaFin) >= new Date(data.fechaInicio),
  { message: 'La fecha fin debe ser mayor o igual a la fecha inicio', path: ['fechaFin'] }
);

export const AusenciaUpdateSchema = z.object({
  id: z.string().min(1, 'El ID de la ausencia es requerido'),
  titulo: z.string().optional(),
  fechaInicio: z.string().optional(),
  fechaFin: z.string().optional(),
  razon: z.string().optional(),
  tipo: z.string().optional(),
  color: z.string().optional(),
  activo: z.boolean().optional(),
});

// ─── Data Deletion ────────────────────────────────────────────

export const DataDeletionRequestSchema = z.object({
  platform: z.string().min(1, 'La plataforma es requerida'),
  userEmail: z.string().email('Email inválido'),
  userPhone: z.string().optional(),
  reason: z.string().optional(),
});

// ─── MCP ──────────────────────────────────────────────────────

export const McpToolCallSchema = z.object({
  method: z.string().optional(),
  tool: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  arguments: z.record(z.unknown()).optional(),
  payload: z.record(z.unknown()).optional(),
  params: z.record(z.unknown()).optional(),
  tenantId: z.string().optional(),
  userId: z.string().optional(),
}).passthrough().refine(
  data => data.method || data.tool || data.name,
  { message: 'Se requiere method, tool o name', path: ['method'] }
);

// ─── Lección Update ───────────────────────────────────────────

export const LeccionUpdateSchema = z.object({
  titulo: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  contenido: z.string().optional(),
  videoUrl: z.string().optional(),
  videoTipo: z.enum(videoTipoOptions).optional(),
  duracionMinutos: z.coerce.number().optional(),
  materialesUrl: z.string().optional(),
  orden: z.coerce.number().int().optional(),
  tipoContenido: z.enum(tipoContenidoOptions).optional(),
});

// ─── Lección Comentario ───────────────────────────────────────

export const LeccionComentarioCreateSchema = z.object({
  estudianteId: z.string().min(1, 'estudianteId es requerido'),
  comentario: z.string().min(1, 'El comentario es obligatorio'),
  comentarioPadreId: z.string().optional().nullable(),
});

// ─── Onboarding ───────────────────────────────────────────────

export const OnboardingUpdateSchema = z.object({
  configuracionBasica: z.boolean().optional(),
  primerLead: z.boolean().optional(),
  primerServicio: z.boolean().optional(),
  configuracionCanales: z.boolean().optional(),
  primeraPagina: z.boolean().optional(),
  primeraAutomatizacion: z.boolean().optional(),
  invitacionEquipo: z.boolean().optional(),
  omitido: z.boolean().optional(),
  pasoActual: z.coerce.number().int().optional(),
  packSeleccionado: z.string().optional(),
});

export const OnboardingGenesisSchema = z.object({
  dnaOperativo: z.string().min(1, 'dnaOperativo es requerido'),
  masterKeyHash: z.string().min(1, 'masterKeyHash es requerido'),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  subdomain: z.string().optional(),
});

export const OnboardingQuickSchema = z.object({
  step: z.enum(['provision', 'complete'], { required_error: 'step es requerido (provision o complete)' }),
});

export const OnboardingTelegramSchema = z.object({
  botToken: z.string().min(1, 'El token del bot es requerido'),
  botUsername: z.string().optional(),
});
