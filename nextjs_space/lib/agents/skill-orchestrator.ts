/**
 * SkillOrchestratorAgent - Orquestador de planes de ejecución
 * 
 * Convierte intent → plan multi-step dinámico
 * Usa contexto para completar entidades faltantes
 * Permite flujos condicionales
 * 
 * Arquitectura:
 * - Intentos simples (1 paso): mapeo directo INTENT_TO_SKILL → genericPlan
 * - Intentos complejos (multi-paso): plan builders específicos
 * - Intentos sin mapeo: fallback con mensaje de ayuda
 */

import { prisma } from '@/lib/db';

export interface ExecutionPlan {
  steps: ExecutionStep[];
}

export interface ExecutionStep {
  action: string;
  params?: Record<string, any>;
}

export interface OrchestratorInput {
  intent: string;
  entities: Record<string, string>;
  context: {
    tenantId: string;
    userId: string;
    pendingIntent?: string;
    collectedEntities: Record<string, string>;
    missingEntities: string[];
  };
  tenantId: string;
}

// ==================== MAPEO INTENT → SKILL ====================

/**
 * Mapeo completo de todos los intents a sus skills correspondientes.
 * ~75+ intents organizados por dominio.
 */
const INTENT_TO_SKILL: Record<string, string> = {
  // ─── CRM: Contactos & Leads ───
  'crear_lead': 'create_lead',
  'buscar_lead': 'find_lead_by_email',
  'listar_contactos': 'list_contacts',
  'listar_leads': 'list_leads',
  'actualizar_lead': 'update_lead',
  'convertir_lead': 'convert_lead',
  'obtener_telefono': 'obtener_telefono',
  'registrar_interaccion': 'registrar_interaccion',
  'diagnosticos_lead': 'complete_diagnosis',

  // ─── CRM: Citas & Bookings ───
  'agendar_cita': 'create_booking',
  'mis_citas': 'get_upcoming_bookings',
  'cancelar_cita': 'cancel_booking',
  'reagendar_cita': 'reagendar_cita', // multi-step (special handler)
  'confirmar_cita': 'confirm_booking',
  'auto_agendar': 'auto_schedule',

  // ─── CRM: Conversaciones & Mensajes ───
  'enviar_mensaje': 'send_message',
  'enviar_mensaje_interno': 'send_message',
  'crear_conversacion': 'create_conversation',
  'cerrar_conversacion': 'close_conversation',

  // ─── CRM: Tareas ───
  'crear_tarea': 'create_task',
  'completar_tarea': 'complete_task',
  'mis_tareas': 'get_pending_tasks',

  // ─── CRM: Notas ───
  'crear_nota': 'create_note',
  'ver_notas': 'get_notes_by_lead',

  // ─── CRM: Pipeline de Ventas ───
  'crear_negocio': 'create_deal',
  'actualizar_negocio': 'update_deal',
  'mis_negocios': 'list_deals',
  'calificar_lead': 'prequalify_lead',

  // ─── CRM: Proactividad ───
  'detectar_ghosting': 'detect_ghosting',
  'generar_ruta_exito': 'generate_success_path',

  // ─── CRM: Interacciones ───
  'consultar_estado_pedido': 'get_deal',
  'consultar_servicios': 'export_catalog',
  'consultar_precio': 'buscar_catalogo',
  'contactar_humano': 'transfer_to_human',

  // ─── Finanzas: Facturación & Veri*factu ───
  'crear_factura': 'create_invoice',
  'cancelar_factura': 'cancel_invoice',
  'estado_fiscal': 'get_invoice_fiscal_status',
  'rectificar_factura': 'rectify_invoice',

  // ─── Finanzas: Gastos & Finanzas ───
  'registrar_gasto': 'create_expense',
  'registrar_gasto_vision': 'register_expense_vision',
  'crear_proveedor': 'create_supplier',
  'analizar_gastos': 'analyze_burn_rate',
  'proyeccion_financiera': 'project_financial_forecast',
  'proyeccion_impuestos': 'tax_prospector',
  'analizar_rentabilidad_global': 'analyze_global_profitability',
  'auditar_integridad_gastos': 'audit_expense_integrity',

  // ─── ERP: Inventario ───
  'salud_inventario': 'get_inventory_health',
  'ajustar_stock': 'adjust_stock',
  'consumir_inventario': 'process_inventory_consumption',
  'watchdog_inventario': 'inventory_watchdog',
  'buscar_producto': 'buscar_catalogo',
  'buscar_catalogo': 'buscar_catalogo',
  'gestionar_catalogo': 'export_catalog',

  // ─── ERP: Producción & Calidad ───
  'calcular_costo_produccion': 'calculate_production_cost',
  'detectar_anomalias_calidad': 'detect_quality_anomalies',
  'verificar_mermas': 'verify_waste_integrity',
  'registrar_inspeccion_calidad': 'register_qc_inspection',

  // ─── ERP: Proyectos ───
  'rentabilidad_proyecto': 'get_project_profitability',
  'desviaciones_proyecto': 'detect_project_drifting',

  // ─── RRHH ───
  'resumen_rrhh': 'get_hr_daily_brief',
  'aprobar_vacaciones': 'approve_vacation_voice',
  'riesgo_rotacion': 'talent_retention_risk',

  // ─── Logística ───
  'estado_envio': 'get_shipment_status',
  'rastrear_pedido': 'track_order',
  'tracking_envio': 'get_shipment_status',
  'salud_flota': 'check_fleet_health',
  'estado_flota': 'check_fleet_health',
  'optimizar_ruta': 'optimize_route',
  'reorganizar_almacen': 'suggest_warehouse_reorg',

  // ─── Marketing ───
  'generar_copy': 'generate_marketing_copy',
  'analizar_sentimiento': 'analyze_marketing_sentiment',
  'sugerir_campania': 'suggest_campaign_optimization',
  'generar_web_block': 'generate_web_creator_block',
  'generar_seo': 'generate_seo_metadata',
  'sugerir_automatizacion': 'advise_on_automation_rules',

  // ─── Real Estate ───
  'generar_descripcion_inmueble': 'generate_property_description',
  'sugerir_precio_inmueble': 'suggest_price_based_on_market',
  'calificar_inmueble': 'calculate_property_quality_score',
  'buscar_inmuebles': 'search_properties_by_filters',
  'recomendar_inmuebles': 'recommend_properties',
  'calcular_comision_franquicia': 'calculate_property_quality_score',

  // ─── Operaciones ───
  'auditar_integridad': 'audit_finance_integrity',
  'actividad_campo': 'get_field_activity',
  'auditar_fugas_materiales': 'audit_material_leaks',

  // ─── Especiales ───
  'consulta_general': 'help',
  'help': 'help',
};

