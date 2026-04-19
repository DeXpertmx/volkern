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
        fuente: { type: 'string', description: 'De dónde vino: web, referido, redes_sociales, etc.' },
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
    description: 'Crear una tarea asociada a un lead',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'ID del lead' },
        titulo: { type: 'string', description: 'Título de la tarea' },
        descripcion: { type: 'string', description: 'Descripción (opcional)' },
        tipo: { type: 'string', description: 'Tipo de tarea', enum: ['llamada', 'email', 'reunion', 'seguimiento', 'otro'] },
        fechaVencimiento: { type: 'string', description: 'Fecha de vencimiento ISO (opcional)' },
        asignadoAId: { type: 'string', description: 'ID del usuario asignado (opcional)' },
        tenantId: { type: 'string', description: 'ID del tenant' },
        userId: { type: 'string', description: 'ID del usuario creador (opcional)' },
        source: { type: 'string', description: 'Fuente', enum: ['api', 'app', 'automation', 'mcp', 'webhook'] },
      },
      required: ['leadId', 'titulo', 'tenantId'],
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
    description: 'Obtener próximas citas del tenant',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'ID del tenant' },
        limit: { type: 'number', description: 'Número máximo de citas (default: 10)' },
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
        documentType: { type: 'string', enum: ['ACTA_ENTREGA', 'APROBACION_VACACIONES'] },
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
