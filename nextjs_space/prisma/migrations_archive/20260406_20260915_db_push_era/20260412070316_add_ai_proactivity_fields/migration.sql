-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "fechaAceptacion" TIMESTAMP(3),
    "fechaInvitacion" TIMESTAMP(3),
    "invitadoPor" TEXT,
    "roleId" TEXT,
    "telefono" TEXT,
    "tenantId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "tokenInvitacion" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "bookingBio" TEXT,
    "bookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bookingSlug" TEXT,
    "bookingTitle" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "UserWhatsAppInstance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "qrCode" TEXT,
    "qrCodeExpiry" TIMESTAMP(3),
    "profileName" TEXT,
    "profilePicUrl" TEXT,
    "totalMensajes" INTEGER NOT NULL DEFAULT 0,
    "ultimoMensaje" TIMESTAMP(3),
    "fechaConexion" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWhatsAppInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'basico',
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "configuracion" JSONB,
    "limites" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3),
    "billingEmail" TEXT,
    "dominio" TEXT,
    "fechaTrialFin" TIMESTAMP(3),
    "fechaTrialInicio" TIMESTAMP(3),
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "mrr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stripeCustomerId" TEXT,
    "nexusEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dbUrl" TEXT,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "configuracionBasica" BOOLEAN NOT NULL DEFAULT false,
    "primerLead" BOOLEAN NOT NULL DEFAULT false,
    "primerServicio" BOOLEAN NOT NULL DEFAULT false,
    "configuracionCanales" BOOLEAN NOT NULL DEFAULT false,
    "primeraAutomatizacion" BOOLEAN NOT NULL DEFAULT false,
    "invitacionEquipo" BOOLEAN NOT NULL DEFAULT false,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "omitido" BOOLEAN NOT NULL DEFAULT false,
    "pasoActual" INTEGER NOT NULL DEFAULT 0,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCompletado" TIMESTAMP(3),
    "ultimaActualizacion" TIMESTAMP(3) NOT NULL,
    "primeraPagina" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "permisos" JSONB NOT NULL,
    "esPersonalizado" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cambiosAntes" JSONB,
    "cambiosDespues" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "notas" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'nuevo',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "asignadoA" TEXT,
    "tiempoEnEstado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,
    "cargo" TEXT,
    "empresa" TEXT,
    "fuente" TEXT,
    "linkedin" TEXT,
    "metadataExterna" JSONB,
    "ubicacion" TEXT,
    "fechaUltimaActividad" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoreValue" INTEGER NOT NULL DEFAULT 0,
    "aiStrategy" TEXT,
    "riskLevel" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT,
    "convertedAt" TIMESTAMP(3),
    "convertedToContactId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "contextoProyecto" TEXT,
    "fechaPrimeraVista" TIMESTAMP(3),
    "tokenPublico" TEXT,
    "ultimaVista" TIMESTAMP(3),
    "vecesVista" INTEGER NOT NULL DEFAULT 0,
    "chatwootAccountId" INTEGER,
    "externalContactRef" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_field_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "placeholder" TEXT,
    "valorDefecto" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_attachments" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "nombre" TEXT NOT NULL,
    "tipoArchivo" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "cloud_storage_path" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaSubida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'person',
    "companyId" TEXT,
    "cargo" TEXT,
    "ubicacion" TEXT,
    "linkedin" TEXT,
    "notas" TEXT,
    "tags" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servicio" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "duracionMinutos" INTEGER NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'EUR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,
    "modalidad" TEXT NOT NULL DEFAULT 'presencial',
    "catalogoItemId" TEXT,

    CONSTRAINT "Servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cita" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "servicioId" TEXT,
    "fechaHora" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "montoPagado" DOUBLE PRECISION,
    "stripePaymentId" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,
    "descripcion" TEXT,
    "duracion" INTEGER NOT NULL DEFAULT 60,
    "titulo" TEXT,
    "linkReunion" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'reunion',
    "ubicacion" TEXT,
    "googleCalendarEventId" TEXT,
    "emailConfirmacionEnviado" BOOLEAN NOT NULL DEFAULT false,
    "fechaEmailConfirmacion" TIMESTAMP(3),
    "hashDatosEmail" TEXT,
    "recordatorio24hEnviado" BOOLEAN NOT NULL DEFAULT false,
    "recordatorio1hEnviado" BOOLEAN NOT NULL DEFAULT false,
    "origenCita" TEXT NOT NULL DEFAULT 'volkern',
    "catalogoItemId" TEXT,
    "usuarioAsignadoId" TEXT,

    CONSTRAINT "Cita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "trigger" TEXT NOT NULL,
    "flowData" JSONB NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "estadisticas" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "tenantId" TEXT,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationExecution" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ejecutando',
    "contextData" JSONB,
    "errorMessage" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFin" TIMESTAMP(3),
    "currentNodeId" TEXT,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationExecutionLog" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "data" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalWorkflowId" TEXT,
    "externalStatus" TEXT,
    "externalResponse" JSONB,
    "duration" INTEGER,

    CONSTRAINT "AutomationExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledAutomationTask" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "executionId" TEXT,
    "nodeId" TEXT NOT NULL,
    "contextData" JSONB NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEjecucion" TIMESTAMP(3),

    CONSTRAINT "ScheduledAutomationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "n8n_workflows" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "n8nWorkflowId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "trigger" TEXT NOT NULL,
    "configPayload" JSONB,
    "webhookUrl" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimaEjecucion" TIMESTAMP(3),
    "totalEjecuciones" INTEGER NOT NULL DEFAULT 0,
    "ejecucionesExitosas" INTEGER NOT NULL DEFAULT 0,
    "ejecucionesFallidas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "n8n_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationTemplate" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "icono" TEXT,
    "color" TEXT,
    "flowData" JSONB NOT NULL,
    "trigger" TEXT NOT NULL,
    "tags" TEXT[],
    "popularidad" INTEGER NOT NULL DEFAULT 0,
    "esOficial" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "n8nTemplateId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiredConfig" JSONB,
    "defaultPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_workflows" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "n8nWorkflowId" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "customConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastExecutedAt" TIMESTAMP(3),
    "totalExecutions" INTEGER NOT NULL DEFAULT 0,
    "successfulExecutions" INTEGER NOT NULL DEFAULT 0,
    "failedExecutions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estudiante" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "primerNombre" TEXT,
    "apellidoPaterno" TEXT,
    "apellidoMaterno" TEXT,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "pais" TEXT,
    "region" TEXT,
    "zonaHoraria" TEXT,
    "metadatosAcademicos" JSONB,
    "historialCompletitud" JSONB,
    "tipoAcceso" TEXT NOT NULL DEFAULT 'free',
    "metodoPagoToken" TEXT,
    "historialTransacciones" JSONB,
    "fechaRenovacion" TIMESTAMP(3),
    "cuponesAplicados" JSONB,
    "ultimoAcceso" TIMESTAMP(3),
    "dispositivosUsados" JSONB,
    "interaccionesChatbot" JSONB,
    "preferenciasNotificacion" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consentimientoGDPR" BOOLEAN NOT NULL DEFAULT false,
    "fechaConsentimiento" TIMESTAMP(3),
    "fechaAceptacionTerminos" TIMESTAMP(3),
    "preferenciasDatos" JSONB,
    "registroAccesos" JSONB,
    "metadataTecnica" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "Estudiante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curso" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moneda" TEXT NOT NULL DEFAULT 'EUR',
    "duracionEstimadaHoras" INTEGER,
    "nivel" TEXT NOT NULL DEFAULT 'principiante',
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,
    "categoria" TEXT,
    "certificadoHabilitado" BOOLEAN NOT NULL DEFAULT true,
    "descripcionLarga" TEXT,
    "diasExpiracion" INTEGER,
    "faq" JSONB,
    "fechaInicio" TIMESTAMP(3),
    "imagenDestacada" TEXT,
    "instructorBio" TEXT,
    "instructorFirma" TEXT,
    "instructorImagen" TEXT,
    "instructorNombre" TEXT,
    "metaDescripcion" TEXT,
    "nivelMembresia" TEXT,
    "permiteCalificaciones" BOOLEAN NOT NULL DEFAULT true,
    "permiteComentarios" BOOLEAN NOT NULL DEFAULT true,
    "permiteCupones" BOOLEAN NOT NULL DEFAULT true,
    "precioSuscripcion" DOUBLE PRECISION,
    "puntuajeMinimoCertificado" INTEGER NOT NULL DEFAULT 80,
    "subtitulo" TEXT,
    "testimonios" JSONB,
    "tipoAcceso" TEXT NOT NULL DEFAULT 'immediate',
    "tipoMonetizacion" TEXT NOT NULL DEFAULT 'one_time',
    "urlSlug" TEXT,
    "catalogoItemId" TEXT,
    "comunidadActiva" BOOLEAN NOT NULL DEFAULT false,
    "gamificacionActiva" BOOLEAN NOT NULL DEFAULT false,
    "puntosPorLeccion" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "Curso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modulo" (
    "id" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "orden" INTEGER NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "diasDespues" INTEGER,
    "fechaLanzamiento" TIMESTAMP(3),
    "moduloPrevioId" TEXT,
    "tipoDrip" TEXT NOT NULL DEFAULT 'none',

    CONSTRAINT "Modulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leccion" (
    "id" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "contenido" TEXT,
    "videoUrl" TEXT,
    "duracionMinutos" INTEGER,
    "materialesUrl" JSONB,
    "orden" INTEGER NOT NULL,
    "tipoContenido" TEXT NOT NULL DEFAULT 'video',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "diasDespues" INTEGER,
    "fechaLanzamiento" TIMESTAMP(3),
    "leccionPreviaId" TEXT,
    "pdfUrl" TEXT,
    "permitirDescarga" BOOLEAN NOT NULL DEFAULT true,
    "quizId" TEXT,
    "tareaId" TEXT,
    "tipoDrip" TEXT NOT NULL DEFAULT 'none',
    "transcripcion" TEXT,
    "videoTipo" TEXT,

    CONSTRAINT "Leccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inscripcion" (
    "id" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,
    "fechaInscripcion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaExpiracion" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "montoPagado" DOUBLE PRECISION,
    "stripePaymentId" TEXT,
    "progresoPorcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fechaUltimoAcceso" TIMESTAMP(3),
    "certificadoGenerado" BOOLEAN NOT NULL DEFAULT false,
    "cuponUsado" TEXT,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCompletado" TIMESTAMP(3),
    "leccionesCompletadas" INTEGER NOT NULL DEFAULT 0,
    "puntuacionFinal" DOUBLE PRECISION,
    "stripeSubscriptionId" TEXT,
    "tipoAcceso" TEXT NOT NULL DEFAULT 'compra',
    "totalLecciones" INTEGER NOT NULL DEFAULT 0,
    "ultimaLeccionId" TEXT,
    "insigniasGanadas" TEXT[],
    "puntosObtenidos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Inscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgresoLeccion" (
    "id" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "leccionId" TEXT NOT NULL,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "tiempoVisto" INTEGER NOT NULL DEFAULT 0,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCompletado" TIMESTAMP(3),

    CONSTRAINT "ProgresoLeccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificado" (
    "id" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,
    "codigoUnico" TEXT NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfUrl" TEXT,

    CONSTRAINT "Certificado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipoQuiz" TEXT NOT NULL DEFAULT 'quiz',
    "puntuajeMinimo" INTEGER NOT NULL DEFAULT 70,
    "intentosPermitidos" INTEGER NOT NULL DEFAULT -1,
    "tiempoLimiteMinutos" INTEGER,
    "mostrarRespuestas" BOOLEAN NOT NULL DEFAULT true,
    "barajarPreguntas" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pregunta" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "pregunta" TEXT NOT NULL,
    "tipoPregunta" TEXT NOT NULL DEFAULT 'multiple_choice',
    "orden" INTEGER NOT NULL,
    "puntaje" INTEGER NOT NULL DEFAULT 1,
    "opciones" JSONB,
    "explicacion" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pregunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentoQuiz" (
    "id" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "numeroIntento" INTEGER NOT NULL DEFAULT 1,
    "puntuacionObtenida" DOUBLE PRECISION NOT NULL,
    "puntuacionMaxima" DOUBLE PRECISION NOT NULL,
    "porcentaje" DOUBLE PRECISION NOT NULL,
    "aprobado" BOOLEAN NOT NULL,
    "tiempoTomadoMinutos" INTEGER,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCompletado" TIMESTAMP(3),

    CONSTRAINT "IntentoQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespuestaEstudiante" (
    "id" TEXT NOT NULL,
    "intentoId" TEXT NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "esCorrecta" BOOLEAN NOT NULL,
    "puntajeObtenido" DOUBLE PRECISION NOT NULL,
    "fechaRespuesta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespuestaEstudiante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tarea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "instrucciones" TEXT,
    "tipoEntrega" TEXT NOT NULL DEFAULT 'file',
    "archivoPermitido" TEXT,
    "tamanoMaxMB" INTEGER NOT NULL DEFAULT 10,
    "fechaLimite" TIMESTAMP(3),
    "puntuajeMaximo" INTEGER NOT NULL DEFAULT 100,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tarea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntregaTarea" (
    "id" TEXT NOT NULL,
    "tareaId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "contenido" TEXT,
    "archivoUrl" TEXT,
    "enlaceUrl" TEXT,
    "fechaEntrega" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "puntuacion" DOUBLE PRECISION,
    "retroalimentacion" TEXT,
    "calificadoPor" TEXT,
    "fechaCalificacion" TIMESTAMP(3),
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntregaTarea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,
    "estudianteId" TEXT NOT NULL,
    "calificacion" INTEGER NOT NULL,
    "titulo" TEXT,
    "comentario" TEXT,
    "aprobado" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comentario" (
    "id" TEXT NOT NULL,
    "leccionId" TEXT,
    "cursoId" TEXT,
    "estudianteId" TEXT NOT NULL,
    "comentario" TEXT NOT NULL,
    "comentarioPadreId" TEXT,
    "aprobado" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "votosPositivos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Comentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cupon" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "cursoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipoDescuento" TEXT NOT NULL DEFAULT 'porcentaje',
    "valorDescuento" DOUBLE PRECISION NOT NULL,
    "usosMaximos" INTEGER NOT NULL DEFAULT -1,
    "usosActuales" INTEGER NOT NULL DEFAULT 0,
    "fechaInicio" TIMESTAMP(3),
    "fechaExpiracion" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "imagenUrl" TEXT,
    "precio" DOUBLE PRECISION NOT NULL,
    "precioOriginal" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleCurso" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BundleCurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "contactoNombre" TEXT NOT NULL,
    "contactoEmail" TEXT,
    "contactoTelefono" TEXT,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierta',
    "leadId" TEXT,
    "estudianteId" TEXT,
    "ultimoMensaje" TEXT,
    "fechaUltimoMensaje" TIMESTAMP(3),
    "noLeidos" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,
    "chatwootAccountId" INTEGER,
    "chatwootInboxId" INTEGER,
    "externalRef" TEXT,
    "hubMetadata" JSONB,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'enviado',
    "errorMensaje" TEXT,
    "metadatos" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatwootMessageId" INTEGER,
    "externalRef" TEXT,
    "hubMetadata" JSONB,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "asunto" TEXT,
    "contenido" TEXT NOT NULL,
    "variables" JSONB,
    "categoria" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelConfiguration" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "configuracion" JSONB NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScore" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "puntuacion" INTEGER NOT NULL DEFAULT 0,
    "categoria" TEXT,
    "ultimaActualizacion" TIMESTAMP(3) NOT NULL,
    "puntuacionDemografica" INTEGER NOT NULL DEFAULT 0,
    "puntuacionComportamiento" INTEGER NOT NULL DEFAULT 0,
    "puntuacionInteraccion" INTEGER NOT NULL DEFAULT 0,
    "puntuacionEngagement" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LeadScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreHistory" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "puntuacionAnterior" INTEGER NOT NULL,
    "puntuacionNueva" INTEGER NOT NULL,
    "cambio" INTEGER NOT NULL,
    "razon" TEXT NOT NULL,
    "categoria" TEXT,
    "detalles" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringRule" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "puntos" INTEGER NOT NULL,
    "condiciones" JSONB,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreCategory" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "descripcion" TEXT,
    "puntuacionMin" INTEGER NOT NULL,
    "puntuacionMax" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "icono" TEXT,
    "orden" INTEGER NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'manual',
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "canales" TEXT[],
    "targetType" TEXT NOT NULL DEFAULT 'todos',
    "targetConfig" JSONB,
    "fechaProgramada" TIMESTAMP(3),
    "frecuencia" TEXT,
    "fechaFin" TIMESTAMP(3),
    "totalDestinatarios" INTEGER NOT NULL DEFAULT 0,
    "totalEnviados" INTEGER NOT NULL DEFAULT 0,
    "totalEntregados" INTEGER NOT NULL DEFAULT 0,
    "totalAbiertos" INTEGER NOT NULL DEFAULT 0,
    "totalClicks" INTEGER NOT NULL DEFAULT 0,
    "totalConversiones" INTEGER NOT NULL DEFAULT 0,
    "totalErrores" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "fechaInicio" TIMESTAMP(3),
    "fechaCompletado" TIMESTAMP(3),
    "tenantId" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMessage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "asunto" TEXT,
    "contenido" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "plantillaId" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "delayMinutos" INTEGER,
    "variante" TEXT,
    "porcentajeTrafico" DOUBLE PRECISION,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignExecution" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "destinatarioTipo" TEXT NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "destinatarioNombre" TEXT NOT NULL,
    "destinatarioEmail" TEXT,
    "destinatarioTelefono" TEXT,
    "canal" TEXT NOT NULL,
    "variante" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "errorMensaje" TEXT,
    "fechaEnviado" TIMESTAMP(3),
    "fechaEntregado" TIMESTAMP(3),
    "fechaAbierto" TIMESTAMP(3),
    "fechaClick" TIMESTAMP(3),
    "fechaConversion" TIMESTAMP(3),
    "metadatos" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMetrics" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canal" TEXT,
    "variante" TEXT,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "entregados" INTEGER NOT NULL DEFAULT 0,
    "abiertos" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversiones" INTEGER NOT NULL DEFAULT 0,
    "errores" INTEGER NOT NULL DEFAULT 0,
    "tasaEntrega" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tasaApertura" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tasaClick" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tasaConversion" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "CampaignMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "asignadoA" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCompletado" TIMESTAMP(3),
    "tenantId" TEXT,
    "googleTaskId" TEXT,
    "googleTaskListId" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "resultado" TEXT,
    "creadoPor" TEXT,
    "metadatos" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "creadoPor" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whitelabel_config" (
    "id" TEXT NOT NULL,
    "nombreEmpresa" TEXT NOT NULL DEFAULT 'Volkern CRM',
    "logoUrl" TEXT,
    "iconoUrl" TEXT,
    "colorPrimario" TEXT NOT NULL DEFAULT '#3b82f6',
    "colorSecundario" TEXT NOT NULL DEFAULT '#8b5cf6',
    "colorAcento" TEXT NOT NULL DEFAULT '#10b981',
    "emailRemitente" TEXT,
    "nombreRemitente" TEXT,
    "dominio" TEXT,
    "eslogan" TEXT,
    "descripcion" TEXT,
    "urlFacebook" TEXT,
    "urlInstagram" TEXT,
    "urlTwitter" TEXT,
    "urlLinkedIn" TEXT,
    "urlWebsite" TEXT,
    "metadatos" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whitelabel_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descripcion" TEXT,
    "contenido" JSONB NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'landing',
    "plantillaId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'draft',
    "metaTitulo" TEXT,
    "metaDescripcion" TEXT,
    "metaImagen" TEXT,
    "metaKeywords" TEXT,
    "configuracionBranding" JSONB,
    "cssPersonalizado" TEXT,
    "configuracionResponsive" JSONB,
    "vistas" INTEGER NOT NULL DEFAULT 0,
    "conversiones" INTEGER NOT NULL DEFAULT 0,
    "publicadoEn" TIMESTAMP(3),
    "subdomain" TEXT,
    "dominioPersonalizado" TEXT,
    "formularioLeadId" TEXT,
    "servicioId" TEXT,
    "cursoId" TEXT,
    "creadoPor" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,
    "scriptsBody" TEXT,
    "scriptsHead" TEXT,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_templates" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" TEXT NOT NULL,
    "imagenPreview" TEXT,
    "contenido" JSONB NOT NULL,
    "configuracionDefecto" JSONB,
    "esPublica" BOOLEAN NOT NULL DEFAULT true,
    "ordenamiento" INTEGER NOT NULL DEFAULT 0,
    "etiquetas" TEXT[],
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_components" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" TEXT NOT NULL,
    "contenido" JSONB NOT NULL,
    "imagenPreview" TEXT,
    "creadoPor" TEXT,
    "esPublico" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_publishing" (
    "id" TEXT NOT NULL,
    "paginaId" TEXT NOT NULL,
    "subdominio" TEXT,
    "subdomainActivo" BOOLEAN NOT NULL DEFAULT false,
    "dominioPersonalizado" TEXT,
    "dominioVerificado" BOOLEAN NOT NULL DEFAULT false,
    "dnsConfiguracion" JSONB,
    "codigoEmbed" TEXT,
    "embedActivo" BOOLEAN NOT NULL DEFAULT false,
    "sslActivo" BOOLEAN NOT NULL DEFAULT false,
    "certificadoSSL" TEXT,
    "googleAnalyticsId" TEXT,
    "facebookPixelId" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_publishing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "slug" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "intervalo" TEXT NOT NULL DEFAULT 'mensual',
    "precioSetup" DOUBLE PRECISION,
    "limiteUsuarios" INTEGER NOT NULL DEFAULT 5,
    "limiteLeads" INTEGER NOT NULL DEFAULT 1000,
    "limiteCursos" INTEGER NOT NULL DEFAULT 10,
    "limiteEstudiantes" INTEGER NOT NULL DEFAULT 100,
    "limiteStorage" INTEGER NOT NULL DEFAULT 10,
    "whatsappHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "emailHabilitado" BOOLEAN NOT NULL DEFAULT true,
    "smsHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "telegramHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "facebookHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "instagramHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "lmsHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "automationsHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "campaignsHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "whitelabelHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "dominioPersonalizadoHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "apiAccessHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "features" JSONB,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "esPublico" BOOLEAN NOT NULL DEFAULT true,
    "esPopular" BOOLEAN NOT NULL DEFAULT false,
    "ordenamiento" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "montoPagado" DOUBLE PRECISION,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaRenovacion" TIMESTAMP(3),
    "fechaCancelacion" TIMESTAMP(3),
    "fechaVencimiento" TIMESTAMP(3),
    "esTrial" BOOLEAN NOT NULL DEFAULT false,
    "diasTrialRestantes" INTEGER,
    "descuentoAplicado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "codigoDescuento" TEXT,
    "metadata" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_features" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "habilitado" BOOLEAN NOT NULL DEFAULT true,
    "limitePersonalizado" INTEGER,
    "configuracion" JSONB,
    "habilitadoPor" TEXT,
    "razon" TEXT,
    "fechaExpiracion" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "stripePublicKey" TEXT,
    "stripePriceKey" TEXT,
    "twilioAccountSid" TEXT,
    "twilioAuthToken" TEXT,
    "dialog360ApiKey" TEXT,
    "resendApiKey" TEXT,
    "defaultUserLimit" INTEGER NOT NULL DEFAULT 5,
    "defaultLeadLimit" INTEGER NOT NULL DEFAULT 1000,
    "defaultStorageLimit" INTEGER NOT NULL DEFAULT 10,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "signupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "trialDaysDefault" INTEGER NOT NULL DEFAULT 14,
    "emailFrom" TEXT NOT NULL DEFAULT 'noreply@volkern.app',
    "emailReplyTo" TEXT,
    "globalCompanyName" TEXT DEFAULT 'Volkern AI',
    "globalPrimaryColor" TEXT DEFAULT '#4F46E5',
    "configuracion" JSONB,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "conectado" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "credenciales" JSONB NOT NULL,
    "configuracion" JSONB,
    "ultimaSincronizacion" TIMESTAMP(3),
    "errorUltimaSincronizacion" TEXT,
    "estadisticas" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar_integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimaSync" TIMESTAMP(3),
    "totalCitasSincronizadas" INTEGER NOT NULL DEFAULT 0,
    "errorUltimaSync" TEXT,
    "channelId" TEXT,
    "resourceId" TEXT,
    "channelExpiration" TIMESTAMP(3),
    "syncToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "google_calendar_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT,
    "direccion" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "headers" JSONB,
    "payload" JSON NOT NULL,
    "statusCode" INTEGER,
    "respuesta" JSON,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "intentos" INTEGER NOT NULL DEFAULT 1,
    "errorMensaje" TEXT,
    "procesadoEn" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incoming_webhooks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "accion" TEXT NOT NULL DEFAULT 'crear_lead',
    "config" JSON,
    "mapeoNombre" TEXT,
    "mapeoEmail" TEXT,
    "mapeoTelefono" TEXT,
    "mapeoEmpresa" TEXT,
    "mapeoNotas" TEXT,
    "mapeoCustom" JSON,
    "automationId" TEXT,
    "secretKey" TEXT,
    "totalRecibidos" INTEGER NOT NULL DEFAULT 0,
    "ultimoRecibido" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incoming_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incoming_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metodo" TEXT NOT NULL DEFAULT 'POST',
    "headers" JSON,
    "payload" JSON NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'exitoso',
    "errorMensaje" TEXT,
    "leadCreado" TEXT,
    "tareaCreada" TEXT,
    "automationRun" TEXT,
    "fechaRecepcion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incoming_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "criterios" JSON NOT NULL,
    "fuente" TEXT NOT NULL DEFAULT 'hunter',
    "autoActualizar" BOOLEAN NOT NULL DEFAULT false,
    "ultimaActualizacion" TIMESTAMP(3),
    "frecuenciaActualizar" TEXT DEFAULT 'diaria',
    "totalResultados" INTEGER NOT NULL DEFAULT 0,
    "nuevosDesdeUltimaActualizacion" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_lead_searches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "criterios" JSON NOT NULL,
    "fuente" TEXT NOT NULL,
    "totalResultados" INTEGER NOT NULL DEFAULT 0,
    "resultados" JSON NOT NULL,
    "leadsImportados" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_lead_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "etapa" TEXT NOT NULL,
    "probabilidad" INTEGER NOT NULL DEFAULT 25,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEstimadaCierre" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "razonPerdida" TEXT,
    "competidor" TEXT,
    "campanaId" TEXT,
    "descuento" DOUBLE PRECISION,
    "diasEnPipeline" INTEGER NOT NULL DEFAULT 0,
    "fechaUltimaActividad" TIMESTAMP(3),
    "notasInternas" TEXT,
    "numeroActividades" INTEGER NOT NULL DEFAULT 0,
    "origen" TEXT,
    "prioridad" TEXT NOT NULL DEFAULT 'media',
    "tags" TEXT,
    "usuarioAsignadoId" TEXT,
    "valorReal" DOUBLE PRECISION,
    "companyId" TEXT,
    "contactId" TEXT,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'info',
    "link" TEXT,
    "leido" BOOLEAN NOT NULL DEFAULT false,
    "archivado" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSON,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaLeido" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_leads" (
    "id" TEXT NOT NULL,
    "campanaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "emailAbierto" BOOLEAN NOT NULL DEFAULT false,
    "emailClicado" BOOLEAN NOT NULL DEFAULT false,
    "respondio" BOOLEAN NOT NULL DEFAULT false,
    "fechaAgregado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaUltimoEmail" TIMESTAMP(3),
    "fechaAperturaEmail" TIMESTAMP(3),
    "fechaClickEmail" TIMESTAMP(3),
    "fechaRespuesta" TIMESTAMP(3),

    CONSTRAINT "campaign_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "orden" INTEGER NOT NULL,
    "probabilidad" INTEGER NOT NULL DEFAULT 50,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "requiereAprobacion" BOOLEAN NOT NULL DEFAULT false,
    "esEtapaFinal" BOOLEAN NOT NULL DEFAULT false,
    "tipoEtapaFinal" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_activities" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT,
    "descripcion" TEXT,
    "resultado" TEXT,
    "duracion" INTEGER,
    "metadata" JSON,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActividad" TIMESTAMP(3),

    CONSTRAINT "deal_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_attachments" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "nombre" TEXT NOT NULL,
    "tipoArchivo" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "cloud_storage_path" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" TEXT,
    "fechaSubida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT,
    "leadId" TEXT,
    "numero" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "descuentoPorcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "descuentoMonto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impuestos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "validezDias" INTEGER NOT NULL DEFAULT 30,
    "terminosPago" TEXT,
    "notasInternas" TEXT,
    "notasCliente" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEnvio" TIMESTAMP(3),
    "fechaAceptacion" TIMESTAMP(3),
    "fechaVencimiento" TIMESTAMP(3),
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "firmadoPorCliente" BOOLEAN NOT NULL DEFAULT false,
    "fechaFirma" TIMESTAMP(3),
    "ipFirma" TEXT,
    "clienteEmail" TEXT,
    "clienteEmpresa" TEXT,
    "clienteNombre" TEXT,
    "clienteTelefono" TEXT,
    "creadoPorId" TEXT,
    "fechaPrimeraVista" TIMESTAMP(3),
    "tokenPublico" TEXT,
    "ultimaVista" TIMESTAMP(3),
    "vecesVista" INTEGER NOT NULL DEFAULT 0,
    "emisorId" TEXT,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_items" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "precioUnitario" DOUBLE PRECISION NOT NULL,
    "descuento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impuestos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "orden" INTEGER NOT NULL,
    "categoria" TEXT,
    "sku" TEXT,
    "aplicaRetencion" BOOLEAN NOT NULL DEFAULT false,
    "montoImpuesto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montoRetencion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "porcentajeImpuesto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "porcentajeRetencion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tasaImpuestoId" TEXT,
    "catalogoItemId" TEXT,

    CONSTRAINT "cotizacion_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT,
    "leadId" TEXT,
    "cotizacionId" TEXT,
    "numero" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'servicio',
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "descuentoPorcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "descuentoMonto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impuestos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "metodoPago" TEXT,
    "condicionesPago" TEXT,
    "frecuenciaPago" TEXT,
    "diaPago" INTEGER,
    "clausulas" TEXT,
    "templateData" JSON,
    "notasInternas" TEXT,
    "notasCliente" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEnvio" TIMESTAMP(3),
    "fechaFirmaCliente" TIMESTAMP(3),
    "fechaFirmaEmpresa" TIMESTAMP(3),
    "fechaInicio" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "firmadoPorCliente" BOOLEAN NOT NULL DEFAULT false,
    "nombreFirmaCliente" TEXT,
    "ipFirmaCliente" TEXT,
    "firmadoPorEmpresa" BOOLEAN NOT NULL DEFAULT false,
    "firmadoPorUserId" TEXT,
    "nombreFirmaEmpresa" TEXT,
    "tokenPublico" TEXT,
    "fechaPrimeraVista" TIMESTAMP(3),
    "vecesVista" INTEGER NOT NULL DEFAULT 0,
    "ultimaVista" TIMESTAMP(3),
    "clienteNombre" TEXT,
    "clienteEmail" TEXT,
    "clienteTelefono" TEXT,
    "clienteEmpresa" TEXT,
    "clienteRfc" TEXT,
    "clienteDireccion" TEXT,
    "creadoPorId" TEXT,
    "emisorId" TEXT,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato_items" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "precioUnitario" DOUBLE PRECISION NOT NULL,
    "descuento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impuestos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "orden" INTEGER NOT NULL,
    "categoria" TEXT,
    "sku" TEXT,
    "aplicaRetencion" BOOLEAN NOT NULL DEFAULT false,
    "montoImpuesto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montoRetencion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "porcentajeImpuesto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "porcentajeRetencion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tasaImpuestoId" TEXT,
    "catalogoItemId" TEXT,

    CONSTRAINT "contrato_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato_pagos" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "metodoPago" TEXT,
    "referencia" TEXT,
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "fechaPago" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,

    CONSTRAINT "contrato_pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comisiones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "porcentaje" DOUBLE PRECISION,
    "montoFijo" DOUBLE PRECISION,
    "montoCalculado" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "metodoCalculo" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaAprobacion" TIMESTAMP(3),
    "fechaPago" TIMESTAMP(3),
    "referenciaPago" TEXT,
    "notasPago" TEXT,

    CONSTRAINT "comisiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metas_venta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" TEXT NOT NULL,
    "metrica" TEXT NOT NULL,
    "valorObjetivo" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "periodo" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "valorActual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "porcentajeCompletado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metas_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "remitente" TEXT NOT NULL,
    "remitenteEmail" TEXT NOT NULL,
    "responderA" TEXT,
    "contenidoHTML" TEXT NOT NULL,
    "contenidoTexto" TEXT,
    "plantillaId" TEXT,
    "audienciaId" TEXT,
    "filtrosJSON" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "tipoProgramacion" TEXT NOT NULL DEFAULT 'inmediato',
    "fechaEnvio" TIMESTAMP(3),
    "totalDestinatarios" INTEGER NOT NULL DEFAULT 0,
    "totalEnviados" INTEGER NOT NULL DEFAULT 0,
    "totalFallidos" INTEGER NOT NULL DEFAULT 0,
    "totalPendientes" INTEGER NOT NULL DEFAULT 0,
    "esABTest" BOOLEAN NOT NULL DEFAULT false,
    "varianteA" TEXT,
    "varianteB" TEXT,
    "porcentajeA" DOUBLE PRECISION DEFAULT 50,
    "creadoPor" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "costoTotal" DOUBLE PRECISION,
    "fechaFinAB" TIMESTAMP(3),
    "ganadorAB" TEXT,
    "objetivoConversion" TEXT,
    "roiCalculado" DOUBLE PRECISION,
    "totalAbiertos" INTEGER NOT NULL DEFAULT 0,
    "totalClics" INTEGER NOT NULL DEFAULT 0,
    "totalConversiones" INTEGER NOT NULL DEFAULT 0,
    "valorConversion" DOUBLE PRECISION,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" TEXT NOT NULL DEFAULT 'general',
    "asuntoPorDefecto" TEXT NOT NULL,
    "contenidoHTML" TEXT NOT NULL,
    "contenidoJSON" JSON,
    "contenidoTexto" TEXT,
    "variablesDisponibles" TEXT,
    "esOficial" BOOLEAN NOT NULL DEFAULT false,
    "vecesUtilizada" INTEGER NOT NULL DEFAULT 0,
    "creadoPor" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campanaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailDestinatario" TEXT NOT NULL,
    "nombreDestinatario" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "errorMensaje" TEXT,
    "fechaProgramada" TIMESTAMP(3),
    "fechaEnviado" TIMESTAMP(3),
    "abierto" BOOLEAN NOT NULL DEFAULT false,
    "fechaApertura" TIMESTAMP(3),
    "clicado" BOOLEAN NOT NULL DEFAULT false,
    "fechaClic" TIMESTAMP(3),
    "metadataJSON" TEXT,
    "convertido" BOOLEAN NOT NULL DEFAULT false,
    "fechaConversion" TIMESTAMP(3),
    "numeroClics" INTEGER NOT NULL DEFAULT 0,
    "valorConversion" DOUBLE PRECISION,
    "varianteAsignada" TEXT,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_test_results" (
    "id" TEXT NOT NULL,
    "campanaId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "varianteA_enviados" INTEGER NOT NULL DEFAULT 0,
    "varianteA_abiertos" INTEGER NOT NULL DEFAULT 0,
    "varianteA_clics" INTEGER NOT NULL DEFAULT 0,
    "varianteA_conversiones" INTEGER NOT NULL DEFAULT 0,
    "varianteA_tasaApertura" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "varianteA_tasaClic" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "varianteA_tasaConversion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "varianteB_enviados" INTEGER NOT NULL DEFAULT 0,
    "varianteB_abiertos" INTEGER NOT NULL DEFAULT 0,
    "varianteB_clics" INTEGER NOT NULL DEFAULT 0,
    "varianteB_conversiones" INTEGER NOT NULL DEFAULT 0,
    "varianteB_tasaApertura" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "varianteB_tasaClic" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "varianteB_tasaConversion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "significanciaEstadistica" BOOLEAN NOT NULL DEFAULT false,
    "nivelConfianza" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ganador" TEXT,
    "mejoraPorcentaje" DOUBLE PRECISION,
    "recomendacion" TEXT,
    "fechaCalculo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ab_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audiences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "filtrosJSON" TEXT NOT NULL,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "ultimaActualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "esEstatica" BOOLEAN NOT NULL DEFAULT false,
    "creadoPor" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unsubscribe_list" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "leadId" TEXT,
    "motivo" TEXT,
    "comentario" TEXT,
    "campanaId" TEXT,
    "tokenReactivacion" TEXT,
    "fechaBaja" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unsubscribe_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anytimebot_integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "sincronizarLeads" BOOLEAN NOT NULL DEFAULT true,
    "sincronizarCitas" BOOLEAN NOT NULL DEFAULT true,
    "fuenteLeads" TEXT NOT NULL DEFAULT 'Anytimebot Chatbot',
    "estadoLeadsNuevos" TEXT NOT NULL DEFAULT 'nuevo',
    "asignacionAutomatica" BOOLEAN NOT NULL DEFAULT false,
    "usuarioAsignadoId" TEXT,
    "whatsappIntegrado" BOOLEAN NOT NULL DEFAULT false,
    "numeroWhatsApp" TEXT,
    "totalLeadsCapturados" INTEGER NOT NULL DEFAULT 0,
    "totalCitasSincronizadas" INTEGER NOT NULL DEFAULT 0,
    "ultimaSincronizacion" TIMESTAMP(3),
    "configuracion" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "sincronizarMensajes" BOOLEAN NOT NULL DEFAULT true,
    "totalMensajesSincronizados" INTEGER NOT NULL DEFAULT 0,
    "webhookSecret" TEXT,

    CONSTRAINT "anytimebot_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outgoing_webhooks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "url" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "eventos" JSON NOT NULL,
    "metodoHttp" TEXT NOT NULL DEFAULT 'POST',
    "headers" JSON,
    "secretKey" TEXT,
    "maxReintentos" INTEGER NOT NULL DEFAULT 3,
    "timeoutSegundos" INTEGER NOT NULL DEFAULT 30,
    "totalEnviados" INTEGER NOT NULL DEFAULT 0,
    "totalExitosos" INTEGER NOT NULL DEFAULT 0,
    "totalFallidos" INTEGER NOT NULL DEFAULT 0,
    "ultimoEnvio" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outgoing_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outgoing_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "payload" JSON NOT NULL,
    "headers" JSON NOT NULL,
    "estadoHttp" INTEGER,
    "respuesta" JSON,
    "tiempoRespuesta" INTEGER,
    "estado" TEXT NOT NULL,
    "errorMensaje" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 1,
    "entidadTipo" TEXT,
    "entidadId" TEXT,
    "fechaEnvio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoIntento" TIMESTAMP(3),
    "proximoIntento" TIMESTAMP(3),

    CONSTRAINT "outgoing_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_cards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "puesto" TEXT,
    "empresa" TEXT,
    "email" TEXT,
    "sitioWeb" TEXT,
    "redesSociales" JSONB DEFAULT '{}',
    "template" TEXT NOT NULL DEFAULT 'modern',
    "colorPrimario" TEXT NOT NULL DEFAULT '#3B82F6',
    "colorSecundario" TEXT NOT NULL DEFAULT '#1E40AF',
    "logoUrl" TEXT,
    "fotoPerfilUrl" TEXT,
    "urlUnica" TEXT NOT NULL,
    "qrCodeData" TEXT,
    "totalVistas" INTEGER NOT NULL DEFAULT 0,
    "totalCompartidos" INTEGER NOT NULL DEFAULT 0,
    "totalEscaneos" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,
    "telefonoMovil" TEXT,
    "telefonoOficina" TEXT,
    "whatsapp" TEXT,
    "telegram" TEXT,
    "direccion" TEXT,
    "backgroundPattern" TEXT NOT NULL DEFAULT 'none',
    "bannerUrl" TEXT,
    "colorFondo" TEXT NOT NULL DEFAULT '#FFFFFF',
    "colorTexto" TEXT NOT NULL DEFAULT '#1F2937',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "layoutStyle" TEXT NOT NULL DEFAULT 'standard',

    CONSTRAINT "digital_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scanned_cards" (
    "id" TEXT NOT NULL,
    "digitalCardId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "imagenUrl" TEXT NOT NULL,
    "datosExtraidos" JSONB NOT NULL,
    "nombreExtraido" TEXT,
    "empresaExtraida" TEXT,
    "puestoExtraido" TEXT,
    "telefonoExtraido" TEXT,
    "emailExtraido" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'procesando',
    "errorMensaje" TEXT,
    "fechaEscaneo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanned_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plaudern_integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "botId" TEXT,
    "botName" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "webhookSecret" TEXT,
    "sincronizarConversaciones" BOOLEAN NOT NULL DEFAULT true,
    "sincronizarMensajes" BOOLEAN NOT NULL DEFAULT true,
    "crearLeadsAutomatico" BOOLEAN NOT NULL DEFAULT true,
    "fuenteLeads" TEXT NOT NULL DEFAULT 'Plaudern Chatbot',
    "estadoLeadsNuevos" TEXT NOT NULL DEFAULT 'nuevo',
    "asignacionAutomatica" BOOLEAN NOT NULL DEFAULT false,
    "usuarioAsignadoId" TEXT,
    "knowledgeBaseActiva" BOOLEAN NOT NULL DEFAULT false,
    "knowledgeBaseDocumentos" INTEGER NOT NULL DEFAULT 0,
    "totalMensajesSincronizados" INTEGER NOT NULL DEFAULT 0,
    "totalConversaciones" INTEGER NOT NULL DEFAULT 0,
    "ultimaSincronizacion" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,
    "botsDesactivados" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "plaudern_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "expiraEn" TIMESTAMP(3),
    "ultimoUso" TIMESTAMP(3),
    "totalUsos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasas_impuesto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pais" TEXT NOT NULL,
    "estado" TEXT,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "porcentaje" DOUBLE PRECISION NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'iva',
    "aplicaRetencion" BOOLEAN NOT NULL DEFAULT false,
    "porcentajeRetencion" DOUBLE PRECISION,
    "inversionSujetoPasivo" BOOLEAN NOT NULL DEFAULT false,
    "descripcionRegla" TEXT,
    "fechaInicioVigencia" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFinVigencia" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasas_impuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "sku" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'servicio',
    "precioBase" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'EUR',
    "categoriaFiscal" TEXT NOT NULL DEFAULT 'general',
    "tasaImpuestoId" TEXT,
    "duracionMinutos" INTEGER,
    "modalidad" TEXT,
    "unidad" TEXT NOT NULL DEFAULT 'unidad',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "destacado" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "customFieldValues" JSONB,
    "categorias" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "media" JSONB,
    "pricing" JSONB,

    CONSTRAINT "catalogo_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo_field_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "categoria" TEXT,
    "placeholder" TEXT,
    "unidad" TEXT,
    "valorDefecto" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogo_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_fiscal_emisor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "nombreComercial" TEXT,
    "pais" TEXT NOT NULL,
    "tipoIdFiscal" TEXT NOT NULL,
    "idFiscal" TEXT NOT NULL,
    "regimenFiscal" TEXT,
    "direccion" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "estadoProvincia" TEXT,
    "codigoPostal" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT NOT NULL,
    "sitioWeb" TEXT,
    "monedaPredeterminada" TEXT NOT NULL DEFAULT 'EUR',
    "serieFactura" TEXT NOT NULL DEFAULT 'F',
    "siguienteNumero" INTEGER NOT NULL DEFAULT 1,
    "logoUrl" TEXT,
    "colorPrimario" TEXT DEFAULT '#1a56db',
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_fiscal_emisor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_fiscal_cliente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "contactId" TEXT,
    "razonSocial" TEXT,
    "pais" TEXT NOT NULL,
    "tipoIdFiscal" TEXT NOT NULL,
    "idFiscal" TEXT NOT NULL,
    "regimenFiscal" TEXT,
    "idIntracomunitario" TEXT,
    "direccionFiscal" TEXT,
    "ciudadFiscal" TEXT,
    "estadoFiscal" TEXT,
    "codigoPostalFiscal" TEXT,
    "exentoImpuestos" BOOLEAN NOT NULL DEFAULT false,
    "motivoExencion" TEXT,
    "aplicaRetencion" BOOLEAN NOT NULL DEFAULT false,
    "idFiscalValidado" BOOLEAN NOT NULL DEFAULT false,
    "fechaValidacion" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfil_fiscal_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_venta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "leadId" TEXT,
    "contactId" TEXT,
    "contratoId" TEXT,
    "cotizacionId" TEXT,
    "dealId" TEXT,
    "emisorId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "fechaOrden" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEntrega" TIMESTAMP(3),
    "fechaFacturacion" TIMESTAMP(3),
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "descuentoGlobal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tipoDescuento" TEXT NOT NULL DEFAULT 'porcentaje',
    "totalImpuestos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRetenciones" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moneda" TEXT NOT NULL DEFAULT 'EUR',
    "redondeoLinea" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "notasInternas" TEXT,
    "condicionesVenta" TEXT,
    "referenciaCliente" TEXT,
    "creadoPorId" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT,

    CONSTRAINT "ordenes_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_venta_items" (
    "id" TEXT NOT NULL,
    "ordenVentaId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unidad" TEXT NOT NULL DEFAULT 'unidad',
    "precioUnitario" DOUBLE PRECISION NOT NULL,
    "descuento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tasaImpuestoId" TEXT,
    "porcentajeImpuesto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montoImpuesto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aplicaRetencion" BOOLEAN NOT NULL DEFAULT false,
    "porcentajeRetencion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montoRetencion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "catalogoItemId" TEXT,

    CONSTRAINT "orden_venta_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "nombreAsistente" TEXT NOT NULL DEFAULT 'Asistente Virtual',
    "mensajeBienvenida" TEXT,
    "mensajeFueraHorario" TEXT,
    "personalidad" TEXT,
    "contextoNegocio" TEXT,
    "horarioInicio" INTEGER NOT NULL DEFAULT 9,
    "horarioFin" INTEGER NOT NULL DEFAULT 18,
    "diasActivos" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "puedeAgendarCitas" BOOLEAN NOT NULL DEFAULT true,
    "puedeMostrarServicios" BOOLEAN NOT NULL DEFAULT true,
    "puedeTransferirHumano" BOOLEAN NOT NULL DEFAULT true,
    "maxMensajesPorConversacion" INTEGER NOT NULL DEFAULT 50,
    "tiempoEsperaTransferencia" INTEGER NOT NULL DEFAULT 300,
    "totalConversaciones" INTEGER NOT NULL DEFAULT 0,
    "totalCitasAgendadas" INTEGER NOT NULL DEFAULT 0,
    "totalTransferencias" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,
    "horariosPersonalizados" JSONB,

    CONSTRAINT "ChatbotConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_hub_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastHealthCheck" TIMESTAMP(3),
    "hubBaseUrl" TEXT NOT NULL DEFAULT 'https://volkern.dimension.expert',
    "hubApiToken" TEXT NOT NULL,
    "hubAccountId" TEXT,
    "defaultEndpointId" TEXT,
    "webhookSecret" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "configVersion" TEXT NOT NULL DEFAULT '2.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "autoProvisioned" BOOLEAN NOT NULL DEFAULT false,
    "chatwootAccountId" INTEGER,
    "lastSyncAt" TIMESTAMP(3),
    "provisionedAt" TIMESTAMP(3),
    "telegramInboxId" INTEGER,
    "whatsappInboxId" INTEGER,

    CONSTRAINT "messaging_hub_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "chatwootInboxId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_domains" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "namecraneId" TEXT,
    "diskLimit" INTEGER,
    "userLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_email_accounts" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "password" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "smartermailId" TEXT,
    "diskUsed" INTEGER NOT NULL DEFAULT 0,
    "diskQuota" INTEGER NOT NULL DEFAULT 1024,
    "imapEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smtpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "result" JSONB,
    "correlationId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipientEmail" TEXT,
    "recipientPhone" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "externalId" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_app_notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "data" JSONB,
    "actionUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "contactId" TEXT,
    "ordenVentaId" TEXT,
    "externalId" TEXT,
    "provider" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'EUR',
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "urlPdf" TEXT,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMP(3),
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_signature_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'libresign',
    "url" TEXT NOT NULL,
    "apiTokenEncrypted" TEXT NOT NULL,
    "webhookSecretEncrypted" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_signature_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "libreSignUuid" TEXT NOT NULL,
    "contratoId" TEXT,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "signers" JSONB NOT NULL,
    "documentHash" TEXT,
    "documentUrl" TEXT,
    "auditTrailUrl" TEXT,
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_audit_events" (
    "id" TEXT NOT NULL,
    "signatureRequestId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signerEmail" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,
    "eventHash" TEXT,
    "prevEventHash" TEXT,

    CONSTRAINT "signature_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrls" TEXT[],
    "platforms" TEXT[],
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "errorLog" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPlatformConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "profileId" TEXT,
    "profileName" TEXT,
    "profileImage" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_tokenInvitacion_key" ON "User"("tokenInvitacion");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_bookingSlug_key" ON "User"("bookingSlug");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_estado_idx" ON "User"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "UserWhatsAppInstance_instanceName_key" ON "UserWhatsAppInstance"("instanceName");

-- CreateIndex
CREATE INDEX "UserWhatsAppInstance_userId_idx" ON "UserWhatsAppInstance"("userId");

-- CreateIndex
CREATE INDEX "UserWhatsAppInstance_tenantId_idx" ON "UserWhatsAppInstance"("tenantId");

-- CreateIndex
CREATE INDEX "UserWhatsAppInstance_instanceName_idx" ON "UserWhatsAppInstance"("instanceName");

-- CreateIndex
CREATE INDEX "UserWhatsAppInstance_status_idx" ON "UserWhatsAppInstance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_estado_idx" ON "Tenant"("estado");

-- CreateIndex
CREATE INDEX "Tenant_stripeCustomerId_idx" ON "Tenant"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_tenantId_key" ON "OnboardingProgress"("tenantId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_tenantId_idx" ON "OnboardingProgress"("tenantId");

-- CreateIndex
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_nombre_key" ON "Role"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entidad_idx" ON "AuditLog"("entidad");

-- CreateIndex
CREATE INDEX "AuditLog_entidadId_idx" ON "AuditLog"("entidadId");

-- CreateIndex
CREATE INDEX "AuditLog_fechaCreacion_idx" ON "AuditLog"("fechaCreacion");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_tokenPublico_key" ON "Lead"("tokenPublico");

-- CreateIndex
CREATE INDEX "Lead_tenantId_idx" ON "Lead"("tenantId");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "Lead_estado_idx" ON "Lead"("estado");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_asignadoA_idx" ON "Lead"("asignadoA");

-- CreateIndex
CREATE INDEX "Lead_fuente_idx" ON "Lead"("fuente");

-- CreateIndex
CREATE INDEX "Lead_convertedToContactId_idx" ON "Lead"("convertedToContactId");

-- CreateIndex
CREATE INDEX "Lead_externalContactRef_idx" ON "Lead"("externalContactRef");

-- CreateIndex
CREATE INDEX "Lead_chatwootAccountId_externalContactRef_idx" ON "Lead"("chatwootAccountId", "externalContactRef");

-- CreateIndex
CREATE UNIQUE INDEX "lead_field_definitions_tenantId_fieldKey_key" ON "lead_field_definitions"("tenantId", "fieldKey");

-- CreateIndex
CREATE INDEX "lead_attachments_leadId_idx" ON "lead_attachments"("leadId");

-- CreateIndex
CREATE INDEX "lead_attachments_tenantId_idx" ON "lead_attachments"("tenantId");

-- CreateIndex
CREATE INDEX "contacts_tenantId_idx" ON "contacts"("tenantId");

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE INDEX "contacts_tipo_idx" ON "contacts"("tipo");

-- CreateIndex
CREATE INDEX "contacts_companyId_idx" ON "contacts"("companyId");

-- CreateIndex
CREATE INDEX "Servicio_tenantId_idx" ON "Servicio"("tenantId");

-- CreateIndex
CREATE INDEX "Servicio_catalogoItemId_idx" ON "Servicio"("catalogoItemId");

-- CreateIndex
CREATE INDEX "Cita_tenantId_idx" ON "Cita"("tenantId");

-- CreateIndex
CREATE INDEX "Cita_usuarioAsignadoId_idx" ON "Cita"("usuarioAsignadoId");

-- CreateIndex
CREATE INDEX "Cita_fechaHora_idx" ON "Cita"("fechaHora");

-- CreateIndex
CREATE INDEX "Cita_estado_idx" ON "Cita"("estado");

-- CreateIndex
CREATE INDEX "Cita_tipo_idx" ON "Cita"("tipo");

-- CreateIndex
CREATE INDEX "Cita_googleCalendarEventId_idx" ON "Cita"("googleCalendarEventId");

-- CreateIndex
CREATE INDEX "Cita_origenCita_idx" ON "Cita"("origenCita");

-- CreateIndex
CREATE INDEX "Cita_catalogoItemId_idx" ON "Cita"("catalogoItemId");

-- CreateIndex
CREATE INDEX "Configuracion_tenantId_idx" ON "Configuracion"("tenantId");

-- CreateIndex
CREATE INDEX "Configuracion_clave_idx" ON "Configuracion"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "Configuracion_tenantId_clave_key" ON "Configuracion"("tenantId", "clave");

-- CreateIndex
CREATE INDEX "Automation_tenantId_idx" ON "Automation"("tenantId");

-- CreateIndex
CREATE INDEX "Automation_activo_idx" ON "Automation"("activo");

-- CreateIndex
CREATE INDEX "Automation_trigger_idx" ON "Automation"("trigger");

-- CreateIndex
CREATE INDEX "AutomationExecution_automationId_idx" ON "AutomationExecution"("automationId");

-- CreateIndex
CREATE INDEX "AutomationExecution_estado_idx" ON "AutomationExecution"("estado");

-- CreateIndex
CREATE INDEX "AutomationExecution_fechaInicio_idx" ON "AutomationExecution"("fechaInicio");

-- CreateIndex
CREATE INDEX "AutomationExecutionLog_executionId_idx" ON "AutomationExecutionLog"("executionId");

-- CreateIndex
CREATE INDEX "AutomationExecutionLog_externalWorkflowId_idx" ON "AutomationExecutionLog"("externalWorkflowId");

-- CreateIndex
CREATE INDEX "ScheduledAutomationTask_automationId_idx" ON "ScheduledAutomationTask"("automationId");

-- CreateIndex
CREATE INDEX "ScheduledAutomationTask_scheduledFor_idx" ON "ScheduledAutomationTask"("scheduledFor");

-- CreateIndex
CREATE INDEX "ScheduledAutomationTask_estado_idx" ON "ScheduledAutomationTask"("estado");

-- CreateIndex
CREATE INDEX "n8n_workflows_tenantId_idx" ON "n8n_workflows"("tenantId");

-- CreateIndex
CREATE INDEX "n8n_workflows_trigger_idx" ON "n8n_workflows"("trigger");

-- CreateIndex
CREATE INDEX "n8n_workflows_activo_idx" ON "n8n_workflows"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "n8n_workflows_tenantId_n8nWorkflowId_key" ON "n8n_workflows"("tenantId", "n8nWorkflowId");

-- CreateIndex
CREATE INDEX "AutomationTemplate_categoria_idx" ON "AutomationTemplate"("categoria");

-- CreateIndex
CREATE INDEX "AutomationTemplate_esOficial_idx" ON "AutomationTemplate"("esOficial");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_name_key" ON "workflow_templates"("name");

-- CreateIndex
CREATE INDEX "workflow_templates_category_idx" ON "workflow_templates"("category");

-- CreateIndex
CREATE INDEX "workflow_templates_isActive_idx" ON "workflow_templates"("isActive");

-- CreateIndex
CREATE INDEX "tenant_workflows_tenantId_idx" ON "tenant_workflows"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_workflows_templateId_idx" ON "tenant_workflows"("templateId");

-- CreateIndex
CREATE INDEX "tenant_workflows_isActive_idx" ON "tenant_workflows"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_workflows_tenantId_templateId_key" ON "tenant_workflows"("tenantId", "templateId");

-- CreateIndex
CREATE INDEX "Estudiante_tenantId_idx" ON "Estudiante"("tenantId");

-- CreateIndex
CREATE INDEX "Estudiante_email_idx" ON "Estudiante"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Estudiante_tenantId_email_key" ON "Estudiante"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Curso_urlSlug_key" ON "Curso"("urlSlug");

-- CreateIndex
CREATE INDEX "Curso_tenantId_idx" ON "Curso"("tenantId");

-- CreateIndex
CREATE INDEX "Curso_publicado_idx" ON "Curso"("publicado");

-- CreateIndex
CREATE INDEX "Curso_categoria_idx" ON "Curso"("categoria");

-- CreateIndex
CREATE INDEX "Curso_urlSlug_idx" ON "Curso"("urlSlug");

-- CreateIndex
CREATE INDEX "Curso_catalogoItemId_idx" ON "Curso"("catalogoItemId");

-- CreateIndex
CREATE INDEX "Modulo_cursoId_idx" ON "Modulo"("cursoId");

-- CreateIndex
CREATE INDEX "Modulo_orden_idx" ON "Modulo"("orden");

-- CreateIndex
CREATE INDEX "Leccion_moduloId_idx" ON "Leccion"("moduloId");

-- CreateIndex
CREATE INDEX "Leccion_orden_idx" ON "Leccion"("orden");

-- CreateIndex
CREATE INDEX "Leccion_quizId_idx" ON "Leccion"("quizId");

-- CreateIndex
CREATE INDEX "Leccion_tareaId_idx" ON "Leccion"("tareaId");

-- CreateIndex
CREATE INDEX "Inscripcion_estudianteId_idx" ON "Inscripcion"("estudianteId");

-- CreateIndex
CREATE INDEX "Inscripcion_cursoId_idx" ON "Inscripcion"("cursoId");

-- CreateIndex
CREATE INDEX "Inscripcion_estado_idx" ON "Inscripcion"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "Inscripcion_estudianteId_cursoId_key" ON "Inscripcion"("estudianteId", "cursoId");

-- CreateIndex
CREATE INDEX "ProgresoLeccion_estudianteId_idx" ON "ProgresoLeccion"("estudianteId");

-- CreateIndex
CREATE INDEX "ProgresoLeccion_leccionId_idx" ON "ProgresoLeccion"("leccionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgresoLeccion_estudianteId_leccionId_key" ON "ProgresoLeccion"("estudianteId", "leccionId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificado_codigoUnico_key" ON "Certificado"("codigoUnico");

-- CreateIndex
CREATE INDEX "Certificado_estudianteId_idx" ON "Certificado"("estudianteId");

-- CreateIndex
CREATE INDEX "Certificado_cursoId_idx" ON "Certificado"("cursoId");

-- CreateIndex
CREATE INDEX "Certificado_codigoUnico_idx" ON "Certificado"("codigoUnico");

-- CreateIndex
CREATE UNIQUE INDEX "Certificado_estudianteId_cursoId_key" ON "Certificado"("estudianteId", "cursoId");

-- CreateIndex
CREATE INDEX "Quiz_tenantId_idx" ON "Quiz"("tenantId");

-- CreateIndex
CREATE INDEX "Pregunta_quizId_idx" ON "Pregunta"("quizId");

-- CreateIndex
CREATE INDEX "Pregunta_orden_idx" ON "Pregunta"("orden");

-- CreateIndex
CREATE INDEX "IntentoQuiz_estudianteId_idx" ON "IntentoQuiz"("estudianteId");

-- CreateIndex
CREATE INDEX "IntentoQuiz_quizId_idx" ON "IntentoQuiz"("quizId");

-- CreateIndex
CREATE INDEX "RespuestaEstudiante_intentoId_idx" ON "RespuestaEstudiante"("intentoId");

-- CreateIndex
CREATE INDEX "RespuestaEstudiante_preguntaId_idx" ON "RespuestaEstudiante"("preguntaId");

-- CreateIndex
CREATE INDEX "Tarea_tenantId_idx" ON "Tarea"("tenantId");

-- CreateIndex
CREATE INDEX "EntregaTarea_tareaId_idx" ON "EntregaTarea"("tareaId");

-- CreateIndex
CREATE INDEX "EntregaTarea_estudianteId_idx" ON "EntregaTarea"("estudianteId");

-- CreateIndex
CREATE INDEX "EntregaTarea_estado_idx" ON "EntregaTarea"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "EntregaTarea_tareaId_estudianteId_key" ON "EntregaTarea"("tareaId", "estudianteId");

-- CreateIndex
CREATE INDEX "Review_cursoId_idx" ON "Review"("cursoId");

-- CreateIndex
CREATE INDEX "Review_estudianteId_idx" ON "Review"("estudianteId");

-- CreateIndex
CREATE INDEX "Review_aprobado_idx" ON "Review"("aprobado");

-- CreateIndex
CREATE UNIQUE INDEX "Review_cursoId_estudianteId_key" ON "Review"("cursoId", "estudianteId");

-- CreateIndex
CREATE INDEX "Comentario_leccionId_idx" ON "Comentario"("leccionId");

-- CreateIndex
CREATE INDEX "Comentario_cursoId_idx" ON "Comentario"("cursoId");

-- CreateIndex
CREATE INDEX "Comentario_estudianteId_idx" ON "Comentario"("estudianteId");

-- CreateIndex
CREATE INDEX "Comentario_comentarioPadreId_idx" ON "Comentario"("comentarioPadreId");

-- CreateIndex
CREATE UNIQUE INDEX "Cupon_codigo_key" ON "Cupon"("codigo");

-- CreateIndex
CREATE INDEX "Cupon_tenantId_idx" ON "Cupon"("tenantId");

-- CreateIndex
CREATE INDEX "Cupon_cursoId_idx" ON "Cupon"("cursoId");

-- CreateIndex
CREATE INDEX "Cupon_codigo_idx" ON "Cupon"("codigo");

-- CreateIndex
CREATE INDEX "Bundle_tenantId_idx" ON "Bundle"("tenantId");

-- CreateIndex
CREATE INDEX "BundleCurso_bundleId_idx" ON "BundleCurso"("bundleId");

-- CreateIndex
CREATE INDEX "BundleCurso_cursoId_idx" ON "BundleCurso"("cursoId");

-- CreateIndex
CREATE UNIQUE INDEX "BundleCurso_bundleId_cursoId_key" ON "BundleCurso"("bundleId", "cursoId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_externalRef_key" ON "Conversation"("externalRef");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_idx" ON "Conversation"("tenantId");

-- CreateIndex
CREATE INDEX "Conversation_canal_idx" ON "Conversation"("canal");

-- CreateIndex
CREATE INDEX "Conversation_estado_idx" ON "Conversation"("estado");

-- CreateIndex
CREATE INDEX "Conversation_leadId_idx" ON "Conversation"("leadId");

-- CreateIndex
CREATE INDEX "Conversation_estudianteId_idx" ON "Conversation"("estudianteId");

-- CreateIndex
CREATE INDEX "Conversation_fechaUltimoMensaje_idx" ON "Conversation"("fechaUltimoMensaje");

-- CreateIndex
CREATE INDEX "Conversation_externalRef_idx" ON "Conversation"("externalRef");

-- CreateIndex
CREATE INDEX "Conversation_chatwootAccountId_externalRef_idx" ON "Conversation"("chatwootAccountId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Message_externalRef_key" ON "Message"("externalRef");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_canal_idx" ON "Message"("canal");

-- CreateIndex
CREATE INDEX "Message_direccion_idx" ON "Message"("direccion");

-- CreateIndex
CREATE INDEX "Message_fechaCreacion_idx" ON "Message"("fechaCreacion");

-- CreateIndex
CREATE INDEX "Message_externalRef_idx" ON "Message"("externalRef");

-- CreateIndex
CREATE INDEX "MessageTemplate_canal_idx" ON "MessageTemplate"("canal");

-- CreateIndex
CREATE INDEX "MessageTemplate_categoria_idx" ON "MessageTemplate"("categoria");

-- CreateIndex
CREATE INDEX "MessageTemplate_activo_idx" ON "MessageTemplate"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConfiguration_canal_key" ON "ChannelConfiguration"("canal");

-- CreateIndex
CREATE INDEX "ChannelConfiguration_canal_idx" ON "ChannelConfiguration"("canal");

-- CreateIndex
CREATE UNIQUE INDEX "LeadScore_leadId_key" ON "LeadScore"("leadId");

-- CreateIndex
CREATE INDEX "LeadScore_leadId_idx" ON "LeadScore"("leadId");

-- CreateIndex
CREATE INDEX "LeadScore_puntuacion_idx" ON "LeadScore"("puntuacion");

-- CreateIndex
CREATE INDEX "LeadScore_categoria_idx" ON "LeadScore"("categoria");

-- CreateIndex
CREATE INDEX "ScoreHistory_leadId_idx" ON "ScoreHistory"("leadId");

-- CreateIndex
CREATE INDEX "ScoreHistory_fechaCreacion_idx" ON "ScoreHistory"("fechaCreacion");

-- CreateIndex
CREATE INDEX "ScoringRule_categoria_idx" ON "ScoringRule"("categoria");

-- CreateIndex
CREATE INDEX "ScoringRule_evento_idx" ON "ScoringRule"("evento");

-- CreateIndex
CREATE INDEX "ScoringRule_activo_idx" ON "ScoringRule"("activo");

-- CreateIndex
CREATE INDEX "ScoringRule_orden_idx" ON "ScoringRule"("orden");

-- CreateIndex
CREATE INDEX "ScoreCategory_orden_idx" ON "ScoreCategory"("orden");

-- CreateIndex
CREATE INDEX "ScoreCategory_puntuacionMin_idx" ON "ScoreCategory"("puntuacionMin");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_idx" ON "Campaign"("tenantId");

-- CreateIndex
CREATE INDEX "Campaign_estado_idx" ON "Campaign"("estado");

-- CreateIndex
CREATE INDEX "Campaign_tipo_idx" ON "Campaign"("tipo");

-- CreateIndex
CREATE INDEX "Campaign_fechaProgramada_idx" ON "Campaign"("fechaProgramada");

-- CreateIndex
CREATE INDEX "Campaign_fechaCreacion_idx" ON "Campaign"("fechaCreacion");

-- CreateIndex
CREATE INDEX "CampaignMessage_campaignId_idx" ON "CampaignMessage"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignMessage_canal_idx" ON "CampaignMessage"("canal");

-- CreateIndex
CREATE INDEX "CampaignMessage_orden_idx" ON "CampaignMessage"("orden");

-- CreateIndex
CREATE INDEX "CampaignExecution_campaignId_idx" ON "CampaignExecution"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignExecution_destinatarioTipo_idx" ON "CampaignExecution"("destinatarioTipo");

-- CreateIndex
CREATE INDEX "CampaignExecution_destinatarioId_idx" ON "CampaignExecution"("destinatarioId");

-- CreateIndex
CREATE INDEX "CampaignExecution_estado_idx" ON "CampaignExecution"("estado");

-- CreateIndex
CREATE INDEX "CampaignExecution_canal_idx" ON "CampaignExecution"("canal");

-- CreateIndex
CREATE INDEX "CampaignExecution_fechaCreacion_idx" ON "CampaignExecution"("fechaCreacion");

-- CreateIndex
CREATE INDEX "CampaignMetrics_campaignId_idx" ON "CampaignMetrics"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignMetrics_fecha_idx" ON "CampaignMetrics"("fecha");

-- CreateIndex
CREATE INDEX "CampaignMetrics_canal_idx" ON "CampaignMetrics"("canal");

-- CreateIndex
CREATE INDEX "Task_tenantId_idx" ON "Task"("tenantId");

-- CreateIndex
CREATE INDEX "Task_leadId_idx" ON "Task"("leadId");

-- CreateIndex
CREATE INDEX "Task_asignadoA_idx" ON "Task"("asignadoA");

-- CreateIndex
CREATE INDEX "Task_fechaVencimiento_idx" ON "Task"("fechaVencimiento");

-- CreateIndex
CREATE INDEX "Task_completada_idx" ON "Task"("completada");

-- CreateIndex
CREATE INDEX "Task_googleTaskId_idx" ON "Task"("googleTaskId");

-- CreateIndex
CREATE INDEX "Interaction_leadId_idx" ON "Interaction"("leadId");

-- CreateIndex
CREATE INDEX "Interaction_tipo_idx" ON "Interaction"("tipo");

-- CreateIndex
CREATE INDEX "Interaction_creadoPor_idx" ON "Interaction"("creadoPor");

-- CreateIndex
CREATE INDEX "Interaction_fechaCreacion_idx" ON "Interaction"("fechaCreacion");

-- CreateIndex
CREATE INDEX "Note_leadId_idx" ON "Note"("leadId");

-- CreateIndex
CREATE INDEX "Note_creadoPor_idx" ON "Note"("creadoPor");

-- CreateIndex
CREATE INDEX "Note_fechaCreacion_idx" ON "Note"("fechaCreacion");

-- CreateIndex
CREATE UNIQUE INDEX "pages_dominioPersonalizado_key" ON "pages"("dominioPersonalizado");

-- CreateIndex
CREATE INDEX "pages_tenantId_idx" ON "pages"("tenantId");

-- CreateIndex
CREATE INDEX "pages_slug_idx" ON "pages"("slug");

-- CreateIndex
CREATE INDEX "pages_estado_idx" ON "pages"("estado");

-- CreateIndex
CREATE INDEX "pages_tipo_idx" ON "pages"("tipo");

-- CreateIndex
CREATE INDEX "pages_creadoPor_idx" ON "pages"("creadoPor");

-- CreateIndex
CREATE INDEX "pages_dominioPersonalizado_idx" ON "pages"("dominioPersonalizado");

-- CreateIndex
CREATE UNIQUE INDEX "pages_tenantId_slug_key" ON "pages"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "page_templates_categoria_idx" ON "page_templates"("categoria");

-- CreateIndex
CREATE INDEX "page_components_tipo_idx" ON "page_components"("tipo");

-- CreateIndex
CREATE INDEX "page_components_creadoPor_idx" ON "page_components"("creadoPor");

-- CreateIndex
CREATE UNIQUE INDEX "page_publishing_paginaId_key" ON "page_publishing"("paginaId");

-- CreateIndex
CREATE UNIQUE INDEX "page_publishing_subdominio_key" ON "page_publishing"("subdominio");

-- CreateIndex
CREATE UNIQUE INDEX "page_publishing_dominioPersonalizado_key" ON "page_publishing"("dominioPersonalizado");

-- CreateIndex
CREATE INDEX "page_publishing_subdominio_idx" ON "page_publishing"("subdominio");

-- CreateIndex
CREATE INDEX "page_publishing_dominioPersonalizado_idx" ON "page_publishing"("dominioPersonalizado");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_slug_key" ON "subscription_plans"("slug");

-- CreateIndex
CREATE INDEX "subscription_plans_slug_idx" ON "subscription_plans"("slug");

-- CreateIndex
CREATE INDEX "subscription_plans_activo_idx" ON "subscription_plans"("activo");

-- CreateIndex
CREATE INDEX "subscription_plans_esPublico_idx" ON "subscription_plans"("esPublico");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_idx" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "subscriptions_planId_idx" ON "subscriptions"("planId");

-- CreateIndex
CREATE INDEX "subscriptions_estado_idx" ON "subscriptions"("estado");

-- CreateIndex
CREATE INDEX "subscriptions_stripeSubscriptionId_idx" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_fechaRenovacion_idx" ON "subscriptions"("fechaRenovacion");

-- CreateIndex
CREATE INDEX "tenant_features_tenantId_idx" ON "tenant_features"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_features_feature_idx" ON "tenant_features"("feature");

-- CreateIndex
CREATE INDEX "tenant_features_habilitado_idx" ON "tenant_features"("habilitado");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_features_tenantId_feature_key" ON "tenant_features"("tenantId", "feature");

-- CreateIndex
CREATE INDEX "integrations_tenantId_idx" ON "integrations"("tenantId");

-- CreateIndex
CREATE INDEX "integrations_tipo_idx" ON "integrations"("tipo");

-- CreateIndex
CREATE INDEX "integrations_conectado_idx" ON "integrations"("conectado");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_tenantId_tipo_key" ON "integrations"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_integrations_userId_key" ON "google_calendar_integrations"("userId");

-- CreateIndex
CREATE INDEX "google_calendar_integrations_userId_idx" ON "google_calendar_integrations"("userId");

-- CreateIndex
CREATE INDEX "google_calendar_integrations_tenantId_idx" ON "google_calendar_integrations"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_logs_tenantId_idx" ON "webhook_logs"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_logs_integrationId_idx" ON "webhook_logs"("integrationId");

-- CreateIndex
CREATE INDEX "webhook_logs_estado_idx" ON "webhook_logs"("estado");

-- CreateIndex
CREATE INDEX "webhook_logs_fechaCreacion_idx" ON "webhook_logs"("fechaCreacion");

-- CreateIndex
CREATE INDEX "incoming_webhooks_tenantId_idx" ON "incoming_webhooks"("tenantId");

-- CreateIndex
CREATE INDEX "incoming_webhooks_userId_idx" ON "incoming_webhooks"("userId");

-- CreateIndex
CREATE INDEX "incoming_webhooks_activo_idx" ON "incoming_webhooks"("activo");

-- CreateIndex
CREATE INDEX "incoming_webhooks_automationId_idx" ON "incoming_webhooks"("automationId");

-- CreateIndex
CREATE INDEX "incoming_webhook_deliveries_webhookId_idx" ON "incoming_webhook_deliveries"("webhookId");

-- CreateIndex
CREATE INDEX "incoming_webhook_deliveries_tenantId_idx" ON "incoming_webhook_deliveries"("tenantId");

-- CreateIndex
CREATE INDEX "incoming_webhook_deliveries_estado_idx" ON "incoming_webhook_deliveries"("estado");

-- CreateIndex
CREATE INDEX "incoming_webhook_deliveries_fechaRecepcion_idx" ON "incoming_webhook_deliveries"("fechaRecepcion");

-- CreateIndex
CREATE INDEX "saved_searches_tenantId_idx" ON "saved_searches"("tenantId");

-- CreateIndex
CREATE INDEX "saved_searches_userId_idx" ON "saved_searches"("userId");

-- CreateIndex
CREATE INDEX "saved_searches_activa_idx" ON "saved_searches"("activa");

-- CreateIndex
CREATE INDEX "saved_searches_fechaCreacion_idx" ON "saved_searches"("fechaCreacion");

-- CreateIndex
CREATE INDEX "external_lead_searches_tenantId_idx" ON "external_lead_searches"("tenantId");

-- CreateIndex
CREATE INDEX "external_lead_searches_userId_idx" ON "external_lead_searches"("userId");

-- CreateIndex
CREATE INDEX "external_lead_searches_fechaCreacion_idx" ON "external_lead_searches"("fechaCreacion");

-- CreateIndex
CREATE INDEX "deals_tenantId_idx" ON "deals"("tenantId");

-- CreateIndex
CREATE INDEX "deals_leadId_idx" ON "deals"("leadId");

-- CreateIndex
CREATE INDEX "deals_contactId_idx" ON "deals"("contactId");

-- CreateIndex
CREATE INDEX "deals_companyId_idx" ON "deals"("companyId");

-- CreateIndex
CREATE INDEX "deals_usuarioAsignadoId_idx" ON "deals"("usuarioAsignadoId");

-- CreateIndex
CREATE INDEX "deals_etapa_idx" ON "deals"("etapa");

-- CreateIndex
CREATE INDEX "deals_estado_idx" ON "deals"("estado");

-- CreateIndex
CREATE INDEX "deals_fechaEstimadaCierre_idx" ON "deals"("fechaEstimadaCierre");

-- CreateIndex
CREATE INDEX "deals_fechaCreacion_idx" ON "deals"("fechaCreacion");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_leido_idx" ON "notifications"("leido");

-- CreateIndex
CREATE INDEX "notifications_fechaCreacion_idx" ON "notifications"("fechaCreacion");

-- CreateIndex
CREATE INDEX "campaign_leads_campanaId_idx" ON "campaign_leads"("campanaId");

-- CreateIndex
CREATE INDEX "campaign_leads_leadId_idx" ON "campaign_leads"("leadId");

-- CreateIndex
CREATE INDEX "campaign_leads_estado_idx" ON "campaign_leads"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_leads_campanaId_leadId_key" ON "campaign_leads"("campanaId", "leadId");

-- CreateIndex
CREATE INDEX "pipeline_stages_tenantId_idx" ON "pipeline_stages"("tenantId");

-- CreateIndex
CREATE INDEX "pipeline_stages_orden_idx" ON "pipeline_stages"("orden");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_tenantId_nombre_key" ON "pipeline_stages"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "deal_activities_dealId_idx" ON "deal_activities"("dealId");

-- CreateIndex
CREATE INDEX "deal_activities_tenantId_idx" ON "deal_activities"("tenantId");

-- CreateIndex
CREATE INDEX "deal_activities_userId_idx" ON "deal_activities"("userId");

-- CreateIndex
CREATE INDEX "deal_activities_fechaCreacion_idx" ON "deal_activities"("fechaCreacion");

-- CreateIndex
CREATE INDEX "deal_attachments_dealId_idx" ON "deal_attachments"("dealId");

-- CreateIndex
CREATE INDEX "deal_attachments_tenantId_idx" ON "deal_attachments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_tokenPublico_key" ON "cotizaciones"("tokenPublico");

-- CreateIndex
CREATE INDEX "cotizaciones_tenantId_idx" ON "cotizaciones"("tenantId");

-- CreateIndex
CREATE INDEX "cotizaciones_dealId_idx" ON "cotizaciones"("dealId");

-- CreateIndex
CREATE INDEX "cotizaciones_leadId_idx" ON "cotizaciones"("leadId");

-- CreateIndex
CREATE INDEX "cotizaciones_estado_idx" ON "cotizaciones"("estado");

-- CreateIndex
CREATE INDEX "cotizaciones_fechaCreacion_idx" ON "cotizaciones"("fechaCreacion");

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_tenantId_numero_key" ON "cotizaciones"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "cotizacion_items_cotizacionId_idx" ON "cotizacion_items"("cotizacionId");

-- CreateIndex
CREATE INDEX "cotizacion_items_catalogoItemId_idx" ON "cotizacion_items"("catalogoItemId");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_tokenPublico_key" ON "contratos"("tokenPublico");

-- CreateIndex
CREATE INDEX "contratos_tenantId_idx" ON "contratos"("tenantId");

-- CreateIndex
CREATE INDEX "contratos_dealId_idx" ON "contratos"("dealId");

-- CreateIndex
CREATE INDEX "contratos_leadId_idx" ON "contratos"("leadId");

-- CreateIndex
CREATE INDEX "contratos_cotizacionId_idx" ON "contratos"("cotizacionId");

-- CreateIndex
CREATE INDEX "contratos_estado_idx" ON "contratos"("estado");

-- CreateIndex
CREATE INDEX "contratos_fechaCreacion_idx" ON "contratos"("fechaCreacion");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_tenantId_numero_key" ON "contratos"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "contrato_items_contratoId_idx" ON "contrato_items"("contratoId");

-- CreateIndex
CREATE INDEX "contrato_items_catalogoItemId_idx" ON "contrato_items"("catalogoItemId");

-- CreateIndex
CREATE INDEX "contrato_pagos_contratoId_idx" ON "contrato_pagos"("contratoId");

-- CreateIndex
CREATE INDEX "contrato_pagos_tenantId_idx" ON "contrato_pagos"("tenantId");

-- CreateIndex
CREATE INDEX "contrato_pagos_estado_idx" ON "contrato_pagos"("estado");

-- CreateIndex
CREATE INDEX "comisiones_tenantId_idx" ON "comisiones"("tenantId");

-- CreateIndex
CREATE INDEX "comisiones_dealId_idx" ON "comisiones"("dealId");

-- CreateIndex
CREATE INDEX "comisiones_userId_idx" ON "comisiones"("userId");

-- CreateIndex
CREATE INDEX "comisiones_estado_idx" ON "comisiones"("estado");

-- CreateIndex
CREATE INDEX "comisiones_fechaCreacion_idx" ON "comisiones"("fechaCreacion");

-- CreateIndex
CREATE INDEX "metas_venta_tenantId_idx" ON "metas_venta"("tenantId");

-- CreateIndex
CREATE INDEX "metas_venta_userId_idx" ON "metas_venta"("userId");

-- CreateIndex
CREATE INDEX "metas_venta_estado_idx" ON "metas_venta"("estado");

-- CreateIndex
CREATE INDEX "metas_venta_fechaInicio_idx" ON "metas_venta"("fechaInicio");

-- CreateIndex
CREATE INDEX "metas_venta_fechaFin_idx" ON "metas_venta"("fechaFin");

-- CreateIndex
CREATE INDEX "email_campaigns_tenantId_idx" ON "email_campaigns"("tenantId");

-- CreateIndex
CREATE INDEX "email_campaigns_estado_idx" ON "email_campaigns"("estado");

-- CreateIndex
CREATE INDEX "email_campaigns_fechaEnvio_idx" ON "email_campaigns"("fechaEnvio");

-- CreateIndex
CREATE INDEX "email_campaigns_plantillaId_idx" ON "email_campaigns"("plantillaId");

-- CreateIndex
CREATE INDEX "email_campaigns_audienciaId_idx" ON "email_campaigns"("audienciaId");

-- CreateIndex
CREATE INDEX "email_templates_tenantId_idx" ON "email_templates"("tenantId");

-- CreateIndex
CREATE INDEX "email_templates_categoria_idx" ON "email_templates"("categoria");

-- CreateIndex
CREATE INDEX "email_templates_esOficial_idx" ON "email_templates"("esOficial");

-- CreateIndex
CREATE INDEX "campaign_recipients_campanaId_idx" ON "campaign_recipients"("campanaId");

-- CreateIndex
CREATE INDEX "campaign_recipients_leadId_idx" ON "campaign_recipients"("leadId");

-- CreateIndex
CREATE INDEX "campaign_recipients_tenantId_idx" ON "campaign_recipients"("tenantId");

-- CreateIndex
CREATE INDEX "campaign_recipients_estado_idx" ON "campaign_recipients"("estado");

-- CreateIndex
CREATE INDEX "campaign_recipients_emailDestinatario_idx" ON "campaign_recipients"("emailDestinatario");

-- CreateIndex
CREATE UNIQUE INDEX "ab_test_results_campanaId_key" ON "ab_test_results"("campanaId");

-- CreateIndex
CREATE INDEX "ab_test_results_tenantId_idx" ON "ab_test_results"("tenantId");

-- CreateIndex
CREATE INDEX "ab_test_results_ganador_idx" ON "ab_test_results"("ganador");

-- CreateIndex
CREATE INDEX "audiences_tenantId_idx" ON "audiences"("tenantId");

-- CreateIndex
CREATE INDEX "audiences_esEstatica_idx" ON "audiences"("esEstatica");

-- CreateIndex
CREATE UNIQUE INDEX "unsubscribe_list_tokenReactivacion_key" ON "unsubscribe_list"("tokenReactivacion");

-- CreateIndex
CREATE INDEX "unsubscribe_list_tenantId_idx" ON "unsubscribe_list"("tenantId");

-- CreateIndex
CREATE INDEX "unsubscribe_list_email_idx" ON "unsubscribe_list"("email");

-- CreateIndex
CREATE INDEX "unsubscribe_list_leadId_idx" ON "unsubscribe_list"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "unsubscribe_list_tenantId_email_key" ON "unsubscribe_list"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "anytimebot_integrations_tenantId_key" ON "anytimebot_integrations"("tenantId");

-- CreateIndex
CREATE INDEX "anytimebot_integrations_tenantId_idx" ON "anytimebot_integrations"("tenantId");

-- CreateIndex
CREATE INDEX "anytimebot_integrations_username_idx" ON "anytimebot_integrations"("username");

-- CreateIndex
CREATE INDEX "outgoing_webhooks_tenantId_idx" ON "outgoing_webhooks"("tenantId");

-- CreateIndex
CREATE INDEX "outgoing_webhooks_userId_idx" ON "outgoing_webhooks"("userId");

-- CreateIndex
CREATE INDEX "outgoing_webhooks_activo_idx" ON "outgoing_webhooks"("activo");

-- CreateIndex
CREATE INDEX "outgoing_webhook_deliveries_webhookId_idx" ON "outgoing_webhook_deliveries"("webhookId");

-- CreateIndex
CREATE INDEX "outgoing_webhook_deliveries_tenantId_idx" ON "outgoing_webhook_deliveries"("tenantId");

-- CreateIndex
CREATE INDEX "outgoing_webhook_deliveries_evento_idx" ON "outgoing_webhook_deliveries"("evento");

-- CreateIndex
CREATE INDEX "outgoing_webhook_deliveries_estado_idx" ON "outgoing_webhook_deliveries"("estado");

-- CreateIndex
CREATE INDEX "outgoing_webhook_deliveries_fechaEnvio_idx" ON "outgoing_webhook_deliveries"("fechaEnvio");

-- CreateIndex
CREATE UNIQUE INDEX "digital_cards_userId_key" ON "digital_cards"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "digital_cards_urlUnica_key" ON "digital_cards"("urlUnica");

-- CreateIndex
CREATE INDEX "digital_cards_userId_idx" ON "digital_cards"("userId");

-- CreateIndex
CREATE INDEX "digital_cards_tenantId_idx" ON "digital_cards"("tenantId");

-- CreateIndex
CREATE INDEX "digital_cards_urlUnica_idx" ON "digital_cards"("urlUnica");

-- CreateIndex
CREATE INDEX "digital_cards_activo_idx" ON "digital_cards"("activo");

-- CreateIndex
CREATE INDEX "scanned_cards_digitalCardId_idx" ON "scanned_cards"("digitalCardId");

-- CreateIndex
CREATE INDEX "scanned_cards_tenantId_idx" ON "scanned_cards"("tenantId");

-- CreateIndex
CREATE INDEX "scanned_cards_leadId_idx" ON "scanned_cards"("leadId");

-- CreateIndex
CREATE INDEX "scanned_cards_estado_idx" ON "scanned_cards"("estado");

-- CreateIndex
CREATE INDEX "scanned_cards_fechaEscaneo_idx" ON "scanned_cards"("fechaEscaneo");

-- CreateIndex
CREATE UNIQUE INDEX "plaudern_integrations_tenantId_key" ON "plaudern_integrations"("tenantId");

-- CreateIndex
CREATE INDEX "plaudern_integrations_tenantId_idx" ON "plaudern_integrations"("tenantId");

-- CreateIndex
CREATE INDEX "plaudern_integrations_activo_idx" ON "plaudern_integrations"("activo");

-- CreateIndex
CREATE INDEX "plaudern_integrations_botId_idx" ON "plaudern_integrations"("botId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE INDEX "api_keys_keyHash_idx" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_activo_idx" ON "api_keys"("activo");

-- CreateIndex
CREATE INDEX "tasas_impuesto_tenantId_idx" ON "tasas_impuesto"("tenantId");

-- CreateIndex
CREATE INDEX "tasas_impuesto_pais_idx" ON "tasas_impuesto"("pais");

-- CreateIndex
CREATE INDEX "tasas_impuesto_pais_estado_idx" ON "tasas_impuesto"("pais", "estado");

-- CreateIndex
CREATE INDEX "tasas_impuesto_activo_idx" ON "tasas_impuesto"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "tasas_impuesto_tenantId_codigo_fechaInicioVigencia_key" ON "tasas_impuesto"("tenantId", "codigo", "fechaInicioVigencia");

-- CreateIndex
CREATE INDEX "catalogo_items_tenantId_idx" ON "catalogo_items"("tenantId");

-- CreateIndex
CREATE INDEX "catalogo_items_tipo_idx" ON "catalogo_items"("tipo");

-- CreateIndex
CREATE INDEX "catalogo_items_activo_idx" ON "catalogo_items"("activo");

-- CreateIndex
CREATE INDEX "catalogo_items_categoriaFiscal_idx" ON "catalogo_items"("categoriaFiscal");

-- CreateIndex
CREATE UNIQUE INDEX "catalogo_items_tenantId_sku_key" ON "catalogo_items"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "catalogo_field_definitions_tenantId_idx" ON "catalogo_field_definitions"("tenantId");

-- CreateIndex
CREATE INDEX "catalogo_field_definitions_tenantId_categoria_idx" ON "catalogo_field_definitions"("tenantId", "categoria");

-- CreateIndex
CREATE INDEX "catalogo_field_definitions_tenantId_activo_idx" ON "catalogo_field_definitions"("tenantId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "catalogo_field_definitions_tenantId_fieldKey_key" ON "catalogo_field_definitions"("tenantId", "fieldKey");

-- CreateIndex
CREATE INDEX "configuracion_fiscal_emisor_tenantId_idx" ON "configuracion_fiscal_emisor"("tenantId");

-- CreateIndex
CREATE INDEX "configuracion_fiscal_emisor_pais_idx" ON "configuracion_fiscal_emisor"("pais");

-- CreateIndex
CREATE INDEX "configuracion_fiscal_emisor_esPrincipal_idx" ON "configuracion_fiscal_emisor"("esPrincipal");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_fiscal_emisor_tenantId_idFiscal_key" ON "configuracion_fiscal_emisor"("tenantId", "idFiscal");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_fiscal_cliente_leadId_key" ON "perfil_fiscal_cliente"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_fiscal_cliente_contactId_key" ON "perfil_fiscal_cliente"("contactId");

-- CreateIndex
CREATE INDEX "perfil_fiscal_cliente_tenantId_idx" ON "perfil_fiscal_cliente"("tenantId");

-- CreateIndex
CREATE INDEX "perfil_fiscal_cliente_pais_idx" ON "perfil_fiscal_cliente"("pais");

-- CreateIndex
CREATE INDEX "perfil_fiscal_cliente_idFiscal_idx" ON "perfil_fiscal_cliente"("idFiscal");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_venta_invoiceId_key" ON "ordenes_venta"("invoiceId");

-- CreateIndex
CREATE INDEX "ordenes_venta_tenantId_idx" ON "ordenes_venta"("tenantId");

-- CreateIndex
CREATE INDEX "ordenes_venta_estado_idx" ON "ordenes_venta"("estado");

-- CreateIndex
CREATE INDEX "ordenes_venta_leadId_idx" ON "ordenes_venta"("leadId");

-- CreateIndex
CREATE INDEX "ordenes_venta_contactId_idx" ON "ordenes_venta"("contactId");

-- CreateIndex
CREATE INDEX "ordenes_venta_contratoId_idx" ON "ordenes_venta"("contratoId");

-- CreateIndex
CREATE INDEX "ordenes_venta_fechaOrden_idx" ON "ordenes_venta"("fechaOrden");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_venta_tenantId_numero_key" ON "ordenes_venta"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "orden_venta_items_ordenVentaId_idx" ON "orden_venta_items"("ordenVentaId");

-- CreateIndex
CREATE INDEX "orden_venta_items_catalogoItemId_idx" ON "orden_venta_items"("catalogoItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatbotConfig_tenantId_key" ON "ChatbotConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_hub_config_tenantId_key" ON "messaging_hub_config"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_hub_config_webhookSecret_key" ON "messaging_hub_config"("webhookSecret");

-- CreateIndex
CREATE INDEX "messaging_hub_config_tenantId_idx" ON "messaging_hub_config"("tenantId");

-- CreateIndex
CREATE INDEX "messaging_hub_config_tenantId_isActive_idx" ON "messaging_hub_config"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "messaging_hub_config_chatwootAccountId_idx" ON "messaging_hub_config"("chatwootAccountId");

-- CreateIndex
CREATE INDEX "channels_tenantId_isDefault_idx" ON "channels"("tenantId", "isDefault");

-- CreateIndex
CREATE INDEX "channels_chatwootInboxId_idx" ON "channels"("chatwootInboxId");

-- CreateIndex
CREATE INDEX "channels_tenantId_type_idx" ON "channels"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "business_domains_domain_key" ON "business_domains"("domain");

-- CreateIndex
CREATE INDEX "business_domains_tenantId_idx" ON "business_domains"("tenantId");

-- CreateIndex
CREATE INDEX "business_domains_domain_idx" ON "business_domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "business_email_accounts_email_key" ON "business_email_accounts"("email");

-- CreateIndex
CREATE INDEX "business_email_accounts_domainId_idx" ON "business_email_accounts"("domainId");

-- CreateIndex
CREATE INDEX "business_email_accounts_email_idx" ON "business_email_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE INDEX "idempotency_records_status_idx" ON "idempotency_records"("status");

-- CreateIndex
CREATE INDEX "notification_logs_tenantId_idx" ON "notification_logs"("tenantId");

-- CreateIndex
CREATE INDEX "notification_logs_channel_idx" ON "notification_logs"("channel");

-- CreateIndex
CREATE INDEX "notification_logs_status_idx" ON "notification_logs"("status");

-- CreateIndex
CREATE INDEX "notification_logs_recipientId_idx" ON "notification_logs"("recipientId");

-- CreateIndex
CREATE INDEX "notification_logs_createdAt_idx" ON "notification_logs"("createdAt");

-- CreateIndex
CREATE INDEX "in_app_notifications_tenantId_idx" ON "in_app_notifications"("tenantId");

-- CreateIndex
CREATE INDEX "in_app_notifications_userId_idx" ON "in_app_notifications"("userId");

-- CreateIndex
CREATE INDEX "in_app_notifications_read_idx" ON "in_app_notifications"("read");

-- CreateIndex
CREATE INDEX "in_app_notifications_createdAt_idx" ON "in_app_notifications"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_ordenVentaId_key" ON "invoices"("ordenVentaId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_idx" ON "invoices"("tenantId");

-- CreateIndex
CREATE INDEX "invoices_leadId_idx" ON "invoices"("leadId");

-- CreateIndex
CREATE INDEX "invoices_contactId_idx" ON "invoices"("contactId");

-- CreateIndex
CREATE INDEX "invoices_externalId_idx" ON "invoices"("externalId");

-- CreateIndex
CREATE INDEX "invoices_provider_idx" ON "invoices"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "client_signature_settings_tenantId_key" ON "client_signature_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "signature_requests_libreSignUuid_key" ON "signature_requests"("libreSignUuid");

-- CreateIndex
CREATE INDEX "signature_requests_tenantId_idx" ON "signature_requests"("tenantId");

-- CreateIndex
CREATE INDEX "signature_requests_status_idx" ON "signature_requests"("status");

-- CreateIndex
CREATE INDEX "signature_requests_libreSignUuid_idx" ON "signature_requests"("libreSignUuid");

-- CreateIndex
CREATE INDEX "signature_audit_events_signatureRequestId_idx" ON "signature_audit_events"("signatureRequestId");

-- CreateIndex
CREATE INDEX "signature_audit_events_timestamp_idx" ON "signature_audit_events"("timestamp");

-- CreateIndex
CREATE INDEX "SocialPost_tenantId_idx" ON "SocialPost"("tenantId");

-- CreateIndex
CREATE INDEX "SocialPost_status_idx" ON "SocialPost"("status");

-- CreateIndex
CREATE INDEX "SocialPlatformConfig_tenantId_idx" ON "SocialPlatformConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPlatformConfig_tenantId_platform_key" ON "SocialPlatformConfig"("tenantId", "platform");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWhatsAppInstance" ADD CONSTRAINT "UserWhatsAppInstance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWhatsAppInstance" ADD CONSTRAINT "UserWhatsAppInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_asignadoA_fkey" FOREIGN KEY ("asignadoA") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedToContactId_fkey" FOREIGN KEY ("convertedToContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_field_definitions" ADD CONSTRAINT "lead_field_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attachments" ADD CONSTRAINT "lead_attachments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attachments" ADD CONSTRAINT "lead_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attachments" ADD CONSTRAINT "lead_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servicio" ADD CONSTRAINT "Servicio_catalogoItemId_fkey" FOREIGN KEY ("catalogoItemId") REFERENCES "catalogo_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servicio" ADD CONSTRAINT "Servicio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_catalogoItemId_fkey" FOREIGN KEY ("catalogoItemId") REFERENCES "catalogo_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_usuarioAsignadoId_fkey" FOREIGN KEY ("usuarioAsignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Configuracion" ADD CONSTRAINT "Configuracion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecutionLog" ADD CONSTRAINT "AutomationExecutionLog_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AutomationExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAutomationTask" ADD CONSTRAINT "ScheduledAutomationTask_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "n8n_workflows" ADD CONSTRAINT "n8n_workflows_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_workflows" ADD CONSTRAINT "tenant_workflows_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "workflow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_workflows" ADD CONSTRAINT "tenant_workflows_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estudiante" ADD CONSTRAINT "Estudiante_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_catalogoItemId_fkey" FOREIGN KEY ("catalogoItemId") REFERENCES "catalogo_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modulo" ADD CONSTRAINT "Modulo_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leccion" ADD CONSTRAINT "Leccion_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "Modulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leccion" ADD CONSTRAINT "Leccion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leccion" ADD CONSTRAINT "Leccion_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscripcion" ADD CONSTRAINT "Inscripcion_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgresoLeccion" ADD CONSTRAINT "ProgresoLeccion_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgresoLeccion" ADD CONSTRAINT "ProgresoLeccion_leccionId_fkey" FOREIGN KEY ("leccionId") REFERENCES "Leccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificado" ADD CONSTRAINT "Certificado_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificado" ADD CONSTRAINT "Certificado_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pregunta" ADD CONSTRAINT "Pregunta_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoQuiz" ADD CONSTRAINT "IntentoQuiz_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoQuiz" ADD CONSTRAINT "IntentoQuiz_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaEstudiante" ADD CONSTRAINT "RespuestaEstudiante_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "IntentoQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaEstudiante" ADD CONSTRAINT "RespuestaEstudiante_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregaTarea" ADD CONSTRAINT "EntregaTarea_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregaTarea" ADD CONSTRAINT "EntregaTarea_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_comentarioPadreId_fkey" FOREIGN KEY ("comentarioPadreId") REFERENCES "Comentario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_leccionId_fkey" FOREIGN KEY ("leccionId") REFERENCES "Leccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bundle" ADD CONSTRAINT "Bundle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleCurso" ADD CONSTRAINT "BundleCurso_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleCurso" ADD CONSTRAINT "BundleCurso_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Estudiante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreHistory" ADD CONSTRAINT "ScoreHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetrics" ADD CONSTRAINT "CampaignMetrics_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_asignadoA_fkey" FOREIGN KEY ("asignadoA") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_creadoPor_fkey" FOREIGN KEY ("creadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_creadoPor_fkey" FOREIGN KEY ("creadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_creadoPor_fkey" FOREIGN KEY ("creadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_components" ADD CONSTRAINT "page_components_creadoPor_fkey" FOREIGN KEY ("creadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_features" ADD CONSTRAINT "tenant_features_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_integrations" ADD CONSTRAINT "google_calendar_integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_integrations" ADD CONSTRAINT "google_calendar_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_webhooks" ADD CONSTRAINT "incoming_webhooks_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_webhooks" ADD CONSTRAINT "incoming_webhooks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_webhooks" ADD CONSTRAINT "incoming_webhooks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_webhook_deliveries" ADD CONSTRAINT "incoming_webhook_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_webhook_deliveries" ADD CONSTRAINT "incoming_webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "incoming_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_lead_searches" ADD CONSTRAINT "external_lead_searches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_usuarioAsignadoId_fkey" FOREIGN KEY ("usuarioAsignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_campanaId_fkey" FOREIGN KEY ("campanaId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_attachments" ADD CONSTRAINT "deal_attachments_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_attachments" ADD CONSTRAINT "deal_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_attachments" ADD CONSTRAINT "deal_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_emisorId_fkey" FOREIGN KEY ("emisorId") REFERENCES "configuracion_fiscal_emisor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_catalogoItemId_fkey" FOREIGN KEY ("catalogoItemId") REFERENCES "catalogo_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_tasaImpuestoId_fkey" FOREIGN KEY ("tasaImpuestoId") REFERENCES "tasas_impuesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_emisorId_fkey" FOREIGN KEY ("emisorId") REFERENCES "configuracion_fiscal_emisor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_firmadoPorUserId_fkey" FOREIGN KEY ("firmadoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_items" ADD CONSTRAINT "contrato_items_catalogoItemId_fkey" FOREIGN KEY ("catalogoItemId") REFERENCES "catalogo_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_items" ADD CONSTRAINT "contrato_items_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_items" ADD CONSTRAINT "contrato_items_tasaImpuestoId_fkey" FOREIGN KEY ("tasaImpuestoId") REFERENCES "tasas_impuesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_pagos" ADD CONSTRAINT "contrato_pagos_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_pagos" ADD CONSTRAINT "contrato_pagos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metas_venta" ADD CONSTRAINT "metas_venta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metas_venta" ADD CONSTRAINT "metas_venta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_audienciaId_fkey" FOREIGN KEY ("audienciaId") REFERENCES "audiences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campanaId_fkey" FOREIGN KEY ("campanaId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_results" ADD CONSTRAINT "ab_test_results_campanaId_fkey" FOREIGN KEY ("campanaId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_results" ADD CONSTRAINT "ab_test_results_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unsubscribe_list" ADD CONSTRAINT "unsubscribe_list_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unsubscribe_list" ADD CONSTRAINT "unsubscribe_list_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anytimebot_integrations" ADD CONSTRAINT "anytimebot_integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_webhooks" ADD CONSTRAINT "outgoing_webhooks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_webhooks" ADD CONSTRAINT "outgoing_webhooks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_webhook_deliveries" ADD CONSTRAINT "outgoing_webhook_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_webhook_deliveries" ADD CONSTRAINT "outgoing_webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "outgoing_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_cards" ADD CONSTRAINT "digital_cards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_cards" ADD CONSTRAINT "digital_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanned_cards" ADD CONSTRAINT "scanned_cards_digitalCardId_fkey" FOREIGN KEY ("digitalCardId") REFERENCES "digital_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanned_cards" ADD CONSTRAINT "scanned_cards_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanned_cards" ADD CONSTRAINT "scanned_cards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plaudern_integrations" ADD CONSTRAINT "plaudern_integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plaudern_integrations" ADD CONSTRAINT "plaudern_integrations_usuarioAsignadoId_fkey" FOREIGN KEY ("usuarioAsignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasas_impuesto" ADD CONSTRAINT "tasas_impuesto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo_items" ADD CONSTRAINT "catalogo_items_tasaImpuestoId_fkey" FOREIGN KEY ("tasaImpuestoId") REFERENCES "tasas_impuesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo_items" ADD CONSTRAINT "catalogo_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo_field_definitions" ADD CONSTRAINT "catalogo_field_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_fiscal_emisor" ADD CONSTRAINT "configuracion_fiscal_emisor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_fiscal_cliente" ADD CONSTRAINT "perfil_fiscal_cliente_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_fiscal_cliente" ADD CONSTRAINT "perfil_fiscal_cliente_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_fiscal_cliente" ADD CONSTRAINT "perfil_fiscal_cliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_venta" ADD CONSTRAINT "ordenes_venta_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_venta" ADD CONSTRAINT "ordenes_venta_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_venta" ADD CONSTRAINT "ordenes_venta_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_venta" ADD CONSTRAINT "ordenes_venta_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_venta" ADD CONSTRAINT "ordenes_venta_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_venta" ADD CONSTRAINT "ordenes_venta_emisorId_fkey" FOREIGN KEY ("emisorId") REFERENCES "configuracion_fiscal_emisor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_venta" ADD CONSTRAINT "ordenes_venta_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_venta" ADD CONSTRAINT "ordenes_venta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_venta" ADD CONSTRAINT "ordenes_venta_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_venta_items" ADD CONSTRAINT "orden_venta_items_catalogoItemId_fkey" FOREIGN KEY ("catalogoItemId") REFERENCES "catalogo_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_venta_items" ADD CONSTRAINT "orden_venta_items_ordenVentaId_fkey" FOREIGN KEY ("ordenVentaId") REFERENCES "ordenes_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_venta_items" ADD CONSTRAINT "orden_venta_items_tasaImpuestoId_fkey" FOREIGN KEY ("tasaImpuestoId") REFERENCES "tasas_impuesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotConfig" ADD CONSTRAINT "ChatbotConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_hub_config" ADD CONSTRAINT "messaging_hub_config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_domains" ADD CONSTRAINT "business_domains_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_email_accounts" ADD CONSTRAINT "business_email_accounts_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "business_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_signature_settings" ADD CONSTRAINT "client_signature_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_audit_events" ADD CONSTRAINT "signature_audit_events_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "signature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPlatformConfig" ADD CONSTRAINT "SocialPlatformConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