/**
 * Intents que requieren planes multi-paso en lugar de ejecución directa.
 */
const COMPLEX_INTENTS = new Set([
  'agendar_cita',
  'cancelar_cita',
  'reagendar_cita',
  'calificar_lead',
  'consumir_inventario',
  'registrar_interaccion',
]);

// ==================== EXPORT ====================

export const SkillOrchestratorAgent = {
  /**
   * Crear plan de ejecución desde intent
   */
  async createPlan(
    intentData: { intent: string; entities: Record<string, string>; missingEntities: string[] },
    context: any,
    tenantId: string
  ): Promise<{ success: boolean; plan?: ExecutionPlan; response?: string; error?: string }> {
    const { intent, entities, missingEntities } = intentData;

    // 🧠 1. Merge con contexto (entity completion)
    const mergedEntities = {
      ...(context.collectedEntities || {}),
      ...entities
    };

    // 🛡️ 2. Verificar acceso al skill
    const hasAccess = await this.checkSkillAccess(tenantId, intent);
    if (!hasAccess) {
      return {
        success: true,
        response: this.getNoAccessMessage(intent)
      };
    }

    // 🧩 3. Si hay missing entities, generar plan para pedir info
    if (missingEntities && missingEntities.length > 0) {
      return {
        success: true,
        plan: this.createAskUserPlan(missingEntities[0], intent)
      };
    }

    // 🧩 4. Generar plan según intent
    const plan = this.buildPlan(intent, mergedEntities, tenantId);
    
    if (!plan) {
      return {
        success: true,
        response: this.getHelpResponse()
      };
    }

    return {
      success: true,
      plan
    };
  },

  /**
   * Construir plan según intent
   * - Intents complejos → plan builders específicos
   * - Intents simples → genericPlan (1 paso directo al skill)
   */
  buildPlan(intent: string, entities: Record<string, string>, tenantId: string): ExecutionPlan | null {
    // Intentos complejos con planes multi-paso
    const planBuilders: Record<string, (entities: Record<string, string>, tenantId: string) => ExecutionPlan | null> = {
      'agendar_cita': this.planAgendarCita,
      'cancelar_cita': this.planCancelarCita,
      'reagendar_cita': this.planReagendarCita,
      'calificar_lead': this.planCalificarLead,
      'consumir_inventario': this.planConsumirInventario,
      'registrar_interaccion': this.planRegistrarInteraccion,
      'help': this.planHelp,
    };

    const builder = planBuilders[intent];
    if (builder) {
      return builder.call(this, entities, tenantId);
    }

    // Intentos simples: mapeo directo a skill
    return this.genericPlan(intent, entities, tenantId);
  },

  // ==================== PLAN GENÉRICO (1 PASO) ====================

  /**
   * Plan genérico para intents simples: 1 paso directo al skill.
   * Usa el INTENT_TO_SKILL mapping para determinar qué skill ejecutar.
   */
  genericPlan(intent: string, entities: Record<string, string>, tenantId: string): ExecutionPlan | null {
    const skillName = INTENT_TO_SKILL[intent];
    if (!skillName) return null;

    return {
      steps: [
        {
          action: skillName,
          params: {
            tenantId,
            ...entities,
          }
        }
      ]
    };
  },

  // ==================== PLANES POR INTENT COMPLEJO ====================

  /**
   * Plan: Agendar cita (3 pasos: validar disponibilidad → agendar → confirmar)
   */
  planAgendarCita(entities: Record<string, string>, tenantId: string): ExecutionPlan {
    if (!entities.fecha && !entities.date) {
      return this.createAskUserPlan('fecha', 'agendar_cita');
    }

    if (!entities.hora && !entities.time) {
      return this.createAskUserPlan('hora', 'agendar_cita');
    }

    const fecha = entities.fecha || entities.date;
    const hora = entities.hora || entities.time;
    const servicio = entities.servicio || entities.service;

    if (!servicio) {
      return this.createAskUserPlan('servicio', 'agendar_cita');
    }

    return {
      steps: [
        {
          action: 'validate_availability',
          params: { tenantId, fecha, hora }
        },
        {
          action: 'auto_schedule',
          params: {
            tenantId,
            fecha,
            hora,
            servicio,
            customerName: entities.nombre || entities.customer_name,
            email: entities.email
          }
        },
        {
          action: 'confirm_booking',
          params: { tenantId }
        }
      ]
    };
  },

  /**
   * Plan: Cancelar cita (buscar cita → cancelar)
   */
  planCancelarCita(entities: Record<string, string>, tenantId: string): ExecutionPlan {
    if (!entities.citaId && !entities.appointment_id && !entities.nombre && !entities.email) {
      return this.createAskUserPlan('nombre', 'cancelar_cita');
    }

    return {
      steps: [
        {
          action: 'cancel_booking',
          params: {
            tenantId,
            bookingId: entities.citaId || entities.appointment_id,
            nombre: entities.nombre,
            email: entities.email,
            fecha: entities.fecha,
            motivo: entities.motivo
          }
        }
      ]
    };
  },

  /**
   * Plan: Reagendar cita (2 pasos: cancelar vieja → agendar nueva)
   */
  planReagendarCita(entities: Record<string, string>, tenantId: string): ExecutionPlan {
    if (!entities.citaId && !entities.nombre) {
      return this.createAskUserPlan('citaId', 'reagendar_cita');
    }

    if (!entities.fecha) {
      return this.createAskUserPlan('fecha', 'reagendar_cita');
    }

    if (!entities.hora) {
      return this.createAskUserPlan('hora', 'reagendar_cita');
    }

    return {
      steps: [
        {
          action: 'cancel_booking',
          params: {
            tenantId,
            bookingId: entities.citaId,
            nombre: entities.nombre,
            email: entities.email
          }
        },
        {
          action: 'auto_schedule',
          params: {
            tenantId,
            fecha: entities.fecha,
            hora: entities.hora,
            customerName: entities.nombre,
            email: entities.email
          }
        },
        {
          action: 'confirm_booking',
          params: { tenantId, isReschedule: true }
        }
      ]
    };
  },

  /**
   * Plan: Calificar lead (3 pasos: nota → deal → búsqueda en catálogo)
   */
  planCalificarLead(entities: Record<string, string>, tenantId: string): ExecutionPlan {
    if (!entities.email && !entities.nombre) {
      return this.createAskUserPlan('email', 'calificar_lead');
    }

    return {
      steps: [
        {
          action: 'prequalify_lead',
          params: {
            tenantId,
            email: entities.email,
            nombre: entities.nombre,
            nota: entities.nota
          }
        }
      ]
    };
  },

  /**
   * Plan: Consumir inventario (con soporte BoM: descuenta componentes automáticamente)
   */
  planConsumirInventario(entities: Record<string, string>, tenantId: string): ExecutionPlan {
    if (!entities.producto && !entities.productoId) {
      return this.createAskUserPlan('producto', 'consumir_inventario');
    }

    if (!entities.cantidad) {
      return this.createAskUserPlan('cantidad', 'consumir_inventario');
    }

    return {
      steps: [
        {
          action: 'process_inventory_consumption',
          params: {
            tenantId,
            producto: entities.producto || entities.productoId,
            cantidad: Number(entities.cantidad),
            almacenId: entities.almacenId
          }
        }
      ]
    };
  },

  /**
   * Plan: Registrar interacción (puede enviar email real si tipo=email)
   */
  planRegistrarInteraccion(entities: Record<string, string>, tenantId: string): ExecutionPlan {
    if (!entities.email && !entities.nombre && !entities.tipo && !entities.contenido) {
      return this.createAskUserPlan('tipo', 'registrar_interaccion');
    }

    if (!entities.contenido) {
      return this.createAskUserPlan('contenido', 'registrar_interaccion');
    }

    return {
      steps: [
        {
          action: 'registrar_interaccion',
          params: {
            tenantId,
            email: entities.email,
            nombre: entities.nombre,
            tipo: entities.tipo,
            contenido: entities.contenido,
            resultado: entities.resultado
          }
        }
      ]
    };
  },

  /**
   * Plan: Help
   */
  planHelp(): ExecutionPlan {
    return {
      steps: [
        { action: 'help', params: {} }
      ]
    };
  },

  /**
   * Plan: Fallback (intent no reconocido)
   */
  planFallback(): ExecutionPlan {
    return {
      steps: [
        {
          action: 'ask_user',
          params: {
            message: '🤔 No entendí bien tu mensaje. ¿Puedes reformular o escribir con otras palabras?'
          }
        }
      ]
    };
  },

  // ==================== MISSING ENTITIES ====================

  /**
   * Crear plan para pedir información faltante
   * Soporta todos los campos de todos los dominios
   */
  createAskUserPlan(missingEntity: string, intent: string): ExecutionPlan {
    const prompts: Record<string, string> = {
      // Citas
      fecha: '📅 ¿Para qué fecha? (puedes decir "mañana", "hoy", o "15/05")',
      hora: '⏰ ¿A qué hora te viene bien? (ej: 10:00, 14:30)',
      citaId: '🔖 ¿Cuál es el ID o referencia de la cita?',
      duracion: '⏱️ ¿Cuánto durará la cita? (ej: 30 min, 1 hora)',
      tipo_cita: '📋 ¿De qué tipo es la cita? (presencial, videollamada, telefónica)',
      notas_cita: '📝 ¿Alguna nota para la cita?',

      // Contactos
      email: '📧 ¿Cuál es el correo electrónico del contacto?',
      nombre: '👤 ¿Cuál es el nombre del contacto?',
      telefono: '📱 ¿Cuál es el número de teléfono?',
      empresa: '🏢 ¿Cuál es su empresa?',
      contexto: '💬 ¿Qué contexto o notas tiene este contacto?',

      // Productos / Servicios
      servicio: '📋 ¿Qué servicio o producto necesitas?',
      producto: '🛒 ¿Qué producto?',
      productoId: '🆔 ¿Cuál es el ID del producto?',
      categoria: '📂 ¿En qué categoría?',
      cantidad: '🔢 ¿Cuántos necesitas?',
      almacenId: '🏪 ¿De qué almacén?',

      // Tareas
      titulo: '📝 ¿Cuál es el título de la tarea?',
      descripcion: '📄 Describe la tarea con más detalle',
      fechaVencimiento: '📅 ¿Para cuándo necesita estar lista?',
      prioridad: '⚡ ¿Qué prioridad tiene? (alta, media, baja)',

      // Interacciones
      tipo: '📞 ¿Qué tipo de interacción fue? (llamada, email, whatsapp, reunión, nota)',
      contenido: '💬 ¿Qué ocurrió en la interacción?',
      resultado: '✅ ¿Cuál fue el resultado de la interacción?',

      // Facturación
      leadId: '🆔 ¿Cuál es el ID del lead o contacto para la factura?',
      monto: '💰 ¿Cuál es el monto?',
      concepto: '📝 ¿Cuál es el concepto?',
      invoiceId: '🧾 ¿Cuál es el ID o número de factura?',
      razon: '❓ ¿Cuál es el motivo de la rectificación?',
      motivo: '❓ ¿Cuál es el motivo?',
      proveedor: '🏢 ¿Cuál es el nombre del proveedor?',
      periodo: '📆 ¿Para qué período? (ej: este mes, último trimestre)',
      pais: '🌍 ¿Para qué país? (ej: México, España, USA)',
      fotoUrl: '📸 ¿Tienes la URL de la foto del ticket o factura?',

      // Inventario / Producción
      ordenProduccionId: '🆔 ¿Cuál es el ID de la orden de producción?',
      evidenciaUrl: '📸 ¿Tienes evidencia fotográfica?',
      lote: '🏷️ ¿Cuál es el número de lote?',
      inspector: '👤 ¿Quién realizó la inspección?',
      proyectoId: '🆔 ¿Cuál es el ID del proyecto?',

      // RRHH
      solicitudId: '🆔 ¿Cuál es el ID de la solicitud?',
      empleadoId: '🆔 ¿Cuál es el ID del empleado?',
      nota_aprobacion: '📝 ¿Quieres agregar alguna nota?',

      // Logística
      tracking: '🔢 ¿Cuál es el número de tracking o referencia?',
      pedidoId: '🆔 ¿Cuál es el ID del pedido?',
      vehiculoId: '🚛 ¿Cuál es el ID o placa del vehículo?',

      // Marketing
      tema: '🎯 ¿Sobre qué tema?',
      tono: '🎨 ¿Qué tono prefieres? (formal, casual, divertido, profesional)',
      formato: '📐 ¿En qué formato? (email, redes sociales, WhatsApp, web)',
      texto: '💬 ¿Qué texto quieres analizar?',
      tipoBloque: '🧱 ¿Qué tipo de bloque? (hero, features, testimonials, CTA, pricing)',
      tituloPagina: '📄 ¿Cuál es el título de la página?',
      palabrasClave: '🔑 ¿Alguna palabra clave específica?',

      // Real Estate
      propiedadId: '🏠 ¿Cuál es el ID de la propiedad?',
      tipo_operacion: '💰 ¿Venta o alquiler?',
      tipo_inmueble: '🏘️ ¿Qué tipo de inmueble? (casa, departamento, local, terreno)',
      zona: '📍 ¿En qué zona o ubicación?',
      precio_min: '💵 ¿Precio mínimo?',
      precio_max: '💵 ¿Precio máximo?',
      habitaciones: '🛏️ ¿Cuántas habitaciones?',
      presupuesto: '💵 ¿Cuál es el presupuesto?',
      preferencias: '🎯 ¿Tiene preferencias específicas?',
      idioma: '🌐 ¿En qué idioma?',
      agenteId: '👤 ¿Cuál es el ID del agente?',
    };

    return {
      steps: [
        {
          action: 'ask_user',
          params: {
            message: prompts[missingEntity] || `❓ ¿Podrías darme ${missingEntity}?`,
            missingEntity
          }
        }
      ]
    };
  },

  // ==================== VERIFICACIÓN DE ACCESO ====================

  /**
   * Verificar acceso al skill por tenant
   */
  async checkSkillAccess(tenantId: string, intent: string): Promise<boolean> {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { tenantFeatures: true }
      });

      if (!tenant) return false;

      // Mapping de intents a features
      const intentFeatures: Record<string, string> = {
        // CRM - Contactos & Leads
        'crear_lead': 'crm',
        'buscar_lead': 'crm',
        'listar_contactos': 'crm',
        'listar_leads': 'crm',
        'actualizar_lead': 'crm',
        'convertir_lead': 'crm',
        'obtener_telefono': 'crm',

        // CRM - Citas
        'agendar_cita': 'booking',
        'mis_citas': 'booking',
        'cancelar_cita': 'booking',
        'reagendar_cita': 'booking',
        'confirmar_cita': 'booking',
        'auto_agendar': 'booking',

        // CRM - Conversaciones
        'enviar_mensaje': 'messaging',
        'enviar_mensaje_interno': 'messaging',
        'crear_conversacion': 'messaging',
        'cerrar_conversacion': 'messaging',

        // CRM - Tareas
        'crear_tarea': 'crm',
        'completar_tarea': 'crm',
        'mis_tareas': 'crm',

        // CRM - Notas
        'crear_nota': 'crm',
        'ver_notas': 'crm',

        // CRM - Pipeline
        'crear_negocio': 'deals',
        'actualizar_negocio': 'deals',
        'mis_negocios': 'deals',
        'calificar_lead': 'deals',

        // CRM - Proactividad
        'detectar_ghosting': 'crm',
        'generar_ruta_exito': 'crm',

        // CRM - General
        'registrar_interaccion': 'crm',
        'diagnosticos_lead': 'crm',
        'consultar_servicios': 'catalog',
        'consultar_precio': 'catalog',
        'buscar_producto': 'catalog',
        'buscar_catalogo': 'catalog',
        'consultar_estado_pedido': 'deals',
        'contactar_humano': 'crm',

        // Finanzas - Facturación
        'crear_factura': 'billing',
        'cancelar_factura': 'billing',
        'estado_fiscal': 'billing',
        'rectificar_factura': 'billing',

        // Finanzas - Gastos
        'registrar_gasto': 'finance',
        'registrar_gasto_vision': 'finance',
        'crear_proveedor': 'finance',
        'analizar_gastos': 'finance',
        'proyeccion_financiera': 'finance',
        'proyeccion_impuestos': 'finance',
        'analizar_rentabilidad_global': 'finance',
        'auditar_integridad_gastos': 'finance',

        // ERP - Inventario
        'salud_inventario': 'inventory',
        'ajustar_stock': 'inventory',
        'consumir_inventario': 'inventory',
        'watchdog_inventario': 'inventory',
        'gestionar_catalogo': 'catalog',

        // ERP - Producción & Calidad
        'calcular_costo_produccion': 'production',
        'detectar_anomalias_calidad': 'quality',
        'verificar_mermas': 'production',
        'registrar_inspeccion_calidad': 'quality',

        // ERP - Proyectos
        'rentabilidad_proyecto': 'projects',
        'desviaciones_proyecto': 'projects',

        // RRHH
        'resumen_rrhh': 'hr',
        'aprobar_vacaciones': 'hr',
        'riesgo_rotacion': 'hr',

        // Logística
        'estado_envio': 'logistics',
        'rastrear_pedido': 'logistics',
        'tracking_envio': 'logistics',
        'salud_flota': 'logistics',
        'estado_flota': 'logistics',
        'optimizar_ruta': 'logistics',
        'reorganizar_almacen': 'logistics',

        // Marketing
        'generar_copy': 'marketing',
        'analizar_sentimiento': 'marketing',
        'sugerir_campania': 'marketing',
        'generar_web_block': 'marketing',
        'generar_seo': 'marketing',
        'sugerir_automatizacion': 'marketing',

        // Real Estate
        'generar_descripcion_inmueble': 'real_estate',
        'sugerir_precio_inmueble': 'real_estate',
        'calificar_inmueble': 'real_estate',
        'buscar_inmuebles': 'real_estate',
        'recomendar_inmuebles': 'real_estate',
        'calcular_comision_franquicia': 'real_estate',

        // Operaciones
        'auditar_integridad': 'advanced',
        'actividad_campo': 'advanced',
        'auditar_fugas_materiales': 'advanced',
      };

      const feature = intentFeatures[intent];
      if (!feature) return true; // Si no hay mapping, permitir

      const featureRecord = tenant.tenantFeatures.find(f => f.feature === feature);
      return featureRecord?.habilitado ?? false;
    } catch {
      return false;
    }
  },

  // ==================== MENSAJES ====================

  /**
   * Mensaje cuando no hay acceso al módulo
   */
  getNoAccessMessage(intent: string): string {
    const messages: Record<string, string> = {
      'agendar_cita': '📅 No tienes acceso al módulo de *Citas*. Contacta al administrador para activarlo.',
      'cancelar_cita': '📅 No tienes acceso al módulo de *Citas*. Contacta al administrador.',
      'mis_citas': '📅 No tienes acceso al módulo de *Citas*. Contacta al administrador.',
      'reagendar_cita': '📅 No tienes acceso al módulo de *Citas*. Contacta al administrador.',
      'confirmar_cita': '📅 No tienes acceso al módulo de *Citas*. Contacta al administrador.',
      'consultar_servicios': '📋 No tienes acceso al *Catálogo*. Contacta al administrador.',
      'consultar_precio': '📋 No tienes acceso al *Catálogo*. Contacta al administrador.',
      'buscar_producto': '📋 No tienes acceso al *Catálogo*. Contacta al administrador.',
      'buscar_catalogo': '📋 No tienes acceso al *Catálogo*. Contacta al administrador.',
      'gestionar_catalogo': '📋 No tienes acceso al *Catálogo*. Contacta al administrador.',
      'crear_negocio': '📊 No tienes acceso al *Pipeline de Ventas*. Contacta al administrador.',
      'actualizar_negocio': '📊 No tienes acceso al *Pipeline de Ventas*. Contacta al administrador.',
      'mis_negocios': '📊 No tienes acceso al *Pipeline de Ventas*. Contacta al administrador.',
      'calificar_lead': '📊 No tienes acceso al *Pipeline de Ventas*. Contacta al administrador.',
      'crear_factura': '🧾 No tienes acceso al módulo de *Facturación*. Contacta al administrador.',
      'cancelar_factura': '🧾 No tienes acceso al módulo de *Facturación*. Contacta al administrador.',
      'estado_fiscal': '🧾 No tienes acceso al módulo de *Facturación*. Contacta al administrador.',
      'rectificar_factura': '🧾 No tienes acceso al módulo de *Facturación*. Contacta al administrador.',
      'registrar_gasto': '💳 No tienes acceso al módulo de *Gastos*. Contacta al administrador.',
      'registrar_gasto_vision': '💳 No tienes acceso al módulo de *Gastos*. Contacta al administrador.',
      'analizar_gastos': '💳 No tienes acceso al módulo de *Finanzas*. Contacta al administrador.',
      'salud_inventario': '📦 No tienes acceso al módulo de *Inventario*. Contacta al administrador.',
      'ajustar_stock': '📦 No tienes acceso al módulo de *Inventario*. Contacta al administrador.',
      'consumir_inventario': '📦 No tienes acceso al módulo de *Inventario*. Contacta al administrador.',
      'watchdog_inventario': '📦 No tienes acceso al módulo de *Inventario*. Contacta al administrador.',
      'calcular_costo_produccion': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
      'verificar_mermas': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
      'detectar_anomalias_calidad': '✅ No tienes acceso al módulo de *Calidad*. Contacta al administrador.',
      'registrar_inspeccion_calidad': '✅ No tienes acceso al módulo de *Calidad*. Contacta al administrador.',
      'rentabilidad_proyecto': '📐 No tienes acceso al módulo de *Proyectos*. Contacta al administrador.',
      'desviaciones_proyecto': '📐 No tienes acceso al módulo de *Proyectos*. Contacta al administrador.',
      'resumen_rrhh': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'aprobar_vacaciones': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'riesgo_rotacion': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'estado_envio': '🚚 No tienes acceso al módulo de *Logística*. Contacta al administrador.',
      'rastrear_pedido': '🚚 No tienes acceso al módulo de *Logística*. Contacta al administrador.',
      'tracking_envio': '🚚 No tienes acceso al módulo de *Logística*. Contacta al administrador.',
      'salud_flota': '🚛 No tienes acceso al módulo de *Logística*. Contacta al administrador.',
      'estado_flota': '🚛 No tienes acceso al módulo de *Logística*. Contacta al administrador.',
      'optimizar_ruta': '🚚 No tienes acceso al módulo de *Logística*. Contacta al administrador.',
      'reorganizar_almacen': '🏪 No tienes acceso al módulo de *Logística*. Contacta al administrador.',
      'generar_copy': '📣 No tienes acceso al módulo de *Marketing*. Contacta al administrador.',
      'analizar_sentimiento': '📣 No tienes acceso al módulo de *Marketing*. Contacta al administrador.',
      'sugerir_campania': '📣 No tienes acceso al módulo de *Marketing*. Contacta al administrador.',
      'generar_web_block': '📣 No tienes acceso al módulo de *Marketing*. Contacta al administrador.',
      'generar_seo': '📣 No tienes acceso al módulo de *Marketing*. Contacta al administrador.',
      'sugerir_automatizacion': '📣 No tienes acceso al módulo de *Marketing*. Contacta al administrador.',
      'generar_descripcion_inmueble': '🏠 No tienes acceso al módulo de *Real Estate*. Contacta al administrador.',
      'sugerir_precio_inmueble': '🏠 No tienes acceso al módulo de *Real Estate*. Contacta al administrador.',
      'calificar_inmueble': '🏠 No tienes acceso al módulo de *Real Estate*. Contacta al administrador.',
      'buscar_inmuebles': '🏠 No tienes acceso al módulo de *Real Estate*. Contacta al administrador.',
      'recomendar_inmuebles': '🏠 No tienes acceso al módulo de *Real Estate*. Contacta al administrador.',
      'calcular_comision_franquicia': '🏠 No tienes acceso al módulo de *Real Estate*. Contacta al administrador.',
    };
    return messages[intent] || '❌ No tienes acceso a esta función. Contacta al administrador.';
  },

  /**
   * Mensaje de ayuda completo con todos los dominios
   */
  getHelpResponse(): string {
    return `👋 Soy *Gemma*, tu asistente de Volkern.

Puedo ayudarte con:

📅 *Citas*: Agendar, consultar, cancelar o reprogramar
👤 *Contactos*: Crear leads, buscar, actualizar, convertir
📊 *Ventas*: Pipeline, deals, oportunidades, calificar leads
📋 *Catálogo*: Consultar productos, servicios y precios
📝 *Tareas*: Crear, completar y consultar pendientes
💬 *Conversaciones*: Mensajes, notas e interacciones

💳 *Finanzas*:
• Facturación electrónica (Veri*factu)
• Gastos, proveedores y proyecciones
• Rentabilidad global e impuestos

📦 *Inventario*: Stock, consumos, watchdog y catálogo
🏭 *Producción*: Costos, mermas y control de calidad
📐 *Proyectos*: Rentabilidad y desviaciones

👥 *RRHH*: Briefing diario, vacaciones, riesgo de rotación
🚚 *Logística*: Envíos, flota, rutas y almacén
📣 *Marketing*: Copy, sentimiento, SEO y automatización
🏠 *Real Estate*: Descripciones, precios, calidad y búsqueda

¿En qué puedo ayudarte?`;
  },

  /**
   * Obtener descripción de skill
   */
  getSkillDescription(skillName: string): string {
    const descriptions: Record<string, string> = {
      // Contactos & Leads
      'create_lead': 'Crear un nuevo lead',
      'find_lead_by_email': 'Buscar lead por email',
      'list_contacts': 'Listar contactos',
      'list_leads': 'Listar leads',
      'update_lead': 'Actualizar lead',
      'convert_lead': 'Convertir lead a contacto',
      'obtener_telefono': 'Obtener teléfono de contacto',
      'registrar_interaccion': 'Registrar interacción',
      'complete_diagnosis': 'Completar diagnóstico de lead',

      // Citas
      'create_booking': 'Crear una cita',
      'get_upcoming_bookings': 'Consultar próximas citas',
      'cancel_booking': 'Cancelar una cita',
      'confirm_booking': 'Confirmar una cita',
      'auto_schedule': 'Agendar cita automáticamente',
      'validate_availability': 'Validar disponibilidad',

      // Conversaciones
      'send_message': 'Enviar mensaje',
      'create_conversation': 'Crear conversación',
      'close_conversation': 'Cerrar conversación',

      // Tareas & Notas
      'create_task': 'Crear tarea',
      'complete_task': 'Completar tarea',
      'get_pending_tasks': 'Ver tareas pendientes',
      'create_note': 'Crear nota',
      'get_notes_by_lead': 'Ver notas de lead',

      // Pipeline
      'create_deal': 'Crear deal en pipeline',
      'update_deal': 'Actualizar deal',
      'get_deal': 'Consultar deal',
      'list_deals': 'Listar deals',
      'prequalify_lead': 'Prequalificar lead',

      // Proactividad
      'detect_ghosting': 'Detectar leads inactivos',
      'generate_success_path': 'Generar ruta de éxito',

      // Catálogo
      'export_catalog': 'Exportar catálogo',
      'consultar_precio': 'Buscar en catálogo',
      'buscar_producto': 'Buscar en catálogo',
      'buscar_catalogo': 'Buscar en catálogo',
      'search_catalog': 'Buscar en catálogo',

      // Facturación
      'create_invoice': 'Crear factura',
      'cancel_invoice': 'Cancelar factura',
      'rectify_invoice': 'Rectificar factura',
      'get_invoice_fiscal_status': 'Estado fiscal de factura',

      // Finanzas
      'create_expense': 'Registrar gasto',
      'create_supplier': 'Crear proveedor',
      'register_expense_vision': 'Registrar gasto por foto',
      'analyze_burn_rate': 'Analizar gastos',
      'project_financial_forecast': 'Proyección financiera',
      'tax_prospector': 'Proyección de impuestos',
      'analyze_global_profitability': 'Rentabilidad global',
      'audit_expense_integrity': 'Auditar integridad de gastos',

      // Inventario
      'get_inventory_health': 'Salud del inventario',
      'adjust_stock': 'Ajustar stock',
      'process_inventory_consumption': 'Consumir inventario',
      'inventory_watchdog': 'Watchdog de inventario',

      // Producción & Calidad
      'calculate_production_cost': 'Calcular costo de producción',
      'verify_waste_integrity': 'Verificar mermas',
      'detect_quality_anomalies': 'Detectar anomalías de calidad',
      'register_qc_inspection': 'Registrar inspección QC',

      // Proyectos
      'get_project_profitability': 'Rentabilidad de proyecto',
      'detect_project_drifting': 'Desviaciones de proyecto',

      // RRHH
      'get_hr_daily_brief': 'Briefing diario de RRHH',
      'approve_vacation_voice': 'Aprobar vacaciones',
      'talent_retention_risk': 'Riesgo de rotación',

      // Logística
      'get_shipment_status': 'Estado de envío',
      'track_order': 'Rastrear pedido',
      'check_fleet_health': 'Salud de flota',
      'optimize_route': 'Optimizar ruta',
      'suggest_warehouse_reorg': 'Reorganizar almacén',

      // Marketing
      'generate_marketing_copy': 'Generar copy',
      'analyze_marketing_sentiment': 'Analizar sentimiento',
      'suggest_campaign_optimization': 'Sugerir campaña',
      'generate_web_creator_block': 'Generar bloque web',
      'generate_seo_metadata': 'Generar SEO',
      'advise_on_automation_rules': 'Sugerir automatización',

      // Real Estate
      'generate_property_description': 'Descripción de inmueble',
      'suggest_price_based_on_market': 'Sugerir precio',
      'calculate_property_quality_score': 'Calificar inmueble',
      'search_properties_by_filters': 'Buscar inmuebles',
      'recommend_properties': 'Recomendar inmuebles',

      // Operaciones
      'audit_finance_integrity': 'Auditar integridad financiera',
      'get_field_activity': 'Actividad en campo',
      'audit_material_leaks': 'Auditar fugas de materiales',

      // Especiales
      'transfer_to_human': 'Transferir a agente humano',
      'ask_user': 'Pedir información al usuario',
      'help': 'Mostrar ayuda',
    };
    return descriptions[skillName] || `Ejecutar ${skillName}`;
  }
};

export default SkillOrchestratorAgent;
