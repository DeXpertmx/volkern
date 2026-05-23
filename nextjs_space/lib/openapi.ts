/**
 * OpenAPI Documentation Generator
 *
 * Genera la especificación OpenAPI 3.0 a partir de los schemas Zod existentes.
 * Utiliza @asteasolutions/zod-to-openapi para mantener la documentación
 * sincronizada con la validación de schemas.
 *
 * Uso:
 *   import { openApiDocument } from '@/lib/openapi';
 *   // openApiDocument contiene la especificación OpenAPI completa
 */

import { z } from 'zod';
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';

// ─── Inicialización ─────────────────────────────────────────
// Extiende Zod con el método .openapi() para agregar metadata
extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// ─── Schemas Reutilizables (Common) ─────────────────────────

registry.register(
  'ErrorResponse',
  z.object({
    error: z.string().openapi({ description: 'Mensaje de error', example: 'No autorizado' }),
    details: z.string().optional().openapi({ description: 'Detalles adicionales del error' }),
  })
);

registry.register(
  'SuccessResponse',
  z.object({
    success: z.boolean().openapi({ example: true }),
  })
);

registry.register(
  'PaginatedQuery',
  z.object({
    page: z.coerce.number().int().min(1).optional().default(1).openapi({
      description: 'Número de página',
      example: 1,
    }),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25).openapi({
      description: 'Elementos por página',
      example: 25,
    }),
    search: z.string().optional().openapi({ description: 'Búsqueda por texto' }),
    sortBy: z.string().optional().openapi({ description: 'Campo de ordenamiento' }),
    sortOrder: z.enum(['asc', 'desc']).optional().openapi({ description: 'Dirección de ordenamiento' }),
  })
);

// ─── Leads ──────────────────────────────────────────────────

const LeadCreateSchema = registry.register(
  'LeadCreate',
  z.object({
    nombre: z.string().min(1).max(255).openapi({ description: 'Nombre completo del lead', example: 'Juan Pérez' }),
    email: z.string().email().openapi({ description: 'Correo electrónico', example: 'juan@ejemplo.com' }),
    telefono: z.string().max(30).openapi({ description: 'Número de teléfono', example: '+52 555 123 4567' }),
    empresa: z.string().max(255).optional().nullable().openapi({ description: 'Empresa del lead' }),
    cargo: z.string().max(255).optional().nullable().openapi({ description: 'Cargo del lead' }),
    ubicacion: z.string().max(255).optional().nullable().openapi({ description: 'Ubicación' }),
    linkedin: z.string().url().optional().nullable().openapi({ description: 'URL de LinkedIn' }),
    notas: z.string().max(10000).optional().nullable().openapi({ description: 'Notas internas' }),
    fuente: z.string().max(100).optional().nullable().openapi({ description: 'Fuente de origen' }),
    etapa: z.string().max(50).optional().nullable().openapi({ description: 'Etapa del lead' }),
    tags: z.string().max(500).optional().nullable().openapi({ description: 'Tags (separados por coma)' }),
  })
);

