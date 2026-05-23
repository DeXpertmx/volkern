/**
 * OpenAPI 3.0 Specification — Volkern CRM API
 *
 * Documenta los endpoints más usados del CRM. Basado en los schemas Zod de
 * lib/validation/schemas/. Para ver la documentación interactiva, visita /api/docs
 * después de arrancar el servidor.
 *
 * Extender: agregar nuevas rutas en `paths` y schemas en `components.schemas`.
 */

const VOLKERN_API_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Volkern CRM API',
    version: '1.0.0',
    description:
      'API principal del CRM Volkern. Gestiona leads, contactos, citas, deals, facturación, chatbot, MCP y más.\n\n' +
      '**Autenticación:** API Key via header `x-api-key` o `Authorization: Bearer <key>`.\n\n' +
      '**Multi-tenancy:** La API key determina el tenant. Todas las consultas están aisladas por tenant.',
    contact: { name: 'Volkern Team', email: 'dev@volkern.com' },
    license: { name: 'Propietario' },
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Desarrollo local' },
    { url: 'https://api.volkern.com', description: 'Producción' },
  ],
  tags: [
    { name: 'Auth', description: 'Autenticación y sesiones' },
    { name: 'Health', description: 'Health check y readiness' },
    { name: 'Leads', description: 'Gestión de leads/prospectos' },
    { name: 'Contacts', description: 'Gestión de contactos' },
    { name: 'Citas', description: 'Agendamiento de citas/reuniones' },
    { name: 'Deals', description: 'Pipeline de ventas (deals)' },
    { name: 'Tasks', description: 'Tareas y seguimiento' },
    { name: 'AI', description: 'Inteligencia artificial y chatbot' },
    { name: 'Chatbot', description: 'Widget de chatbot embebible' },
    { name: 'MCP', description: 'Model Context Protocol server' },
    { name: 'ERP', description: 'Operaciones ERP (proyectos, inventario, etc.)' },
    { name: 'Marketing', description: 'Campañas y generación de contenido IA' },
    { name: 'Webhooks', description: 'Webhooks externos (Stripe, Telegram, etc.)' },
    { name: 'Users', description: 'Gestión de usuarios' },
    { name: 'Facturas', description: 'Facturación, contratos y cotizaciones' },
    { name: 'Admin', description: 'Administración multi-tenant' },
    { name: 'Academy', description: 'Cursos, quizzes y estudiantes' },
    { name: 'Automations', description: 'Automatizaciones y reglas de negocio' },
    { name: 'CMS', description: 'Gestión de contenido web (Puck)' },
    { name: 'Settings', description: 'Configuración del sistema' },
    { name: 'Inventory', description: 'Catálogo e inventario' },
    { name: 'Events', description: 'Gestión de eventos' },
    { name: 'Notifications', description: 'Notificaciones y alertas' },
    { name: 'Integraciones', description: 'Integraciones externas (Twilio, WhatsApp, Telegram, etc.)' },
    { name: 'Finance', description: 'Finanzas (Stripe MX, Zadarma, telefonía)' },
    { name: 'Equality', description: 'Igualdad y denuncias' },
    { name: 'Support', description: 'Tickets de soporte' },
    { name: 'Portal', description: 'Portal del cliente' },
    { name: 'Upload', description: 'Subida de archivos' },
    { name: 'Agency', description: 'Configuración de agencia' },
    { name: 'Skills', description: 'Skills de agente IA' },
    { name: 'Messaging', description: 'Mensajería y conversaciones' },
  ],
  components: {
    securitySchemes: {
      ApiKeyHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'API key del tenant (obtenida en Dashboard → Configuración → API)',
      },
      ApiKeyBearer: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key como Bearer token',
      },
    },
    schemas: {
      // ─── Genéricos ───
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Mensaje de error legible' },
          details: { type: 'object', description: 'Detalles estructurados del error' },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Datos inválidos' },
          details: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
            example: { nombre: ['Nombre requerido'], email: ['Email inválido'] },
          },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 25, maximum: 100 },
          total: { type: 'integer' },
        },
      },

      // ─── Lead ───
      Lead: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID único (cuid)' },
          nombre: { type: 'string', minLength: 1, maxLength: 255 },
          email: { type: 'string', format: 'email' },
          telefono: { type: 'string', nullable: true },
          empresa: { type: 'string', nullable: true },
          cargo: { type: 'string', nullable: true },
          ubicacion: { type: 'string', nullable: true },
          linkedin: { type: 'string', format: 'uri', nullable: true },
          notas: { type: 'string', nullable: true },
          fuente: { type: 'string', nullable: true },
          etapa: { type: 'string', nullable: true },
          scoreValue: { type: 'integer', nullable: true },
          tags: { type: 'string', nullable: true },
          tenantId: { type: 'string' },
          fechaCreacion: { type: 'string', format: 'date-time' },
          fechaActualizacion: { type: 'string', format: 'date-time' },
        },
      },
      LeadCreateInput: {
        type: 'object',
        required: ['nombre', 'email'],
        properties: {
          nombre: { type: 'string', minLength: 1, maxLength: 255, example: 'María García' },
          email: { type: 'string', format: 'email', example: 'maria@example.com' },
          telefono: { type: 'string', example: '+34600123456' },
          empresa: { type: 'string' },
          cargo: { type: 'string' },
          ubicacion: { type: 'string' },
          linkedin: { type: 'string', format: 'uri' },
          notas: { type: 'string' },
          fuente: { type: 'string' },
          etapa: { type: 'string' },
          tags: { type: 'string' },
        },
      },

      // ─── Contact ───
      Contact: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nombre: { type: 'string', minLength: 1, maxLength: 255 },
          email: { type: 'string', format: 'email' },
          telefono: { type: 'string', nullable: true },
          tipo: { type: 'string', enum: ['person', 'company'] },
          cargo: { type: 'string', nullable: true },
          ubicacion: { type: 'string', nullable: true },
          linkedin: { type: 'string', format: 'uri', nullable: true },
          notas: { type: 'string', nullable: true },
          tags: { type: 'string', nullable: true },
          companyId: { type: 'string', nullable: true },
          tenantId: { type: 'string' },
          fechaCreacion: { type: 'string', format: 'date-time' },
          fechaActualizacion: { type: 'string', format: 'date-time' },
          company: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              nombre: { type: 'string' },
            },
          },
          _count: {
            type: 'object',
            properties: {
              deals: { type: 'integer' },
              persons: { type: 'integer' },
            },
          },
        },
      },
      ContactCreateInput: {
        type: 'object',
        required: ['nombre', 'email'],
        properties: {
          nombre: { type: 'string', minLength: 1, maxLength: 255, example: 'Juan Pérez' },
          email: { type: 'string', format: 'email', example: 'juan@example.com' },
          telefono: { type: 'string' },
          tipo: { type: 'string', enum: ['person', 'company'], default: 'person' },
          companyId: { type: 'string' },
          cargo: { type: 'string' },
          ubicacion: { type: 'string' },
          linkedin: { type: 'string', format: 'uri' },
          notas: { type: 'string' },
          tags: { type: 'string' },
        },
      },

      // ─── Cita ───
      Cita: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tipo: { type: 'string', enum: ['reunion', 'llamada', 'presencial', 'otro'] },
          titulo: { type: 'string' },
          descripcion: { type: 'string', nullable: true },
          ubicacion: { type: 'string', nullable: true },
          linkReunion: { type: 'string', format: 'uri', nullable: true },
          fechaHora: { type: 'string', format: 'date-time' },
          duracion: { type: 'integer', description: 'Duración en minutos', minimum: 5, maximum: 480 },
          estado: { type: 'string', enum: ['pendiente', 'confirmada', 'cancelada', 'completada'] },
          tenantId: { type: 'string' },
          leadId: { type: 'string', nullable: true },
          contactId: { type: 'string', nullable: true },
          servicioId: { type: 'string', nullable: true },
          lead: { $ref: '#/components/schemas/Lead' },
          servicio: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              nombre: { type: 'string' },
              descripcion: { type: 'string' },
              precio: { type: 'number' },
              moneda: { type: 'string' },
              duracionMinutos: { type: 'integer' },
            },
          },
        },
      },
      CitaCreateInput: {
        type: 'object',
        required: ['fechaHora'],
        properties: {
          leadId: { type: 'string' },
          contactId: { type: 'string' },
          servicioId: { type: 'string' },
          catalogoItemId: { type: 'string' },
          tipo: { type: 'string', enum: ['reunion', 'llamada', 'presencial', 'otro'], default: 'reunion' },
          titulo: { type: 'string', example: 'Demo del producto' },
          descripcion: { type: 'string' },
          ubicacion: { type: 'string' },
          linkReunion: { type: 'string', format: 'uri' },
          tipoLinkReunion: { type: 'string', enum: ['ninguno', 'generar', 'pegar'], default: 'ninguno' },
          linkReunionPegado: { type: 'string', format: 'uri' },
          fechaHora: { type: 'string', format: 'date-time', example: '2026-06-01T10:00:00Z' },
          duracion: { type: 'integer', minimum: 5, maximum: 480, default: 60 },
          estado: { type: 'string', enum: ['pendiente', 'confirmada', 'cancelada', 'completada'], default: 'pendiente' },
          bufferMinutos: { type: 'integer', minimum: 0, maximum: 120 },
          avisoMinimo: { type: 'integer', minimum: 0 },
        },
      },

      // ─── Deal ───
      Deal: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          titulo: { type: 'string' },
          descripcion: { type: 'string', nullable: true },
          valor: { type: 'number', minimum: 0 },
          moneda: { type: 'string', minLength: 3, maxLength: 3, example: 'EUR' },
          etapa: { type: 'string' },
          probabilidad: { type: 'integer', minimum: 0, maximum: 100 },
          prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'urgente'] },
          estado: { type: 'string', enum: ['activo', 'ganado', 'perdido', 'pausado'] },
          fechaEstimadaCierre: { type: 'string', format: 'date-time', nullable: true },
          fechaCierre: { type: 'string', format: 'date-time', nullable: true },
          origen: { type: 'string', nullable: true },
          tags: { type: 'string', nullable: true },
          tenantId: { type: 'string' },
          leadId: { type: 'string', nullable: true },
          contactId: { type: 'string', nullable: true },
          usuarioAsignadoId: { type: 'string', nullable: true },
          lead: { type: 'object', nullable: true },
          contact: { type: 'object', nullable: true },
          usuarioAsignado: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
          _count: {
            type: 'object',
            properties: {
              cotizaciones: { type: 'integer' },
              actividades: { type: 'integer' },
            },
          },
        },
      },
      DealCreateInput: {
        type: 'object',
        required: ['titulo', 'valor'],
        properties: {
          leadId: { type: 'string' },
          contactId: { type: 'string' },
          titulo: { type: 'string', minLength: 1, maxLength: 500, example: 'Licencia Enterprise Q3' },
          descripcion: { type: 'string' },
          valor: { type: 'number', minimum: 0, example: 15000 },
          moneda: { type: 'string', minLength: 3, maxLength: 3, default: 'EUR' },
          etapa: { type: 'string', default: 'calificacion' },
          probabilidad: { type: 'integer', minimum: 0, maximum: 100, default: 25 },
          prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'urgente'], default: 'media' },
          fechaEstimadaCierre: { type: 'string', format: 'date-time' },
          origen: { type: 'string' },
          tags: { type: 'string' },
          usuarioAsignadoId: { type: 'string' },
        },
      },
      DealMetrics: {
        type: 'object',
        properties: {
          totalDeals: { type: 'integer' },
          totalValor: { type: 'number' },
          valorPonderado: { type: 'number' },
          gapAnalysis: { type: 'number' },
          porEtapa: { type: 'object', additionalProperties: { type: 'integer' } },
          porEstado: { type: 'object', additionalProperties: { type: 'integer' } },
        },
      },

      // ─── Health ───
      HealthStatus: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
          database: { type: 'string', enum: ['connected', 'disconnected'] },
          redis: { type: 'string', enum: ['connected', 'disconnected', 'not_configured'] },
          uptime: { type: 'number', description: 'Segundos desde que arrancó el servidor' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },

      // ─── AI ───
      AiRequest: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1, example: 'Genera un email de seguimiento para un lead interesado en el plan Pro' },
          context: { type: 'object', description: 'Contexto adicional para el modelo' },
          temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.7 },
          maxTokens: { type: 'integer', minimum: 1, maximum: 4096 },
        },
      },
      AiResponse: {
        type: 'object',
        properties: {
          result: { type: 'string', description: 'Respuesta generada por la IA' },
          model: { type: 'string', description: 'Modelo utilizado' },
          tokensUsed: { type: 'integer' },
        },
      },

      // ─── Chatbot ───
      ChatbotMessage: {
        type: 'object',
        required: ['message', 'tenantId'],
        properties: {
          message: { type: 'string', minLength: 1, example: '¿Cuántos leads tengo este mes?' },
          tenantId: { type: 'string', description: 'ID del tenant' },
          sessionId: { type: 'string', description: 'ID de sesión para mantener contexto' },
          language: { type: 'string', default: 'es', example: 'es' },
        },
      },
      ChatbotResponse: {
        type: 'object',
        properties: {
          reply: { type: 'string', description: 'Respuesta del chatbot' },
          intent: { type: 'string', description: 'Intención detectada' },
          data: { type: 'object', description: 'Datos estructurados (si aplica)' },
          action: { type: 'string', description: 'Acción sugerida' },
        },
      },

      // ─── MCP ───
      McpRequest: {
        type: 'object',
        required: ['method', 'params'],
        properties: {
          method: { type: 'string', enum: ['tools/list', 'tools/call'], example: 'tools/call' },
          params: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', example: 'buscar_lead' },
              arguments: { type: 'object', description: 'Argumentos de la tool' },
            },
          },
        },
      },
      McpToolList: {
        type: 'object',
        properties: {
          tools: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                inputSchema: { type: 'object' },
              },
            },
          },
        },
      },

      // ─── Task ───
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tipo: { type: 'string' },
          titulo: { type: 'string' },
          descripcion: { type: 'string', nullable: true },
          estado: { type: 'string', enum: ['pendiente', 'en_progreso', 'completada', 'cancelada'] },
          prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'urgente'] },
          fechaVencimiento: { type: 'string', format: 'date-time', nullable: true },
          asignadoA: { type: 'string', nullable: true },
          tenantId: { type: 'string' },
          fechaCreacion: { type: 'string', format: 'date-time' },
        },
      },
      TaskCreateInput: {
        type: 'object',
        required: ['tipo', 'titulo'],
        properties: {
          tipo: { type: 'string', minLength: 1, maxLength: 100, example: 'seguimiento' },
          titulo: { type: 'string', minLength: 1, maxLength: 500, example: 'Llamar a María para seguimiento' },
          descripcion: { type: 'string' },
          fechaVencimiento: { type: 'string', format: 'date-time' },
          prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'urgente'], default: 'media' },
          asignadoA: { type: 'string' },
          leadId: { type: 'string' },
          contactId: { type: 'string' },
          dealId: { type: 'string' },
        },
      },

      // ─── User ───
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', nullable: true },
          tenantSubdomain: { type: 'string', nullable: true },
          image: { type: 'string', format: 'uri', nullable: true },
          configuracion: { type: 'object', nullable: true },
        },
      },

      // ─── Marketing ───
      MarketingAiRequest: {
        type: 'object',
        required: ['prompt', 'platform'],
        properties: {
          prompt: { type: 'string', minLength: 1, example: 'Escribe un email promocional para el plan Premium' },
          platform: { type: 'string', enum: ['email', 'whatsapp', 'telegram', 'sms', 'linkedin', 'facebook', 'instagram', 'twitter'], example: 'email' },
          tone: { type: 'string', enum: ['professional', 'casual', 'friendly', 'urgent'], default: 'professional' },
          targetAudience: { type: 'string' },
          language: { type: 'string', default: 'es' },
        },
      },
      MarketingAiResponse: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Contenido generado' },
          platform: { type: 'string' },
          metadata: { type: 'object' },
        },
      },

      // ─── ERP Project ───
      ErpProject: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nombre: { type: 'string' },
          descripcion: { type: 'string', nullable: true },
          estado: { type: 'string' },
          fechaInicio: { type: 'string', format: 'date-time', nullable: true },
          fechaFinEstimada: { type: 'string', format: 'date-time', nullable: true },
          tenantId: { type: 'string' },
        },
      },

      // ─── Stripe Webhook Event ───
      StripeEvent: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID del evento de Stripe' },
          type: { type: 'string', description: 'Tipo de evento (e.g. invoice.paid)' },
          data: { type: 'object', description: 'Payload del evento' },
        },
      },
    },
  },
  paths: {
    // ═══════════════════════════════════════════
    // AUTH
    // ═══════════════════════════════════════════
    '/api/auth/[...nextauth]': {
      post: {
        tags: ['Auth'],
        summary: 'Iniciar sesión / callback OAuth',
        description: 'Endpoint de NextAuth.js. Soporta múltiples providers (Google, email, etc.).',
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object' },
              example: { email: 'user@volkern.com', callbackUrl: '/dashboard' },
            },
          },
        },
        responses: {
          '200': { description: 'Sesión iniciada correctamente' },
          '401': { description: 'Credenciales inválidas', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ═══════════════════════════════════════════
    // HEALTH
    // ═══════════════════════════════════════════
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check del sistema',
        description: 'Verifica conectividad con base de datos, Redis, y devuelve uptime. Público (sin autenticación).',
        security: [],
        responses: {
          '200': {
            description: 'Sistema saludable o degradado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthStatus' } } },
          },
          '503': {
            description: 'Sistema no saludable (DB caída)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthStatus' } } },
          },
        },
      },
    },

    // ═══════════════════════════════════════════
    // LEADS
    // ═══════════════════════════════════════════
    '/api/leads': {
      get: {
        tags: ['Leads'],
        summary: 'Listar leads',
        description: 'Devuelve la lista de leads del tenant autenticado, con filtros opcionales.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        parameters: [
          { name: 'etapa', in: 'query', schema: { type: 'string' }, description: 'Filtrar por etapa' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Búsqueda por nombre/email' },
          { name: 'fuente', in: 'query', schema: { type: 'string' }, description: 'Filtrar por fuente' },
          { name: 'usuarioAsignadoId', in: 'query', schema: { type: 'string' }, description: 'Filtrar por asignado' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 25, maximum: 100 } },
        ],
        responses: {
          '200': {
            description: 'Lista de leads',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    leads: { type: 'array', items: { $ref: '#/components/schemas/Lead' } },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                  },
                },
              },
            },
          },
          '401': { description: 'No autenticado' },
          '403': { description: 'Sin permisos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        tags: ['Leads'],
        summary: 'Crear lead',
        description: 'Crea un nuevo lead en el tenant autenticado.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadCreateInput' } } },
        },
        responses: {
          '201': {
            description: 'Lead creado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Lead' } } },
          },
          '400': { description: 'Datos inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
          '401': { description: 'No autenticado' },
          '403': { description: 'Sin permisos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // CONTACTS
    // ═══════════════════════════════════════════
    '/api/contacts': {
      get: {
        tags: ['Contacts'],
        summary: 'Listar contactos',
        description: 'Devuelve los contactos del tenant, con filtros por tipo, búsqueda y sinEmpresa.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        parameters: [
          { name: 'tipo', in: 'query', schema: { type: 'string', enum: ['person', 'company'] } },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Búsqueda por nombre/email' },
          { name: 'sinEmpresa', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Filtrar contactos sin empresa' },
        ],
        responses: {
          '200': {
            description: 'Lista de contactos',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Contact' } },
              },
            },
          },
          '401': { description: 'No autenticado' },
        },
      },
      post: {
        tags: ['Contacts'],
        summary: 'Crear contacto',
        description: 'Crea un nuevo contacto (persona o empresa) en el tenant.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ContactCreateInput' } } },
        },
        responses: {
          '201': { description: 'Contacto creado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Contact' } } } },
          '400': { description: 'Datos inválidos / email duplicado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'No autenticado' },
          '403': { description: 'Sin permisos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // CITAS
    // ═══════════════════════════════════════════
    '/api/citas': {
      get: {
        tags: ['Citas'],
        summary: 'Listar citas',
        description: 'Devuelve las citas del tenant con filtros por estado, tipo, fecha o rango de fechas.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        parameters: [
          { name: 'estado', in: 'query', schema: { type: 'string', enum: ['pendiente', 'confirmada', 'cancelada', 'completada'] } },
          { name: 'tipo', in: 'query', schema: { type: 'string', enum: ['reunion', 'llamada', 'presencial', 'otro'] } },
          { name: 'fecha', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filtrar por día específico (YYYY-MM-DD)' },
          { name: 'fechaInicio', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Inicio de rango' },
          { name: 'fechaFin', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Fin de rango' },
        ],
        responses: {
          '200': {
            description: 'Lista de citas',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Cita' } },
              },
            },
          },
          '500': { description: 'Error del servidor', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        tags: ['Citas'],
        summary: 'Crear cita',
        description:
          'Crea una nueva cita con validación de conflictos de horario. Opcionalmente envía confirmación por email, sincroniza con Google Calendar y notifica por Telegram.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CitaCreateInput' } } },
        },
        responses: {
          '200': {
            description: 'Cita creada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    cita: { $ref: '#/components/schemas/Cita' },
                  },
                },
              },
            },
          },
          '400': { description: 'Datos inválidos / cita en el pasado / aviso mínimo no cumplido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '409': { description: 'Conflicto de horario', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '500': { description: 'Error del servidor', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ═══════════════════════════════════════════
    // DEALS
    // ═══════════════════════════════════════════
    '/api/deals': {
      get: {
        tags: ['Deals'],
        summary: 'Listar deals (pipeline)',
        description: 'Devuelve los deals del tenant con métricas agregadas (total, ponderado, por etapa, por estado).',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        parameters: [
          { name: 'etapa', in: 'query', schema: { type: 'string' }, description: 'Filtrar por etapa' },
          { name: 'estado', in: 'query', schema: { type: 'string', enum: ['activo', 'ganado', 'perdido', 'pausado'] } },
          { name: 'usuarioAsignadoId', in: 'query', schema: { type: 'string' } },
          { name: 'leadId', in: 'query', schema: { type: 'string' } },
          { name: 'contactId', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Búsqueda por título/descripción' },
        ],
        responses: {
          '200': {
            description: 'Lista de deals con métricas',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    deals: { type: 'array', items: { $ref: '#/components/schemas/Deal' } },
                    metrics: { $ref: '#/components/schemas/DealMetrics' },
                  },
                },
              },
            },
          },
          '403': { description: 'Sin permisos' },
        },
      },
      post: {
        tags: ['Deals'],
        summary: 'Crear deal',
        description: 'Crea un nuevo deal en el pipeline de ventas. Puede incluir creación inline de contacto.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DealCreateInput' } } },
        },
        responses: {
          '201': {
            description: 'Deal creado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { deal: { $ref: '#/components/schemas/Deal' } },
                },
              },
            },
          },
          '400': { description: 'Datos inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
          '403': { description: 'Sin permisos' },
          '500': { description: 'Error del servidor', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ═══════════════════════════════════════════
    // TASKS
    // ═══════════════════════════════════════════
    '/api/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'Listar tareas',
        description: 'Devuelve las tareas del tenant con filtros por estado, prioridad y asignado.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        parameters: [
          { name: 'estado', in: 'query', schema: { type: 'string', enum: ['pendiente', 'en_progreso', 'completada', 'cancelada'] } },
          { name: 'prioridad', in: 'query', schema: { type: 'string', enum: ['baja', 'media', 'alta', 'urgente'] } },
          { name: 'asignadoA', in: 'query', schema: { type: 'string' } },
          { name: 'leadId', in: 'query', schema: { type: 'string' } },
          { name: 'dealId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Lista de tareas',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Task' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Tasks'],
        summary: 'Crear tarea',
        description: 'Crea una nueva tarea, opcionalmente asociada a un lead, contacto o deal.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskCreateInput' } } },
        },
        responses: {
          '201': { description: 'Tarea creada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } } },
          '400': { description: 'Datos inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ═══════════════════════════════════════════
    // AI
    // ═══════════════════════════════════════════
    '/api/ai': {
      post: {
        tags: ['AI'],
        summary: 'Consultar IA generativa',
        description: 'Envía un prompt al modelo de IA (DeepSeek v4 con fallback a Gemini 2.5 Flash via OpenRouter).',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AiRequest' } } },
        },
        responses: {
          '200': {
            description: 'Respuesta de la IA',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AiResponse' } } },
          },
          '400': { description: 'Prompt vacío o inválido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Rate limit excedido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '500': { description: 'Error del modelo', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ═══════════════════════════════════════════
    // CHATBOT
    // ═══════════════════════════════════════════
    '/api/chatbot/widget': {
      post: {
        tags: ['Chatbot'],
        summary: 'Widget de chatbot',
        description:
          'Endpoint público para el widget de chatbot embebible. Procesa mensajes en lenguaje natural y devuelve respuestas contextuales. Soporta 50+ intenciones CRM/ERP.',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChatbotMessage' } } },
        },
        responses: {
          '200': {
            description: 'Respuesta del chatbot',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ChatbotResponse' } } },
          },
          '400': { description: 'Mensaje vacío o tenantId faltante', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Rate limit excedido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ═══════════════════════════════════════════
    // MCP
    // ═══════════════════════════════════════════
    '/api/mcp': {
      post: {
        tags: ['MCP'],
        summary: 'Model Context Protocol (MCP)',
        description:
          'Servidor MCP que expone tools del CRM para agentes de IA externos. Soporta `tools/list` y `tools/call`. Requiere API key de MCP específica.',
        security: [{ ApiKeyHeader: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/McpRequest' } } },
        },
        responses: {
          '200': {
            description: 'Resultado de la operación MCP',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/McpToolList' },
                    {
                      type: 'object',
                      properties: {
                        content: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              type: { type: 'string' },
                              text: { type: 'string' },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '401': { description: 'API key inválida o faltante' },
          '429': { description: 'Rate limit excedido' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // ERP PROJECTS
    // ═══════════════════════════════════════════
    '/api/erp/projects': {
      get: {
        tags: ['ERP'],
        summary: 'Listar proyectos ERP',
        description: 'Devuelve los proyectos del módulo ERP con filtros por estado y búsqueda.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        parameters: [
          { name: 'estado', in: 'query', schema: { type: 'string' }, description: 'Filtrar por estado del proyecto' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Búsqueda por nombre' },
        ],
        responses: {
          '200': {
            description: 'Lista de proyectos',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/ErpProject' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['ERP'],
        summary: 'Crear proyecto ERP',
        description: 'Crea un nuevo proyecto en el módulo ERP.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nombre'],
                properties: {
                  nombre: { type: 'string', minLength: 1, maxLength: 255 },
                  descripcion: { type: 'string' },
                  fechaInicio: { type: 'string', format: 'date-time' },
                  fechaFinEstimada: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Proyecto creado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErpProject' } } } },
          '400': { description: 'Datos inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ═══════════════════════════════════════════
    // MARKETING AI
    // ═══════════════════════════════════════════
    '/api/marketing/ai/generate': {
      post: {
        tags: ['Marketing'],
        summary: 'Generar contenido de marketing con IA',
        description: 'Genera copy de marketing optimizado para la plataforma especificada usando IA generativa.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MarketingAiRequest' } } },
        },
        responses: {
          '200': {
            description: 'Contenido generado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MarketingAiResponse' } } },
          },
          '400': { description: 'Prompt o plataforma inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '500': { description: 'Error del modelo', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ═══════════════════════════════════════════
    // USERS
    // ═══════════════════════════════════════════
    '/api/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Obtener perfil del usuario autenticado',
        description: 'Devuelve la información del perfil del usuario que hizo la request.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': {
            description: 'Perfil del usuario',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UserProfile' } } },
          },
          '401': { description: 'No autenticado' },
        },
      },
      patch: {
        tags: ['Users'],
        summary: 'Actualizar perfil del usuario',
        description: 'Actualiza campos del perfil del usuario autenticado.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  configuracion: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Perfil actualizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserProfile' } } } },
          '400': { description: 'Datos inválidos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // WEBHOOKS — STRIPE
    // ═══════════════════════════════════════════
    '/api/webhooks/stripe': {
      post: {
        tags: ['Webhooks'],
        summary: 'Webhook de Stripe',
        description:
          'Recibe eventos de Stripe (pagos, suscripciones, facturas). Procesa `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, etc. Verifica firma con webhook secret.',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StripeEvent' } } },
        },
        responses: {
          '200': { description: 'Evento recibido y procesado', content: { 'application/json': { schema: { type: 'object', properties: { received: { type: 'boolean' } } } } } },
          '400': { description: 'Firma inválida o evento no soportado' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // FACTURAS — INVOICES
    // ═══════════════════════════════════════════
    '/api/facturas': {
      get: {
        tags: ['Facturas'],
        summary: 'Listar facturas',
        description: 'Devuelve las facturas del tenant con filtros por estado, cliente y fechas.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        parameters: [
          { name: 'estado', in: 'query', schema: { type: 'string' }, description: 'Filtrar por estado (pendiente, pagada, vencida, cancelada)' },
          { name: 'clienteId', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 25, maximum: 100 } },
        ],
        responses: {
          '200': { description: 'Lista de facturas paginada' },
          '401': { description: 'No autenticado' },
          '403': { description: 'Sin permisos' },
        },
      },
      post: {
        tags: ['Facturas'],
        summary: 'Crear factura',
        description: 'Crea una nueva factura con líneas de ítem, impuestos y retenciones.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Facturas_FacturaCreate' } } },
        },
        responses: {
          '201': { description: 'Factura creada' },
          '400': { description: 'Datos inválidos' },
          '401': { description: 'No autenticado' },
        },
      },
    },
    '/api/cotizaciones': {
      get: {
        tags: ['Facturas'],
        summary: 'Listar cotizaciones',
        description: 'Devuelve las cotizaciones/presupuestos del tenant.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de cotizaciones' },
        },
      },
      post: {
        tags: ['Facturas'],
        summary: 'Crear cotización',
        description: 'Crea una nueva cotización que puede convertirse en factura u orden de venta.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Facturas_CotizacionCreate' } } },
        },
        responses: {
          '201': { description: 'Cotización creada' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },
    '/api/contratos': {
      get: {
        tags: ['Facturas'],
        summary: 'Listar contratos',
        description: 'Devuelve los contratos/abonos del tenant.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de contratos' },
        },
      },
      post: {
        tags: ['Facturas'],
        summary: 'Crear contrato',
        description: 'Crea un nuevo contrato con pagos recurrentes periódicos.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Facturas_ContratoCreate' } } },
        },
        responses: {
          '201': { description: 'Contrato creado' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════
    '/api/admin/tenants': {
      get: {
        tags: ['Admin'],
        summary: 'Listar tenants (admin)',
        description: 'Devuelve todos los tenants registrados. Solo accesible con rol admin.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de tenants' },
          '403': { description: 'Sin permisos de admin' },
        },
      },
      post: {
        tags: ['Admin'],
        summary: 'Crear tenant',
        description: 'Provisiona un nuevo tenant con su base de datos y configuración inicial.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Admin_TenantCreate' } } },
        },
        responses: {
          '201': { description: 'Tenant creado' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },
    '/api/admin/config': {
      get: {
        tags: ['Admin'],
        summary: 'Obtener configuración global',
        description: 'Devuelve la configuración global del sistema (whitelabel, branding, limites).',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Configuración global' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // ACADEMY
    // ═══════════════════════════════════════════
    '/api/cursos': {
      get: {
        tags: ['Academy'],
        summary: 'Listar cursos',
        description: 'Devuelve los cursos disponibles en la academia.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de cursos' },
        },
      },
      post: {
        tags: ['Academy'],
        summary: 'Crear curso',
        description: 'Crea un nuevo curso con módulos y lecciones.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '201': { description: 'Curso creado' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },
    '/api/quizzes': {
      get: {
        tags: ['Academy'],
        summary: 'Listar quizzes/exámenes',
        description: 'Devuelve los quizzes disponibles.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de quizzes' },
        },
      },
      post: {
        tags: ['Academy'],
        summary: 'Crear quiz',
        description: 'Crea un nuevo quiz con preguntas y respuestas.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '201': { description: 'Quiz creado' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },
    '/api/estudiantes': {
      get: {
        tags: ['Academy'],
        summary: 'Listar estudiantes',
        description: 'Devuelve los estudiantes inscritos en cursos.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de estudiantes' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // AUTOMATIONS
    // ═══════════════════════════════════════════
    '/api/automations/rules': {
      get: {
        tags: ['Automations'],
        summary: 'Listar reglas de automatización',
        description: 'Devuelve las reglas de automatización configuradas en el tenant.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de reglas' },
        },
      },
      post: {
        tags: ['Automations'],
        summary: 'Crear regla de automatización',
        description: 'Crea una nueva regla con condiciones y acciones.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Automation_RuleCreate' } } },
        },
        responses: {
          '201': { description: 'Regla creada' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },
    '/api/automations/triggers': {
      get: {
        tags: ['Automations'],
        summary: 'Listar triggers disponibles',
        description: 'Devuelve los triggers disponibles para crear reglas de automatización.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de triggers' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // CMS
    // ═══════════════════════════════════════════
    '/api/cms/pages': {
      get: {
        tags: ['CMS'],
        summary: 'Listar páginas CMS',
        description: 'Devuelve las páginas web creadas con el constructor visual Puck.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de páginas' },
        },
      },
      post: {
        tags: ['CMS'],
        summary: 'Crear página CMS',
        description: 'Crea una nueva página web con contenido Puck.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CMS_PageCreate' } } },
        },
        responses: {
          '201': { description: 'Página creada' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════════════
    '/api/configuracion/fiscal': {
      get: {
        tags: ['Settings'],
        summary: 'Obtener configuración fiscal',
        description: 'Devuelve la configuración fiscal del tenant (tasa de IVA, IRPF, perfiles de cliente).',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Configuración fiscal' },
        },
      },
      post: {
        tags: ['Settings'],
        summary: 'Actualizar configuración fiscal',
        description: 'Actualiza la configuración fiscal del tenant.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Configuración actualizada' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },
    '/api/config/disponibilidad': {
      get: {
        tags: ['Settings'],
        summary: 'Obtener disponibilidad horaria',
        description: 'Devuelve la disponibilidad horaria del tenant para agenda de citas.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Disponibilidad horaria' },
        },
      },
      post: {
        tags: ['Settings'],
        summary: 'Actualizar disponibilidad horaria',
        description: 'Actualiza la configuración de disponibilidad horaria semanal.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Settings_DisponibilidadUpdate' } } },
        },
        responses: {
          '200': { description: 'Disponibilidad actualizada' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // INVENTORY / CATÁLOGO
    // ═══════════════════════════════════════════
    '/api/catalogo/items': {
      get: {
        tags: ['Inventory'],
        summary: 'Listar items del catálogo',
        description: 'Devuelve los productos/servicios del catálogo del tenant.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        parameters: [
          { name: 'categoria', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 25, maximum: 100 } },
        ],
        responses: {
          '200': { description: 'Lista de items del catálogo' },
        },
      },
      post: {
        tags: ['Inventory'],
        summary: 'Crear item en catálogo',
        description: 'Añade un nuevo producto o servicio al catálogo.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Inventory_ItemCreate' } } },
        },
        responses: {
          '201': { description: 'Item creado' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },
    '/api/inventario/stock': {
      get: {
        tags: ['Inventory'],
        summary: 'Consultar stock',
        description: 'Devuelve el stock actual de productos en inventario.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Niveles de stock' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════
    '/api/events': {
      get: {
        tags: ['Events'],
        summary: 'Listar eventos',
        description: 'Devuelve los eventos del tenant (logs de actividad, eventos de sistema).',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de eventos' },
        },
      },
      post: {
        tags: ['Events'],
        summary: 'Registrar evento',
        description: 'Registra un nuevo evento en el sistema.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Events_EventCreate' } } },
        },
        responses: {
          '200': { description: 'Evento registrado' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // NOTIFICATIONS
    // ═══════════════════════════════════════════
    '/api/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Listar notificaciones',
        description: 'Devuelve las notificaciones del usuario autenticado.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de notificaciones' },
        },
      },
      post: {
        tags: ['Notifications'],
        summary: 'Enviar notificación',
        description: 'Envía una notificación a usuarios o canales configurados.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Notifications_NotificationSend' } } },
        },
        responses: {
          '200': { description: 'Notificación enviada' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // INTEGRACIONES
    // ═══════════════════════════════════════════
    '/api/integraciones': {
      get: {
        tags: ['Integraciones'],
        summary: 'Listar integraciones',
        description: 'Devuelve las integraciones configuradas del tenant.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de integraciones' },
        },
      },
      post: {
        tags: ['Integraciones'],
        summary: 'Crear/Configurar integración',
        description: 'Configura una nueva integración (Twilio, WhatsApp, Evolution, Telegram, etc.).',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Integraciones_IntegrationCreate' } } },
        },
        responses: {
          '201': { description: 'Integración configurada' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },
    '/api/integraciones/test': {
      post: {
        tags: ['Integraciones'],
        summary: 'Probar integración',
        description: 'Envía un mensaje de prueba a través de la integración configurada.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Integraciones_IntegrationTest' } } },
        },
        responses: {
          '200': { description: 'Prueba exitosa' },
          '400': { description: 'Error en la prueba' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // FINANCE
    // ═══════════════════════════════════════════
    '/api/stripe-mx': {
      post: {
        tags: ['Finance'],
        summary: 'Procesar pago Stripe México',
        description: 'Procesa un pago vía Stripe con soporte para métodos de pago mexicanos (OXXO, SPEI, etc.).',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Finance_StripeCharge' } } },
        },
        responses: {
          '200': { description: 'Pago procesado' },
          '400': { description: 'Error de pago' },
        },
      },
    },
    '/api/zadarma': {
      post: {
        tags: ['Finance'],
        summary: 'Webhook de Zadarma',
        description: 'Recibe notificaciones de llamadas de Zadarma (telefonía VoIP).',
        security: [],
        responses: {
          '200': { description: 'Notificación recibida' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // EQUALITY
    // ═══════════════════════════════════════════
    '/api/equality/complaints': {
      get: {
        tags: ['Equality'],
        summary: 'Listar denuncias',
        description: 'Devuelve las denuncias/quejas registradas en el canal de igualdad.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de denuncias' },
        },
      },
      post: {
        tags: ['Equality'],
        summary: 'Registrar denuncia',
        description: 'Registra una nueva denuncia anónima o nominativa en el canal de igualdad.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Equality_ComplaintCreate' } } },
        },
        responses: {
          '201': { description: 'Denuncia registrada' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // SUPPORT / TICKETS
    // ═══════════════════════════════════════════
    '/api/support/tickets': {
      get: {
        tags: ['Support'],
        summary: 'Listar tickets de soporte',
        description: 'Devuelve los tickets de soporte del tenant.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        parameters: [
          { name: 'estado', in: 'query', schema: { type: 'string' }, description: 'Filtrar por estado (abierto, en_progreso, cerrado)' },
          { name: 'prioridad', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Lista de tickets' },
        },
      },
      post: {
        tags: ['Support'],
        summary: 'Crear ticket de soporte',
        description: 'Crea un nuevo ticket de soporte.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Misc_TicketCreate' } } },
        },
        responses: {
          '201': { description: 'Ticket creado' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // PORTAL
    // ═══════════════════════════════════════════
    '/api/portal/claim': {
      post: {
        tags: ['Portal'],
        summary: 'Reclamar acceso a portal',
        description: 'Reclama el acceso al portal del cliente mediante un enlace de invitación.',
        security: [],
        responses: {
          '200': { description: 'Acceso reclamado' },
          '400': { description: 'Enlace inválido o expirado' },
        },
      },
    },
    '/api/portal/verify': {
      post: {
        tags: ['Portal'],
        summary: 'Verificar acceso a portal',
        description: 'Verifica el código de acceso al portal del cliente.',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Misc_PortalVerify' } } },
        },
        responses: {
          '200': { description: 'Código verificado' },
          '400': { description: 'Código inválido o expirado' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // UPLOAD
    // ═══════════════════════════════════════════
    '/api/upload/catalogo/presigned': {
      get: {
        tags: ['Upload'],
        summary: 'Obtener URL presigned para subida',
        description: 'Genera una URL presigned de S3/Minisis para subir archivos del catálogo.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        parameters: [
          { name: 'fileName', in: 'query', schema: { type: 'string' }, required: true },
          { name: 'fileType', in: 'query', schema: { type: 'string' }, required: true },
        ],
        responses: {
          '200': { description: 'URL presigned generada' },
          '400': { description: 'Parámetros inválidos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // AGENCY
    // ═══════════════════════════════════════════
    '/api/agency/settings/branding': {
      get: {
        tags: ['Agency'],
        summary: 'Obtener branding de agencia',
        description: 'Devuelve la configuración de branding/whitelabel de la agencia.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Branding de agencia' },
        },
      },
      post: {
        tags: ['Agency'],
        summary: 'Actualizar branding de agencia',
        description: 'Actualiza la configuración de branding/whitelabel.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Misc_BrandingUpdate' } } },
        },
        responses: {
          '200': { description: 'Branding actualizado' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },
    '/api/agency/slots': {
      get: {
        tags: ['Agency'],
        summary: 'Listar slots de agencia',
        description: 'Devuelve los slots/recursos disponibles de la agencia.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de slots' },
        },
      },
      post: {
        tags: ['Agency'],
        summary: 'Crear slot de agencia',
        description: 'Crea un nuevo slot/recurso disponible en la agencia.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Misc_SlotCreate' } } },
        },
        responses: {
          '201': { description: 'Slot creado' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // SKILLS (Agent Skills API)
    // ═══════════════════════════════════════════
    '/api/skills/user/{userId}/list': {
      get: {
        tags: ['Skills'],
        summary: 'Listar skills del usuario',
        description: 'Devuelve las skills/herramientas disponibles para un usuario agente.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Lista de skills del usuario',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      description: { type: 'string' },
                      inputSchema: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'No autenticado' },
          '403': { description: 'Sin permisos' },
        },
      },
    },
    '/api/skills/user/{userId}/{skillSlug}': {
      post: {
        tags: ['Skills'],
        summary: 'Ejecutar skill',
        description: 'Ejecuta una skill/herramienta específica para el usuario agente.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'skillSlug', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Skills_ExecuteInput' } } },
        },
        responses: {
          '200': { description: 'Resultado de la ejecución' },
          '400': { description: 'Argumentos inválidos' },
          '404': { description: 'Skill no encontrado' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // MESSAGING
    // ═══════════════════════════════════════════
    '/api/mensajes/conversaciones': {
      get: {
        tags: ['Messaging'],
        summary: 'Listar conversaciones',
        description: 'Devuelve las conversaciones activas del tenant.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de conversaciones' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // ERP — HR
    // ═══════════════════════════════════════════
    '/api/erp/hr/employees': {
      get: {
        tags: ['ERP'],
        summary: 'Listar empleados (ERP HR)',
        description: 'Devuelve los empleados del módulo de RRHH del tenant.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de empleados' },
        },
      },
      post: {
        tags: ['ERP'],
        summary: 'Crear empleado',
        description: 'Da de alta un nuevo empleado en el sistema de RRHH.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Employees_EmployeeCreate' } } },
        },
        responses: {
          '201': { description: 'Empleado creado' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },
    '/api/erp/hr/config': {
      get: {
        tags: ['ERP'],
        summary: 'Obtener configuración RRHH',
        description: 'Devuelve la configuración del módulo de RRHH (nóminas, SEPA, etc.).',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Configuración RRHH' },
        },
      },
      post: {
        tags: ['ERP'],
        summary: 'Actualizar configuración RRHH',
        description: 'Actualiza la configuración del módulo de RRHH.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Erp_HrConfigUpdate' } } },
        },
        responses: {
          '200': { description: 'Configuración actualizada' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // ERP — PRODUCTION
    // ═══════════════════════════════════════════
    '/api/erp/production/assets': {
      get: {
        tags: ['ERP'],
        summary: 'Listar activos de producción',
        description: 'Devuelve los activos/productos del módulo de producción.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de activos' },
        },
      },
    },
    '/api/erp/production/work-orders': {
      get: {
        tags: ['ERP'],
        summary: 'Listar órdenes de trabajo',
        description: 'Devuelve las órdenes de trabajo del módulo de producción.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de órdenes de trabajo' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // ERP — WAREHOUSE
    // ═══════════════════════════════════════════
    '/api/erp/warehouses': {
      get: {
        tags: ['ERP'],
        summary: 'Listar almacenes',
        description: 'Devuelve los almacenes/configuración de warehouse del tenant.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de almacenes' },
        },
      },
      post: {
        tags: ['ERP'],
        summary: 'Crear almacén',
        description: 'Crea un nuevo almacén en el sistema.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Misc_WarehouseCreate' } } },
        },
        responses: {
          '201': { description: 'Almacén creado' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // ERP — SUPPLIERS
    // ═══════════════════════════════════════════
    '/api/erp/suppliers': {
      get: {
        tags: ['ERP'],
        summary: 'Listar proveedores',
        description: 'Devuelve los proveedores registrados en el ERP.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de proveedores' },
        },
      },
      post: {
        tags: ['ERP'],
        summary: 'Crear proveedor',
        description: 'Registra un nuevo proveedor en el ERP.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Misc_SupplierCreate' } } },
        },
        responses: {
          '201': { description: 'Proveedor creado' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },

    // ═══════════════════════════════════════════
    // ERP — SALES ORDERS
    // ═══════════════════════════════════════════
    '/api/erp/sales/orders': {
      get: {
        tags: ['ERP'],
        summary: 'Listar órdenes de venta',
        description: 'Devuelve las órdenes de venta del módulo ERP.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        responses: {
          '200': { description: 'Lista de órdenes de venta' },
        },
      },
      post: {
        tags: ['ERP'],
        summary: 'Crear orden de venta',
        description: 'Crea una nueva orden de venta en el ERP.',
        security: [{ ApiKeyHeader: [] }, { ApiKeyBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Misc_SalesOrderCreate' } } },
        },
        responses: {
          '201': { description: 'Orden de venta creada' },
          '400': { description: 'Datos inválidos' },
        },
      },
    },
  },
} as const;

export default VOLKERN_API_SPEC;
