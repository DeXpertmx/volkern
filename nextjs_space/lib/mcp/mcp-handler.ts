/**
 * Volkern MCP Handler
 * Model Context Protocol Server Implementation
 * 
 * Expone los Skills de Volkern como MCP Tools
 * Compatible con Claude, ChatGPT y otros LLMs que soporten MCP
 * 
 * Arquitectura:
 * LLM/Agent → MCP Server → Skills → Core → EventBus
 */

import { prisma } from '@/lib/db';
import { skills, executeSkill, listSkills, SkillName } from '@/lib/skills';

// ============== TIPOS MCP ==============

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, MCPPropertySchema>;
    required?: string[];
  };
}

interface MCPPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
  items?: MCPPropertySchema;
  properties?: Record<string, MCPPropertySchema>;
}

export interface MCPListToolsResponse {
  tools: MCPTool[];
}

export interface MCPCallToolRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPCallToolResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ============== DEFINICIÓN DE TOOLS ==============

/**
 * Definiciones de herramientas MCP basadas en Skills
 * Cada tool mapea directamente a un skill
 */
export const MCP_TOOLS: MCPTool[] = [
  // ========== CONTACTOS ==========
  {
    name: 'create_contact',
    description: 'Crear un nuevo contacto en el CRM. Usar cuando se tiene información verificada de un cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre completo del contacto' },
        email: { type: 'string', description: 'Correo electrónico del contacto' },
        telefono: { type: 'string', description: 'Teléfono del contacto (opcional)' },
        empresa: { type: 'string', description: 'Empresa donde trabaja (opcional)' },
        cargo: { type: 'string', description: 'Cargo o puesto (opcional)' },
        notas: { type: 'string', description: 'Notas adicionales (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario que crea (opcional)' },
        source: { type: 'string', description: 'Fuente: api, app, automation, mcp, webhook', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['nombre', 'email', 'tenantId'],
    },
  },
  {
    name: 'update_contact',
    description: 'Actualizar información de un contacto existente',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'ID del contacto a actualizar' },
        nombre: { type: 'string', description: 'Nuevo nombre (opcional)' },
        email: { type: 'string', description: 'Nuevo email (opcional)' },
        telefono: { type: 'string', description: 'Nuevo teléfono (opcional)' },
        empresa: { type: 'string', description: 'Nueva empresa (opcional)' },
        cargo: { type: 'string', description: 'Nuevo cargo (opcional)' },
        notas: { type: 'string', description: 'Nuevas notas (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente del cambio', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['contactId', 'tenantId'],
    },
  },
  {
    name: 'get_contact',
    description: 'Obtener información de un contacto por su ID',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'ID del contacto' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['contactId', 'tenantId'],
    },
  },
  {
    name: 'find_contact_by_email',
    description: 'Buscar un contacto por su correo electrónico',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email del contacto a buscar' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['email', 'tenantId'],
    },
  },
  {
    name: 'list_contacts',
    description: 'Listar todos los contactos del tenant con filtros opcionales. Usa esto cuando el usuario pida "ver contactos", "lista de contactos" o "mis contactos". Soporta búsqueda por texto, filtro por tipo (person/company) y tags.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        search: { type: 'string', description: 'Búsqueda por nombre, email, teléfono o cargo (opcional)' },
        tipo: { type: 'string', description: 'Filtrar por tipo: person o company', enum: ['person', 'company'] },
        tags: { type: 'string', description: 'Filtrar por tags (búsqueda parcial, ej: "vip")' },
        page: { type: 'number', description: 'Número de página (default: 1)' },
        limit: { type: 'number', description: 'Resultados por página (default: 50, max: 100)' },
        sortBy: { type: 'string', description: 'Ordenar por: nombre, email, fechaCreacion, fechaActualizacion', enum: ['nombre', 'email', 'fechaCreacion', 'fechaActualizacion'] },
        sortOrder: { type: 'string', description: 'Dirección: asc o desc (default: desc)', enum: ['asc', 'desc'] },
      },
      required: ['tenantId'],
    },
  },

  // ========== LEADS ==========
  {
    name: 'create_lead',
    description: 'Crear un nuevo lead (prospecto). Usar cuando alguien muestra interés pero aún no es cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del lead' },
        email: { type: 'string', description: 'Email del lead' },
        telefono: { type: 'string', description: 'Teléfono (opcional)' },
        origen: { type: 'string', description: 'De dónde vino el lead: web, email, referido, redes_sociales, etc.' },
        interes: { type: 'string', description: 'En qué está interesado (opcional)' },
        notas: { type: 'string', description: 'Notas adicionales (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['nombre', 'email', 'tenantId'],
    },
  },
  {
    name: 'get_lead',
    description: 'Obtener información de un lead por su ID',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'ID del lead' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['leadId', 'tenantId'],
    },
  },
  {
    name: 'find_lead_by_email',
    description: 'Buscar un lead por su correo electrónico',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email del lead' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['email', 'tenantId'],
    },
  },
  {
    name: 'convert_lead',
    description: 'Convertir un lead en contacto. Usar cuando el lead se convierte en cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'ID del lead a convertir' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['leadId', 'tenantId'],
    },
  },
  {
    name: 'list_leads',
    description: 'Listar todos los leads del tenant con filtros opcionales. Usa esto cuando el usuario pida "ver leads", "lista de leads", "leads nuevos", etc. Permite filtrar por estado, fuente y búsqueda de texto.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        search: { type: 'string', description: 'Búsqueda por nombre, email, teléfono o empresa (opcional)' },
        estado: { type: 'string', description: 'Filtrar por estado: nuevo, contactado, calificado, convertido (opcional)', enum: ['nuevo', 'contactado', 'calificado', 'convertido'] },
        fuente: { type: 'string', description: 'Filtrar por fuente de adquisición: web, referido, whatsapp, etc. (opcional)' },
        page: { type: 'number', description: 'Número de página (default: 1)' },
        limit: { type: 'number', description: 'Resultados por página (default: 50, max: 100)' },
        sortBy: { type: 'string', description: 'Ordenar por: nombre, email, fechaCreacion, fechaActualizacion, estado', enum: ['nombre', 'email', 'fechaCreacion', 'fechaActualizacion', 'estado'] },
        sortOrder: { type: 'string', description: 'Dirección: asc o desc (default: desc)', enum: ['asc', 'desc'] },
      },
      required: ['tenantId'],
    },
  },

  // ========== CONVERSACIONES ==========
  {
    name: 'create_conversation',
    description: 'Crear una nueva conversación con un lead o contacto',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'ID del lead (opcional si hay contactId)' },
        contactId: { type: 'string', description: 'ID del contacto (opcional si hay leadId)' },
        canal: { type: 'string', description: 'Canal: whatsapp, telegram, email, webchat', enum: ['whatsapp', 'telegram', 'email', 'webchat'] },
        asunto: { type: 'string', description: 'Asunto de la conversación (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['canal', 'tenantId'],
    },
  },
  {
    name: 'get_conversation',
    description: 'Obtener una conversación por su ID',
    inputSchema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'ID de la conversación' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['conversationId', 'tenantId'],
    },
  },
  {
    name: 'get_or_create_conversation',
    description: 'Obtener conversación existente o crear una nueva si no existe',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'ID del lead' },
        canal: { type: 'string', description: 'Canal de comunicación', enum: ['whatsapp', 'telegram', 'email', 'webchat'] },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['leadId', 'canal', 'tenantId'],
    },
  },
  {
    name: 'send_message',
    description: 'Enviar un mensaje en una conversación',
    inputSchema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'ID de la conversación' },
        contenido: { type: 'string', description: 'Contenido del mensaje' },
        tipo: { type: 'string', description: 'Tipo de mensaje', enum: ['texto', 'imagen', 'archivo', 'audio'] },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['conversationId', 'contenido', 'tenantId'],
    },
  },
  {
    name: 'close_conversation',
    description: 'Cerrar una conversación',
    inputSchema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'ID de la conversación' },
        resolucion: { type: 'string', description: 'Resumen de la resolución (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['conversationId', 'tenantId'],
    },
  },

  // ========== TAREAS ==========
  {
    name: 'create_task',
    description: 'Crear una tarea asociada a un lead o contacto. Se debe proporcionar email, leadId o contactId.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email del lead o contacto (opcional si hay leadId/contactId)' },
        leadId: { type: 'string', description: 'ID del lead (opcional)' },
        contactId: { type: 'string', description: 'ID del contacto (opcional)' },
        titulo: { type: 'string', description: 'Título de la tarea' },
        descripcion: { type: 'string', description: 'Descripción (opcional)' },
        tipo: { type: 'string', description: 'Tipo de tarea', enum: ['llamada', 'email', 'reunion', 'seguimiento', 'otro'] },
        fechaVencimiento: { type: 'string', description: 'Fecha de vencimiento ISO (opcional)' },
        asignadoAId: { type: 'string', description: 'ID del usuario asignado (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario creador (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['titulo', 'tenantId'],
    },
  },
  {
    name: 'complete_task',
    description: 'Marcar una tarea como completada',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID de la tarea' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario que completa (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['taskId', 'tenantId'],
    },
  },
  {
    name: 'get_tasks_by_lead',
    description: 'Obtener todas las tareas de un lead',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'ID del lead' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['leadId', 'tenantId'],
    },
  },
  {
    name: 'get_pending_tasks',
    description: 'Obtener tareas pendientes de un usuario',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID del usuario' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['userId', 'tenantId'],
    },
  },

  // ========== NOTAS ==========
  {
    name: 'create_note',
    description: 'Crear una nota en un lead',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'ID del lead' },
        contenido: { type: 'string', description: 'Contenido de la nota' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['leadId', 'contenido', 'tenantId'],
    },
  },
  {
    name: 'get_notes_by_lead',
    description: 'Obtener todas las notas de un lead',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'ID del lead' },
      },
      required: ['leadId'],
    },
  },

  // ========== DIAGNÓSTICOS (Skill Compuesto) ==========
  {
    name: 'complete_diagnosis',
    description: 'Completar un flujo de diagnóstico completo: crea lead (si no existe), nota con respuestas, tarea de seguimiento y emite evento',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email del lead' },
        nombre: { type: 'string', description: 'Nombre del lead' },
        telefono: { type: 'string', description: 'Teléfono (opcional)' },
        respuestas: { type: 'object', description: 'Respuestas del diagnóstico en formato JSON' },
        resumen: { type: 'string', description: 'Resumen generado del diagnóstico' },
        servicioRecomendado: { type: 'string', description: 'Servicio recomendado (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['email', 'nombre', 'respuestas', 'tenantId'],
    },
  },
  {
    name: 'get_diagnosis_by_lead',
    description: 'Obtener historial de diagnósticos de un lead',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'ID del lead' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['leadId', 'tenantId'],
    },
  },

  // ========== BOOKINGS/CITAS (Skill Compuesto) ==========
  {
    name: 'create_booking',
    description: 'Crear una cita completa: crea lead (si no existe), conversación, tarea de recordatorio y la cita',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email del cliente' },
        nombre: { type: 'string', description: 'Nombre del cliente' },
        telefono: { type: 'string', description: 'Teléfono (opcional)' },
        servicioId: { type: 'string', description: 'ID del servicio (opcional)' },
        titulo: { type: 'string', description: 'Título de la cita' },
        fechaHora: { type: 'string', description: 'Fecha y hora en formato ISO' },
        duracion: { type: 'number', description: 'Duración en minutos (default: 60)' },
        descripcion: { type: 'string', description: 'Descripción o notas (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['email', 'nombre', 'titulo', 'fechaHora', 'tenantId'],
    },
  },
  {
    name: 'confirm_booking',
    description: 'Confirmar una cita existente',
    inputSchema: {
      type: 'object',
      properties: {
        bookingId: { type: 'string', description: 'ID de la cita' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['bookingId', 'tenantId'],
    },
  },
  {
    name: 'cancel_booking',
    description: 'Cancelar una cita existente',
    inputSchema: {
      type: 'object',
      properties: {
        bookingId: { type: 'string', description: 'ID de la cita' },
        motivo: { type: 'string', description: 'Motivo de cancelación (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['bookingId', 'tenantId'],
    },
  },
  {
    name: 'get_bookings_by_lead',
    description: 'Obtener todas las citas de un lead',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'ID del lead' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['leadId', 'tenantId'],
    },
  },
  {
    name: 'get_upcoming_bookings',
    description: 'Obtener próximas citas del tenant. Si se proporciona date, devolverá las citas de ese día en específico.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        limit: { type: 'number', description: 'Número máximo de citas (default: 10)' },
        date: { type: 'string', description: 'Fecha opcional (YYYY-MM-DD). Si se envía, filtra por este día completo interpretado en el timezone.' },
        timezone: { type: 'string', description: 'Zona horaria (ej: Europe/Madrid) usada para interpretar la fecha dada.' },
      },
      required: ['tenantId'],
    },
  },

  // ========== CATÁLOGO ==========
  {
    name: 'export_catalog',
    description: 'Exportar el catálogo completo de productos/servicios con todos los custom fields, categorías, etiquetas, media y pricing. Soporta formato JSON o CSV.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        tipo: { type: 'string', description: 'Filtrar por tipo: servicio, producto, suscripcion, etc. (opcional)' },
        activo: { type: 'boolean', description: 'Filtrar por estado activo/inactivo (opcional)' },
        categoria: { type: 'string', description: 'Filtrar por categoría (opcional)' },
        etiqueta: { type: 'string', description: 'Filtrar por etiqueta (opcional)' },
        search: { type: 'string', description: 'Búsqueda en nombre, descripción o SKU (opcional)' },
        format: { type: 'string', description: 'Formato de exportación', enum: ['json', 'csv'] },
        includeFieldDefinitions: { type: 'boolean', description: 'Incluir definiciones de campos personalizados (default: true)' },
        includeCustomFields: { type: 'boolean', description: 'Incluir valores de campos personalizados (default: true)' },
        includeMedia: { type: 'boolean', description: 'Incluir información multimedia (default: true)' },
        includePricing: { type: 'boolean', description: 'Incluir información de precios avanzada (default: true)' },
        userId: { type: 'string', description: 'ID del usuario que exporta (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['tenantId'],
    },
  },
  {
    name: 'get_catalog_field_definitions',
    description: 'Obtener las definiciones de campos personalizados del catálogo. Estos campos definen qué atributos extra pueden tener los productos/servicios.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        categoria: { type: 'string', description: 'Filtrar por categoría de producto (opcional)' },
        activos: { type: 'boolean', description: 'Solo campos activos (default: true)' },
      },
      required: ['tenantId'],
    },
  },
  {
    name: 'get_catalog_item',
    description: 'Obtener un ítem específico del catálogo por su ID, incluyendo todos sus custom fields enriquecidos con sus definiciones.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        itemId: { type: 'string', description: 'ID del ítem del catálogo' },
        includeCustomFields: { type: 'boolean', description: 'Incluir custom fields enriquecidos (default: true)' },
      },
      required: ['tenantId', 'itemId'],
    },
  },
  {
    name: 'search_catalog',
    description: 'Buscar en el catálogo con filtros. Útil para encontrar productos/servicios específicos.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        search: { type: 'string', description: 'Texto de búsqueda (nombre, descripción, SKU)' },
        tipo: { type: 'string', description: 'Filtrar por tipo (opcional)' },
        categoria: { type: 'string', description: 'Filtrar por categoría (opcional)' },
        etiqueta: { type: 'string', description: 'Filtrar por etiqueta (opcional)' },
        activo: { type: 'boolean', description: 'Filtrar por estado activo (default: true)' },
        limit: { type: 'number', description: 'Máximo de resultados (default: 50)' },
        offset: { type: 'number', description: 'Offset para paginación (default: 0)' },
      },
      required: ['tenantId'],
    },
  },

  // ========== AGENTIC SKILLS (Gemma 4 Optimized) ==========
  {
    name: 'audit_finance_integrity',
    description: 'Realiza una auditoría forense de integridad fiscal (Veri*factu). Busca discrepancias en los hashes de facturas y gastos para detectar manipulaciones o errores de registro. Activa el PROTOCOLO DE DESCONFIANZA si se detectan brechas.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['tenantId'],
    },
  },
  {
    name: 'get_field_activity',
    description: 'Localiza técnicos y activos en campo hoy. Extrae geolocalización (VISION-LOCK) y estado de actividad técnica.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['tenantId'],
    },
  },
  {
    name: 'audit_material_leaks',
    description: 'Monitor de mermas e integridad de materiales. Compara stock contra consumo de producción para detectar robos o fugas.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['tenantId'],
    },
  },
  // ========== RRHH VOICE OPS (Gemma Live) ==========
  {
    name: 'get_hr_daily_brief',
    description: 'Obtener un resumen ejecutivo narrativo (estilo briefing militar) sobre el estado del personal, alertas de integridad y conflictos de hitos críticos.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['tenantId'],
    },
  },
  {
    name: 'authorize_bulk_expenses',
    description: 'Autorizar masivamente gastos con validación GPS (VISION-LOCK) positiva. Requiere rol OWNER.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario operador' },
      },
      required: ['tenantId', 'userId'],
    },
  },
  {
    name: 'approve_vacation_voice',
    description: 'Aprobar una solicitud de vacaciones mediante comando de voz, incluyendo una nota personalizada.',
    inputSchema: {
      type: 'object',
      properties: {
        vacationRequestId: { type: 'string', description: 'ID de la solicitud' },
        note: { type: 'string', description: 'Nota para el empleado' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario' },
      },
      required: ['vacationRequestId', 'tenantId', 'userId'],
    },
  },
  {
    name: 'orchestrate_asset_transfer',
    description: 'Gestionar el traspaso entre técnicos o la devolución al almacén de activos críticos. Requiere rol OWNER.',
    inputSchema: {
      type: 'object',
      properties: {
        assetId: { type: 'string', description: 'ID del activo (EmployeeAsset)' },
        action: { type: 'string', description: 'Acción a realizar: TRANSFER | RETURN', enum: ['TRANSFER', 'RETURN'] },
        targetEmployeeId: { type: 'string', description: 'ID del empleado destino (solo para TRANSFER)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario operador' },
      },
      required: ['assetId', 'action', 'tenantId', 'userId'],
    },
  },
  {
    name: 'confirm_digital_seal',
    description: 'Autorizar y sellar digitalmente actas de entrega o vacaciones vía voz. Requiere rol OWNER.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario firmante (OWNER)' },
        documentType: { type: 'string', description: 'Tipo de documento a sellar (opcional)', enum: ['ACTA_ENTREGA', 'APROBACION_VACACIONES'] },
        context: { type: 'object', description: 'Datos dinámicos para el acta (assetName, employeeName, etc.)' },
      },
      required: ['tenantId', 'userId', 'documentType', 'context'],
    },
  },
  {
    name: 'access_security_audit',
    description: 'Auditoría forense de silos de conocimiento y riesgos de acceso digital. Requiere rol OWNER.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        employeeId: { type: 'string', description: 'Opcional: ID de un empleado específico para auditar su huella digital' },
      },
      required: ['tenantId'],
    },
  },
  
  // ========== MARKETING HUB ==========
  {
    name: 'generate_marketing_copy',
    description: 'Generar contenido publicitario o para redes sociales usando IA (Gemma 4).',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Tema o producto del que hablar' },
        platform: { type: 'string', enum: ['LINKEDIN', 'YOUTUBE', 'TIKTOK', 'EMAIL'], description: 'Plataforma destino' },
        tone: { type: 'string', enum: ['professional', 'aggressive', 'friendly', 'educational'], description: 'Tono del mensaje' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['topic', 'platform', 'tenantId'],
    },
  },
  {
    name: 'analyze_marketing_sentiment',
    description: 'Analizar el sentimiento de un texto (comentarios, feedback, reviews).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Texto a analizar' },
        platform: { type: 'string', description: 'Plataforma de origen (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['text', 'tenantId'],
    },
  },
  {
    name: 'suggest_campaign_optimization',
    description: 'Sugerir mejoras para campañas de marketing basadas en datos históricos y analíticas.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'ID de la campaña (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['tenantId'],
    },
  },

  // ========== DEALS / PIPELINE ==========
  {
    name: 'create_deal',
    description: 'Crear un nuevo deal (oportunidad) en el pipeline de ventas',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del deal' },
        leadId: { type: 'string', description: 'ID del lead asociado (opcional)' },
        contactId: { type: 'string', description: 'ID del contacto (opcional)' },
        monto: { type: 'number', description: 'Monto del deal (opcional)' },
        etapa: { type: 'string', description: 'Etapa del pipeline (default: prospecto)' },
        probabilidad: { type: 'number', description: 'Probabilidad de cierre % (opcional)' },
        fechaCierre: { type: 'string', description: 'Fecha estimada de cierre ISO (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['nombre', 'tenantId'],
    },
  },
  {
    name: 'update_deal',
    description: 'Actualizar un deal existente',
    inputSchema: {
      type: 'object',
      properties: {
        dealId: { type: 'string', description: 'ID del deal a actualizar' },
        nombre: { type: 'string', description: 'Nuevo nombre (opcional)' },
        monto: { type: 'number', description: 'Nuevo monto (opcional)' },
        etapa: { type: 'string', description: 'Nueva etapa (opcional)' },
        probabilidad: { type: 'number', description: 'Nueva probabilidad % (opcional)' },
        fechaCierre: { type: 'string', description: 'Nueva fecha de cierre ISO (opcional)' },
        notas: { type: 'string', description: 'Notas adicionales (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['dealId', 'tenantId'],
    },
  },
  {
    name: 'list_deals',
    description: 'Listar deals con filtros (etapa, prioridad, búsqueda)',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        etapa: { type: 'string', description: 'Filtrar por etapa (opcional)' },
        prioridad: { type: 'string', description: 'Filtrar por prioridad (baja, media, alta)', enum: ['baja', 'media', 'alta'] },
        leadId: { type: 'string', description: 'Filtrar por lead (opcional)' },
        contactId: { type: 'string', description: 'Filtrar por contacto (opcional)' },
        search: { type: 'string', description: 'Búsqueda por nombre (opcional)' },
        page: { type: 'number', description: 'Página (default: 1)' },
        limit: { type: 'number', description: 'Límite por página (default: 20)' },
      },
      required: ['tenantId'],
    },
  },
  {
    name: 'prequalify_lead',
    description: 'Skill avanzado: Registra nota, actualiza estado del deal y busca en catálogo para recomendación',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'ID del lead' },
        nota: { type: 'string', description: 'Contenido de la nota' },
        dealId: { type: 'string', description: 'ID del deal a actualizar (opcional)' },
        searchQuery: { type: 'string', description: 'Búsqueda en catálogo para recomendación (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['leadId', 'tenantId'],
    },
  },

  // ========== ERP FINANZAS ==========
  {
    name: 'create_supplier',
    description: 'Registrar un nuevo proveedor en el sistema',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del proveedor' },
        email: { type: 'string', description: 'Email del proveedor (opcional)' },
        telefono: { type: 'string', description: 'Teléfono (opcional)' },
        direccion: { type: 'string', description: 'Dirección completa (opcional). Para estructura detallada usar los campos separados: tipoVia, nombreVia, numero, escalera, piso, puerta, codigoPostal, ciudad, provincia, pais' },
        tipoVia: { type: 'string', description: 'Tipo de vía: Calle, Avenida, Plaza, etc. (opcional)' },
        nombreVia: { type: 'string', description: 'Nombre de la calle o avenida (opcional)' },
        numero: { type: 'string', description: 'Número de portal (opcional)' },
        escalera: { type: 'string', description: 'Escalera (opcional)' },
        piso: { type: 'string', description: 'Piso (opcional)' },
        puerta: { type: 'string', description: 'Puerta (opcional)' },
        codigoPostal: { type: 'string', description: 'Código Postal (opcional)' },
        ciudad: { type: 'string', description: 'Ciudad o población (opcional)' },
        provincia: { type: 'string', description: 'Provincia (opcional)' },
        pais: { type: 'string', description: 'País (opcional)' },
        rfc: { type: 'string', description: 'NIF/CIF (opcional)' },
        condicionesPago: { type: 'string', description: 'Condiciones de pago (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['nombre', 'tenantId'],
    },
  },
  {
    name: 'create_expense',
    description: 'Registrar un nuevo gasto o egreso',
    inputSchema: {
      type: 'object',
      properties: {
        descripcion: { type: 'string', description: 'Descripción del gasto' },
        monto: { type: 'number', description: 'Monto del gasto' },
        categoria: { type: 'string', description: 'Categoría (ej: operativos, nomina, inventario)' },
        proveedorId: { type: 'string', description: 'ID del proveedor (opcional)' },
        fecha: { type: 'string', description: 'Fecha del gasto ISO (default: hoy)' },
        requiereAprobacion: { type: 'boolean', description: 'Requiere aprobación (default: false)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['descripcion', 'monto', 'categoria', 'tenantId'],
    },
  },
  {
    name: 'analyze_burn_rate',
    description: 'Analizar la relación entre ingresos y gastos para determinar la salud financiera',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        mesInicio: { type: 'string', description: 'Mes de inicio (YYYY-MM) (opcional)' },
        mesFin: { type: 'string', description: 'Mes de fin (YYYY-MM) (opcional)' },
      },
      required: ['tenantId'],
    },
  },

  // ========== ERP INVENTARIO ==========
  {
    name: 'adjust_stock',
    description: 'Ajustar niveles de stock (entrada, salida o transferencia)',
    inputSchema: {
      type: 'object',
      properties: {
        productoId: { type: 'string', description: 'ID del producto' },
        tipo: { type: 'string', description: 'Tipo de ajuste', enum: ['entrada', 'salida', 'transferencia'] },
        cantidad: { type: 'number', description: 'Cantidad a ajustar' },
        almacenOrigenId: { type: 'string', description: 'ID almacén origen (opcional para transferencia)' },
        almacenDestinoId: { type: 'string', description: 'ID almacén destino (opcional para transferencia)' },
        motivo: { type: 'string', description: 'Motivo del ajuste (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['productoId', 'tipo', 'cantidad', 'tenantId'],
    },
  },
  {
    name: 'get_inventory_health',
    description: 'Analizar la salud del inventario y predecir rupturas de stock',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        almacenId: { type: 'string', description: 'ID del almacén (opcional)' },
      },
      required: ['tenantId'],
    },
  },

  // ========== ERP PROYECTOS ==========
  {
    name: 'get_project_profitability',
    description: 'Calcular la rentabilidad real de un proyecto vinculando ingresos y costos',
    inputSchema: {
      type: 'object',
      properties: {
        proyectoId: { type: 'string', description: 'ID del proyecto' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['proyectoId', 'tenantId'],
    },
  },

  // ========== ERP RRHH ==========
  {
    name: 'talent_retention_risk',
    description: 'Analizar riesgo de fuga de talento basado en métricas y patrones',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        umbralRiesgo: { type: 'number', description: 'Umbral de riesgo (0-100, default: 70)' },
      },
      required: ['tenantId'],
    },
  },
  {
    name: 'get_employee_confidential_data',
    description: 'Obtener datos confidenciales de un empleado (solo RRHH/OWNER)',
    inputSchema: {
      type: 'object',
      properties: {
        employeeId: { type: 'string', description: 'ID del empleado' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['employeeId', 'tenantId'],
    },
  },

  // ========== ERP PRODUCCIÓN ==========
  {
    name: 'calculate_production_cost',
    description: 'Calcular costo de producción de una orden incluyendo materiales y mano de obra',
    inputSchema: {
      type: 'object',
      properties: {
        ordenProduccionId: { type: 'string', description: 'ID de la orden de producción' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['ordenProduccionId', 'tenantId'],
    },
  },

  // ========== ERP CALIDAD ==========
  {
    name: 'detect_quality_anomalies',
    description: 'Detectar anomalías de calidad en producción usando análisis de patrones',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        fechaInicio: { type: 'string', description: 'Fecha inicio ISO (opcional)' },
        fechaFin: { type: 'string', description: 'Fecha fin ISO (opcional)' },
      },
      required: ['tenantId'],
    },
  },

  // ========== MARKETING AVANZADO ==========
  {
    name: 'generate_web_creator_block',
    description: 'Generar bloque de contenido para landing page con IA',
    inputSchema: {
      type: 'object',
      properties: {
        tipoBloque: { type: 'string', description: 'Tipo: hero, features, testimonials, cta, etc.' },
        producto: { type: 'string', description: 'Producto o servicio a promocionar' },
        tono: { type: 'string', description: 'Tono', enum: ['professional', 'friendly', 'urgent', 'educational'] },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['tipoBloque', 'producto', 'tenantId'],
    },
  },
  {
    name: 'generate_seo_metadata',
    description: 'Generar metadatos SEO (title, description, keywords) para una página',
    inputSchema: {
      type: 'object',
      properties: {
        tituloPagina: { type: 'string', description: 'Título de la página' },
        contenido: { type: 'string', description: 'Contenido principal (opcional)' },
        palabrasClave: { type: 'string', description: 'Palabras clave objetivo (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
      },
      required: ['tituloPagina', 'tenantId'],
    },
  },
];

// ============== HANDLERS MCP ==============

/**
 * Lista todas las herramientas disponibles
 */
export function handleListTools(): MCPListToolsResponse {
  return {
    tools: MCP_TOOLS,
  };
}

/**
 * Ejecuta una herramienta
 */
export async function handleCallTool(request: MCPCallToolRequest): Promise<MCPCallToolResponse> {
  const { name, arguments: args } = request;

  // Verificar que el tool existe
  const tool = MCP_TOOLS.find(t => t.name === name);
  if (!tool) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Tool "${name}" no encontrado` }),
      }],
      isError: true,
    };
  }

  // Validar argumentos requeridos
  const missingArgs = tool.inputSchema.required?.filter(
    arg => args[arg] === undefined || args[arg] === null
  ) || [];

  if (missingArgs.length > 0) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ 
          error: `Argumentos requeridos faltantes: ${missingArgs.join(', ')}` 
        }),
      }],
      isError: true,
    };
  }

  try {
    // 1. Resolver el contexto del usuario para validación de roles de confianza
    const user = await prisma.user.findUnique({
      where: { id: args.userId as string },
      include: { role: true }
    });

    // Validación de Rol OWNER para acciones sensibles
    const sensitiveTools = ['authorize_bulk_expenses', 'orchestrate_secure_payroll'];
    if (sensitiveTools.includes(name) && user?.role?.nombre !== 'OWNER') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            error: 'Soberanía Denegada: Esta acción requiere privilegios de OWNER.',
            requiredRole: 'OWNER',
            currentRole: user?.role?.nombre || 'UNKNOWN'
          }),
        }],
        isError: true,
      };
    }

    const ctx = {
      tenantId: args.tenantId as string,
      user: user ? {
        id: user.id,
        email: user.email,
        role: user.role?.nombre
      } : undefined
    };

    // Marcar source como 'mcp' si no está definido
    const enrichedArgs = {
      ...args,
      ctx, // Pasamos el contexto de seguridad
      source: (args.source || 'mcp') as 'api' | 'app' | 'automation' | 'mcp' | 'webhook',
    };

    // Ejecutar el skill correspondiente
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await executeSkill(name as SkillName, enrichedArgs as any);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
      isError: false,
    };
  } catch (error) {
    console.error(`[MCP] Error ejecutando tool ${name}:`, error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Error desconocido',
          tool: name,
        }),
      }],
      isError: true,
    };
  }
}

// ============== SERVER INFO ==============

export const MCP_SERVER_INFO = {
  name: 'volkern-crm',
  version: '1.0.0',
  description: 'Volkern CRM MCP Server - Expone skills del CRM como herramientas para LLMs',
  capabilities: {
    tools: {
      listTools: true,
      callTool: true,
    },
  },
};

/**
 * Obtiene información del servidor
 */
export function handleServerInfo() {
  return MCP_SERVER_INFO;
}