registry.registerPath({
  method: 'get',
  path: '/api/leads',
  summary: 'Listar leads',
  description: 'Obtiene una lista paginada de leads del tenant',
  tags: ['Leads'],
  request: {
    query: z.object({
      page: z.coerce.number().optional().openapi({ description: 'Página' }),
      limit: z.coerce.number().optional().openapi({ description: 'Límite por página' }),
      search: z.string().optional().openapi({ description: 'Búsqueda' }),
      etapa: z.string().optional().openapi({ description: 'Filtrar por etapa' }),
      fuente: z.string().optional().openapi({ description: 'Filtrar por fuente' }),
    }),
  },
  responses: {
    200: {
      description: 'Lista de leads',
      content: { 'application/json': { schema: z.object({
        leads: z.array(LeadCreateSchema.partial()),
        total: z.number(),
        page: z.number(),
        limit: z.number(),
      }) } },
    },
    401: { description: 'No autorizado' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/leads',
  summary: 'Crear lead',
  description: 'Crea un nuevo lead en el CRM',
  tags: ['Leads'],
  request: {
    body: { content: { 'application/json': { schema: LeadCreateSchema } } },
  },
  responses: {
    201: { description: 'Lead creado exitosamente', content: { 'application/json': { schema: z.object({ lead: LeadCreateSchema }) } } },
    400: { description: 'Datos inválidos' },
    401: { description: 'No autorizado' },
  },
});

// ─── Deals ──────────────────────────────────────────────────

const DealCreateSchema = registry.register(
  'DealCreate',
  z.object({
    leadId: z.string().optional().nullable().openapi({ description: 'ID del lead asociado' }),
    contactId: z.string().optional().nullable().openapi({ description: 'ID del contacto asociado' }),
    titulo: z.string().min(1).max(500).openapi({ description: 'Título del deal', example: 'Venta de paquete premium' }),
    descripcion: z.string().max(5000).optional().nullable().openapi({ description: 'Descripción' }),
    valor: z.number().positive().openapi({ description: 'Valor del deal', example: 15000 }),
    moneda: z.string().length(3).openapi({ description: 'Moneda (ISO 4217)', example: 'MXN' }),
    etapa: z.string().max(100).openapi({ description: 'Etapa del pipeline', example: 'calificacion' }),
    probabilidad: z.number().int().min(0).max(100).openapi({ description: 'Probabilidad de cierre (%)', example: 25 }),
    prioridad: z.enum(['baja', 'media', 'alta', 'urgente']).openapi({ description: 'Prioridad' }),
    fechaEstimadaCierre: z.string().datetime().optional().nullable().openapi({ description: 'Fecha estimada de cierre' }),
    tags: z.string().max(500).optional().nullable().openapi({ description: 'Tags' }),
    usuarioAsignadoId: z.string().optional().nullable().openapi({ description: 'ID del usuario asignado' }),
  })
);

const DealUpdateSchema = registry.register(
  'DealUpdate',
  z.object({
    titulo: z.string().min(1).max(500).optional().openapi({ description: 'Título del deal' }),
    valor: z.number().positive().optional().openapi({ description: 'Valor del deal' }),
    etapa: z.string().max(100).optional().openapi({ description: 'Etapa del pipeline' }),
    estado: z.enum(['activo', 'ganado', 'perdido', 'pausado']).optional().openapi({ description: 'Estado del deal' }),
    probabilidad: z.number().int().min(0).max(100).optional().openapi({ description: 'Probabilidad de cierre (%)' }),
    prioridad: z.enum(['baja', 'media', 'alta', 'urgente']).optional().openapi({ description: 'Prioridad' }),
    fechaEstimadaCierre: z.string().datetime().optional().nullable().openapi({ description: 'Fecha estimada de cierre' }),
    usuarioAsignadoId: z.string().optional().nullable().openapi({ description: 'ID del usuario asignado' }),
    razonPerdida: z.string().max(2000).optional().nullable().openapi({ description: 'Razón si está perdido' }),
    notasInternas: z.string().max(10000).optional().nullable().openapi({ description: 'Notas internas' }),
  })
);

registry.registerPath({
  method: 'get',
  path: '/api/deals',
  summary: 'Listar deals',
  description: 'Obtiene una lista paginada de deals del pipeline',
  tags: ['Deals'],
  request: {
    query: z.object({
      page: z.coerce.number().optional().openapi({ description: 'Página' }),
      limit: z.coerce.number().optional().openapi({ description: 'Límite por página' }),
      etapa: z.string().optional().openapi({ description: 'Filtrar por etapa' }),
      estado: z.string().optional().openapi({ description: 'Filtrar por estado' }),
      usuarioAsignadoId: z.string().optional().openapi({ description: 'Filtrar por usuario' }),
    }),
  },
  responses: {
    200: { description: 'Lista de deals' },
    401: { description: 'No autorizado' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/deals',
  summary: 'Crear deal',
  description: 'Crea una nueva oportunidad en el pipeline',
  tags: ['Deals'],
  request: {
    body: { content: { 'application/json': { schema: DealCreateSchema } } },
  },
  responses: {
    201: { description: 'Deal creado exitosamente' },
    400: { description: 'Datos inválidos' },
    401: { description: 'No autorizado' },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/deals/{id}',
  summary: 'Actualizar deal',
  description: 'Actualiza un deal existente (etapa, valor, estado, prioridad, etc.)',
  tags: ['Deals'],
  request: {
    params: z.object({
      id: z.string().openapi({ description: 'ID del deal' }),
    }),
    body: { content: { 'application/json': { schema: DealUpdateSchema } } },
  },
  responses: {
    200: { description: 'Deal actualizado' },
    404: { description: 'Deal no encontrado' },
    401: { description: 'No autorizado' },
  },
});

// ─── Contacts ───────────────────────────────────────────────

const ContactCreateSchema = registry.register(
  'ContactCreate',
  z.object({
    nombre: z.string().min(1).max(255).openapi({ description: 'Nombre del contacto', example: 'María García' }),
    email: z.string().email().openapi({ description: 'Correo electrónico', example: 'maria@ejemplo.com' }),
    telefono: z.string().max(30).openapi({ description: 'Teléfono', example: '+52 555 987 6543' }),
    tipo: z.enum(['person', 'company']).openapi({ description: 'Tipo de contacto' }),
    companyId: z.string().optional().nullable().openapi({ description: 'ID de la empresa' }),
    cargo: z.string().max(255).optional().nullable().openapi({ description: 'Cargo' }),
    ubicacion: z.string().max(255).optional().nullable().openapi({ description: 'Ubicación' }),
    linkedin: z.string().url().optional().nullable().openapi({ description: 'URL de LinkedIn' }),
    notas: z.string().max(10000).optional().nullable().openapi({ description: 'Notas' }),
    tags: z.string().max(500).optional().nullable().openapi({ description: 'Tags' }),
  })
);

registry.registerPath({
  method: 'get',
  path: '/api/contacts',
  summary: 'Listar contactos',
  tags: ['Contacts'],
  responses: {
    200: { description: 'Lista de contactos' },
    401: { description: 'No autorizado' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/contacts',
  summary: 'Crear contacto',
  tags: ['Contacts'],
  request: {
    body: { content: { 'application/json': { schema: ContactCreateSchema } } },
  },
  responses: {
    201: { description: 'Contacto creado' },
    400: { description: 'Datos inválidos' },
  },
});

// ─── Citas ──────────────────────────────────────────────────

const CitaCreateSchema = registry.register(
  'CitaCreate',
  z.object({
    leadId: z.string().optional().nullable().openapi({ description: 'ID del lead' }),
    contactId: z.string().optional().nullable().openapi({ description: 'ID del contacto' }),
    servicioId: z.string().optional().nullable().openapi({ description: 'ID del servicio' }),
    tipo: z.enum(['reunion', 'llamada', 'presencial', 'otro']).openapi({ description: 'Tipo de cita' }),
    titulo: z.string().max(500).optional().nullable().openapi({ description: 'Título' }),
    descripcion: z.string().max(5000).optional().nullable().openapi({ description: 'Descripción' }),
    fechaHora: z.string().datetime().openapi({ description: 'Fecha y hora (ISO 8601)', example: '2026-06-01T15:00:00Z' }),
    duracion: z.number().int().min(5).max(480).openapi({ description: 'Duración en minutos', example: 60 }),
    ubicacion: z.string().max(500).optional().nullable().openapi({ description: 'Ubicación física' }),
    linkReunion: z.string().url().optional().nullable().openapi({ description: 'Link de reunión virtual' }),
  })
);

registry.registerPath({
  method: 'get',
  path: '/api/citas',
  summary: 'Listar citas',
  tags: ['Citas'],
  responses: {
    200: { description: 'Lista de citas' },
    401: { description: 'No autorizado' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/citas',
  summary: 'Crear cita',
  tags: ['Citas'],
  request: {
    body: { content: { 'application/json': { schema: CitaCreateSchema } } },
  },
  responses: {
    201: { description: 'Cita creada' },
    400: { description: 'Datos inválidos' },
  },
});

// ─── Facturas ───────────────────────────────────────────────

const InvoiceCreateSchema = registry.register(
  'InvoiceCreate',
  z.object({
    contactId: z.string().optional().nullable().openapi({ description: 'ID del contacto' }),
    dealId: z.string().optional().nullable().openapi({ description: 'ID del deal' }),
    numero: z.string().min(1).max(50).openapi({ description: 'Número de factura', example: 'F-2026-001' }),
    fechaEmision: z.string().datetime().openapi({ description: 'Fecha de emisión' }),
    fechaVencimiento: z.string().datetime().optional().nullable().openapi({ description: 'Fecha de vencimiento' }),
    subtotal: z.number().positive().openapi({ description: 'Subtotal', example: 10000 }),
    descuentoPorcentaje: z.number().min(0).max(100).openapi({ description: 'Descuento %', example: 0 }),
    impuestos: z.number().min(0).openapi({ description: 'Total impuestos', example: 1600 }),
    total: z.number().positive().openapi({ description: 'Total', example: 11600 }),
    moneda: z.string().length(3).openapi({ description: 'Moneda', example: 'MXN' }),
    estado: z.enum(['borrador', 'emitida', 'pagada', 'anulada', 'vencida']).openapi({ description: 'Estado' }),
    items: z.array(z.object({
      concepto: z.string().min(1).max(500).openapi({ description: 'Concepto', example: 'Servicio de consultoría' }),
      cantidad: z.number().positive().openapi({ description: 'Cantidad', example: 1 }),
      precioUnitario: z.number().positive().openapi({ description: 'Precio unitario', example: 10000 }),
    })).openapi({ description: 'Líneas de factura' }),
    clienteNombre: z.string().max(500).optional().nullable().openapi({ description: 'Nombre del cliente' }),
    clienteEmail: z.string().email().optional().nullable().openapi({ description: 'Email del cliente' }),
    clienteRfc: z.string().max(20).optional().nullable().openapi({ description: 'RFC del cliente (México)' }),
  })
);

registry.registerPath({
  method: 'get',
  path: '/api/facturas/invoices',
  summary: 'Listar facturas',
  tags: ['Facturación'],
  responses: {
    200: { description: 'Lista de facturas' },
    401: { description: 'No autorizado' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/facturas/invoices',
  summary: 'Crear factura',
  tags: ['Facturación'],
  request: {
    body: { content: { 'application/json': { schema: InvoiceCreateSchema } } },
  },
  responses: {
    201: { description: 'Factura creada' },
    400: { description: 'Datos inválidos' },
  },
});

// ─── Cotizaciones ───────────────────────────────────────────

const CotizacionCreateSchema = registry.register(
  'CotizacionCreate',
  z.object({
    dealId: z.string().optional().nullable().openapi({ description: 'ID del deal' }),
    titulo: z.string().min(1).max(500).openapi({ description: 'Título de la cotización' }),
    subtotal: z.number().positive().openapi({ description: 'Subtotal' }),
    descuentoPorcentaje: z.number().min(0).max(100).openapi({ description: 'Descuento %' }),
    impuestos: z.number().min(0).openapi({ description: 'Total impuestos' }),
    total: z.number().positive().openapi({ description: 'Total' }),
    moneda: z.string().length(3).openapi({ description: 'Moneda' }),
    validezDias: z.number().int().min(1).max(365).openapi({ description: 'Días de validez' }),
    items: z.array(z.object({
      concepto: z.string().min(1).max(500).openapi({ description: 'Concepto' }),
      cantidad: z.number().positive().openapi({ description: 'Cantidad' }),
      precioUnitario: z.number().positive().openapi({ description: 'Precio unitario' }),
    })),
  })
);

registry.registerPath({
  method: 'post',
  path: '/api/facturas/cotizaciones',
  summary: 'Crear cotización',
  tags: ['Facturación'],
  request: {
    body: { content: { 'application/json': { schema: CotizacionCreateSchema } } },
  },
  responses: {
    201: { description: 'Cotización creada' },
  },
});

// ─── Contratos ──────────────────────────────────────────────

const ContratoCreateSchema = registry.register(
  'ContratoCreate',
  z.object({
    contactId: z.string().openapi({ description: 'ID del contacto/cliente' }),
    dealId: z.string().optional().nullable().openapi({ description: 'ID del deal' }),
    titulo: z.string().min(1).max(500).openapi({ description: 'Título del contrato' }),
    tipo: z.enum(['servicio', 'producto', 'mixto', 'suscripcion']).openapi({ description: 'Tipo de contrato' }),
    moneda: z.string().length(3).openapi({ description: 'Moneda' }),
    fechaInicio: z.string().datetime().optional().nullable().openapi({ description: 'Fecha de inicio' }),
    fechaFin: z.string().datetime().optional().nullable().openapi({ description: 'Fecha de fin' }),
    metodoPago: z.string().max(50).optional().nullable().openapi({ description: 'Método de pago' }),
    condicionesPago: z.string().max(500).optional().nullable().openapi({ description: 'Condiciones de pago' }),
  })
);

registry.registerPath({
  method: 'post',
  path: '/api/facturas/contratos',
  summary: 'Crear contrato',
  tags: ['Facturación'],
  request: {
    body: { content: { 'application/json': { schema: ContratoCreateSchema } } },
  },
  responses: {
    201: { description: 'Contrato creado' },
  },
});

// ─── Empleados ──────────────────────────────────────────────

const EmployeeCreateSchema = registry.register(
  'EmployeeCreate',
  z.object({
    nombre: z.string().min(1).max(255).openapi({ description: 'Nombre completo', example: 'Carlos López' }),
    email: z.string().email().openapi({ description: 'Correo electrónico', example: 'carlos@empresa.com' }),
    telefono: z.string().max(30).optional().nullable().openapi({ description: 'Teléfono' }),
    puesto: z.string().max(255).optional().nullable().openapi({ description: 'Puesto' }),
    departamento: z.string().max(255).optional().nullable().openapi({ description: 'Departamento' }),
    salarioBase: z.number().positive().optional().nullable().openapi({ description: 'Salario base' }),
    monedaSalario: z.string().length(3).optional().nullable().openapi({ description: 'Moneda del salario' }),
    fechaContratacion: z.string().datetime().optional().nullable().openapi({ description: 'Fecha de contratación' }),
  })
);

registry.registerPath({
  method: 'get',
  path: '/api/employees',
  summary: 'Listar empleados',
  tags: ['RRHH'],
  responses: { 200: { description: 'Lista de empleados' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/employees',
  summary: 'Crear empleado',
  tags: ['RRHH'],
  request: { body: { content: { 'application/json': { schema: EmployeeCreateSchema } } } },
  responses: { 201: { description: 'Empleado creado' } },
});

// ─── Skills ─────────────────────────────────────────────────

const SkillExecuteSchema = registry.register(
  'SkillExecute',
  z.object({
    skill: z.string().min(1).openapi({ description: 'Nombre del skill a ejecutar', example: 'create_lead' }),
    payload: z.record(z.unknown()).optional().openapi({ description: 'Payload opcional para el skill' }),
  })
);

registry.registerPath({
  method: 'post',
  path: '/api/skills',
  summary: 'Ejecutar skill',
  description: 'Ejecuta un skill (acción automatizada) por nombre. Los skills disponibles incluyen: create_lead, create_contact, create_deal, send_message, etc.',
  tags: ['Skills'],
  request: {
    body: { content: { 'application/json': { schema: SkillExecuteSchema } } },
  },
  responses: {
    200: { description: 'Resultado de la ejecución del skill' },
    400: { description: 'Skill no encontrado o datos inválidos' },
    401: { description: 'No autorizado' },
  },
});

// ─── Chatbot ────────────────────────────────────────────────

const ChatbotMessageSchema = registry.register(
  'ChatbotMessage',
  z.object({
    message: z.string().min(1).openapi({ description: 'Mensaje del usuario', example: 'Quiero agendar una cita' }),
    sessionId: z.string().optional().openapi({ description: 'ID de sesión para continuar conversación' }),
    channel: z.enum(['web', 'whatsapp', 'telegram']).optional().openapi({ description: 'Canal de origen' }),
    metadata: z.record(z.unknown()).optional().openapi({ description: 'Metadatos adicionales' }),
  })
);

registry.registerPath({
  method: 'post',
  path: '/api/chatbot/message',
  summary: 'Enviar mensaje al chatbot',
  description: 'Envía un mensaje al chatbot IA y obtiene una respuesta. El chatbot puede gestionar leads, citas, deals, inventario y más.',
  tags: ['Chatbot'],
  request: {
    body: { content: { 'application/json': { schema: ChatbotMessageSchema } } },
  },
  responses: {
    200: { description: 'Respuesta del chatbot con la intención detectada y acción realizada' },
    400: { description: 'Mensaje inválido' },
  },
});

// ─── Webhooks ───────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/api/webhooks/stripe',
  summary: 'Webhook Stripe',
  description: 'Recibe eventos de Stripe (pagos, suscripciones, facturas)',
  tags: ['Webhooks'],
  request: {
    body: { content: { 'application/json': { schema: z.object({
      type: z.string().openapi({ description: 'Tipo de evento Stripe', example: 'invoice.payment_succeeded' }),
      data: z.object({
        object: z.record(z.unknown()).openapi({ description: 'Objeto del evento' }),
      }),
    }) } } },
  },
  responses: {
    200: { description: 'Evento procesado' },
    400: { description: 'Firma inválida' },
  },
});

// ─── Auth ───────────────────────────────────────────────────

const LoginSchema = registry.register(
  'LoginRequest',
  z.object({
    email: z.string().email().openapi({ description: 'Correo electrónico', example: 'admin@ejemplo.com' }),
    password: z.string().min(1).openapi({ description: 'Contraseña', example: 'MiPassword123!' }),
  })
);

registry.registerPath({
  method: 'post',
  path: '/api/auth/login',
  summary: 'Iniciar sesión',
  description: 'Autenticación de usuario. Devuelve token de sesión y datos del usuario.',
  tags: ['Auth'],
  request: {
    body: { content: { 'application/json': { schema: LoginSchema } } },
  },
  responses: {
    200: { description: 'Login exitoso, devuelve sesión' },
    401: { description: 'Credenciales inválidas' },
  },
});

const SignupSchema = registry.register(
  'SignupRequest',
  z.object({
    email: z.string().email().openapi({ description: 'Correo electrónico', example: 'nuevo@ejemplo.com' }),
    password: z.string().min(8).openapi({ description: 'Contraseña (mín. 8 chars, mayúscula, minúscula, especial)' }),
    fullName: z.string().min(1).max(255).openapi({ description: 'Nombre completo' }),
    companyName: z.string().min(1).max(255).openapi({ description: 'Nombre de la empresa' }),
    couponCode: z.string().max(20).optional().openapi({ description: 'Código de cupón (opcional)' }),
  })
);

registry.registerPath({
  method: 'post',
  path: '/api/auth/signup',
  summary: 'Registrarse',
  description: 'Registra un nuevo tenant con usuario administrador y provisioning automático.',
  tags: ['Auth'],
  request: {
    body: { content: { 'application/json': { schema: SignupSchema } } },
  },
  responses: {
    201: { description: 'Tenant creado exitosamente' },
    400: { description: 'Datos inválidos o email ya registrado' },
  },
});

// ─── CRM Dashboard ─────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/leads/stats',
  summary: 'Estadísticas de leads',
  description: 'Obtiene métricas agregadas de leads (por etapa, fuente, tendencias)',
  tags: ['Leads'],
  responses: {
    200: { description: 'Estadísticas de leads' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/deals/forecast',
  summary: 'Forecast de ventas',
  description: 'Obtiene proyección de ingresos basada en el pipeline actual',
  tags: ['Deals'],
  responses: {
    200: { description: 'Forecast con valores ponderados por etapa' },
  },
});

// ─── Automatizaciones ───────────────────────────────────────

const AutomationCreateSchema = registry.register(
  'AutomationCreate',
  z.object({
    nombre: z.string().min(1).max(255).openapi({ description: 'Nombre de la automatización' }),
    descripcion: z.string().max(500).optional().openapi({ description: 'Descripción' }),
    trigger: z.string().min(1).openapi({ description: 'Evento que activa la automatización', example: 'lead.created' }),
    flowData: z.record(z.unknown()).optional().openapi({ description: 'Datos del flujo (nodos y conexiones)' }),
  })
);

registry.registerPath({
  method: 'post',
  path: '/api/automatizaciones',
  summary: 'Crear automatización',
  tags: ['Automatizaciones'],
  request: {
    body: { content: { 'application/json': { schema: AutomationCreateSchema } } },
  },
  responses: {
    201: { description: 'Automatización creada' },
  },
});

// ─── Health ─────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/health',
  summary: 'Health check',
  description: 'Verifica el estado del servidor, base de datos y Redis',
  tags: ['Sistema'],
  responses: {
    200: { description: 'Servicio saludable', content: { 'application/json': { schema: z.object({
      status: z.string().openapi({ example: 'healthy' }),
      database: z.string().openapi({ example: 'connected' }),
      redis: z.string().openapi({ example: 'connected' }),
      uptime: z.number().openapi({ description: 'Segundos desde el inicio' }),
      timestamp: z.string().openapi({ description: 'Timestamp ISO' }),
    }) } } },
    503: { description: 'Servicio no disponible (degradado o caído)' },
  },
});

// ─── OpenAPI ────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/api/openapi',
  summary: 'Especificación OpenAPI',
  description: 'Devuelve la especificación OpenAPI 3.0 completa de la API',
  tags: ['Sistema'],
  responses: {
    200: { description: 'Especificación OpenAPI en formato JSON' },
  },
});

// ─── Generar Documento ──────────────────────────────────────

const generator = new OpenApiGeneratorV3(registry.definitions);

export const openApiDocument = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'Volkern CRM API',
    description: `# Volkern CRM API

API RESTful del sistema CRM todo-en-uno con módulos de:
- **CRM**: Leads, Contactos, Deals/Pipeline, Citas
- **Facturación**: Facturas, Cotizaciones, Contratos, Órdenes de Venta
- **RRHH**: Empleados, Vacaciones, Gastos, Asistencias
- **Chatbot IA**: Asistente conversacional multicanal
- **Automatizaciones**: Flujos de trabajo automatizados
- **Skills**: Acciones ejecutables vía API

Autenticación mediante sesión (NextAuth) o API Key.
`,
    version: '1.0.0',
    contact: {
      name: 'Volkern',
      url: 'https://volkern.com',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Desarrollo local',
    },
    {
      url: 'https://{tenant}.volkern.app',
      description: 'Producción (multi-tenant)',
      variables: {
        tenant: {
          default: 'demo',
          description: 'Subdominio del tenant',
        },
      },
    },
  ],
  tags: [
    { name: 'Leads', description: 'Gestión de leads y prospección' },
    { name: 'Deals', description: 'Pipeline de ventas y oportunidades' },
    { name: 'Contacts', description: 'Contactos y empresas' },
    { name: 'Citas', description: 'Calendario y agenda' },
    { name: 'Facturación', description: 'Facturas, cotizaciones, contratos' },
    { name: 'RRHH', description: 'Gestión de empleados' },
    { name: 'Chatbot', description: 'Chatbot IA multicanal' },
    { name: 'Skills', description: 'Acciones y automatizaciones vía API' },
    { name: 'Automatizaciones', description: 'Flujos de trabajo automatizados' },
    { name: 'Webhooks', description: 'Webhooks de integración (Stripe, Telegram, etc.)' },
    { name: 'Auth', description: 'Autenticación y registro' },
    { name: 'Sistema', description: 'Endpoints de sistema y monitoreo' },
  ],
  // Seguridad: Bearer token o cookie de sesión
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: 'API Key con formato: Bearer <api_key>',
      },
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'next-auth.session-token',
        description: 'Cookie de sesión de NextAuth',
      },
    },
  },
  security: [
    { bearerAuth: [] },
    { sessionCookie: [] },
  ],
});
