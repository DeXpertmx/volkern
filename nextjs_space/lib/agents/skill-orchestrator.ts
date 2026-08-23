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
import { isModuleActive, type CrmModule } from '@/lib/plans';

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
  'crear_contacto': 'create_contact',
  'crear_empresa': 'create_company',
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
  'reprogramar_tarea': 'reschedule_task',
  'mis_tareas': 'get_pending_tasks',
  'tareas_vencidas': 'get_overdue_tasks',
  'tareas_hoy': 'get_tasks_due_today',

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
  'listar_proveedores': 'list_suppliers',
  'analizar_gastos': 'analyze_burn_rate',
  'proyeccion_financiera': 'project_financial_forecast',
  'proyeccion_impuestos': 'tax_prospector',
  'analizar_rentabilidad_global': 'analyze_global_profitability',
  'auditar_integridad_gastos': 'audit_expense_integrity',
  'impuestos_pendientes': 'tax_overview',
  'resumen_impuesto': 'tax_model_report',
  'marcar_impuesto_presentado': 'file_tax_return',
  'balance_general': 'balance_sheet',
  'cuenta_resultados': 'profit_loss',
  'balance_comprobacion': 'trial_balance',

  // ─── ERP: Inventario ───
  'salud_inventario': 'get_inventory_health',
  'ajustar_stock': 'adjust_stock',
  'consumir_inventario': 'process_inventory_consumption',
  'watchdog_inventario': 'inventory_watchdog',
  'buscar_producto': 'buscar_catalogo',
  'buscar_catalogo': 'buscar_catalogo',
  'gestionar_catalogo': 'export_catalog',
  'crear_cotizacion': 'create_cotizacion',

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

  // ─── Fábrica Avanzada (Vigésimo entrenamiento) ───
  'ejecutar_nomina': 'orchestrate_secure_payroll',
  'anomalias_asistencia': 'detect_attendance_anomalies',
  'predecir_fallo_activo': 'predict_asset_failure',
  'dashboard_mantenimiento': 'get_maintenance_dashboard',
  'proyeccion_capacidad': 'analyze_capacity_forecast',
  'simular_escenario_produccion': 'simulate_production_scenario',
  'readiness_produccion': 'analyze_production_readiness',
  'plan_compras': 'suggest_procurement_plan',
  'optimizar_secuenciacion': 'analyze_schedule_optimization',
  'maximizar_rentabilidad_scheduling': 'maximize_schedule_profitability',
  'rentabilidad_produccion': 'analyze_production_profitability',

  // ─── RRHH/Producción avanzada (Vigésimo-primer entrenamiento) ───
  'resumen_gastos_pendientes': 'summarize_pending_expenses',
  'impacto_vacaciones': 'analyze_vacation_impact',
  'detectar_cuellos_botella': 'detect_bottlenecks',
  'estrategia_ensamblaje': 'suggest_assembly_strategy',
  'firma_digital_hr': 'orchestrate_digital_signature',

  // ─── Gobernanza RRHH y Ads (Vigésimo-segundo entrenamiento) ───
  'autorizar_gastos': 'authorize_bulk_expenses',
  'transferir_activo': 'orchestrate_asset_transfer',
  'auditar_accesos': 'access_security_audit',
  'kit_offboarding': 'generate_offboarding_security_kit',
  'pausar_programacion': 'toggle_ad_schedule',

  // ─── Consultas avanzadas, Web Creator y Training (Vigésimo-tercer entrenamiento) ───
  'detalles_negocio': 'get_deal_details',
  'detalles_contacto': 'get_contact_details',
  'detalles_producto': 'get_catalog_item_details',
  'exportar_catalogo': 'export_catalog_chat',
  'sugerir_respuesta': 'suggest_customer_response',
  'generar_landing': 'generate_landing_draft_chat',

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

  // ─── ADS (programación de campañas y tests A/B) ───
  'programar_campania': 'create_ad_schedule',
  'listar_horarios': 'list_ad_schedules',
  'eliminar_horario': 'delete_ad_schedule',
  'crear_test_ab': 'create_ab_test',
  'iniciar_test_ab': 'start_ab_test',
  'evaluar_test_ab': 'calculate_ab_test_significance',
  'declarar_ganador': 'declare_ab_test_winner',

  // ─── Real Estate ───
  'generar_descripcion_inmueble': 'generate_property_description',
  'sugerir_precio_inmueble': 'suggest_price_based_on_market',
  'calificar_inmueble': 'calculate_property_quality_score',
  'buscar_inmuebles': 'search_properties_by_filters',
  'recomendar_inmuebles': 'recommend_properties',
  'calcular_comision_franquicia': 'calculate_franchise_commissions',

  // ─── Insurance / Seguros ───
  'crear_poliza': 'create_poliza',
  'mis_polizas': 'list_polizas',
  'polizas_por_vencer': 'polizas_por_vencer',
  'renovaciones_pendientes': 'renovaciones_pendientes',
  'clientes_sin_contacto': 'clientes_sin_contacto',
  'crear_siniestro': 'create_siniestro',
  'listar_siniestros': 'list_siniestros',
  'actualizar_siniestro': 'update_siniestro',

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
   * Plan: Agendar cita (1 paso → create_booking)
   * El antiguo plan de 3 pasos (validate_availability → auto_schedule →
   * confirm_booking) estaba roto para el chatbot: validate_availability no
   * existe como skill y auto_schedule exige leadId (el orquestador solo pasa
   * nombre/email). create_booking (createBookingWrapper) resuelve el
   * lead/contacto por nombre o email, valida fecha/hora y pide el email si
   * falta — cubre el flujo completo.
   */
  planAgendarCita(entities: Record<string, string>, tenantId: string): ExecutionPlan {
    if (!entities.fecha && !entities.date) {
      return this.createAskUserPlan('fecha', 'agendar_cita');
    }

    if (!entities.hora && !entities.time) {
      return this.createAskUserPlan('hora', 'agendar_cita');
    }

    return {
      steps: [
        {
          action: 'create_booking',
          params: {
            tenantId,
            fecha: entities.fecha || entities.date,
            hora: entities.hora || entities.time,
            nombre: entities.nombre,
            email: entities.email,
            telefono: entities.telefono,
            titulo: entities.servicio || entities.service || entities.titulo,
            tipo: entities.tipo,
            ubicacion: entities.ubicacion,
            empresa: entities.empresa,
            // Confirmación del chatbot: "registrarContacto=true" solo llega si
            // el usuario confirmó registrar a una persona que no está en el CRM.
            registrarContacto: entities.registrarContacto,
          }
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
      cargo: '💼 ¿Cuál es su cargo o puesto?',
      linkedin: '🔗 ¿Cuál es su perfil de LinkedIn?',
      ubicacion: '📍 ¿Cuál es su ubicación?',
      tags: '🏷️ ¿Algunas etiquetas para este registro? (separadas por coma)',

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
      factura: '🧾 ¿Cuál es el número de la factura? (ej: FAC-001 o #123)',
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

      // Seguros / Insurance (solo claves no existentes; fechaVencimiento y producto ya están arriba)
      numeroPoliza: '🧾 ¿Cuál es el número de la póliza?',
      fechaInicio: '📅 ¿Cuál es la fecha de inicio de la póliza? (ej: 2026-08-01)',
      aseguradora: '🏢 ¿Con qué aseguradora es la póliza? (ej: AXA, MAPFRE, Qualitas)',
      ramo: '📋 ¿Cuál es el ramo del seguro? (ej: AUTO, HOGAR, VIDA)',
      primaAnual: '💰 ¿Cuál es la prima anual?',
      sumaAsegurada: '🛡️ ¿Cuál es la suma asegurada?',
      formaPago: '💳 ¿Cuál es la forma de pago? (anual, semestral, trimestral, mensual)',
      cliente: '👤 ¿Quién es el cliente asegurado? (nombre o email)',
      dias: '📆 ¿En cuántos días? (ej: 30, 60, 90)',
      riesgo: '⚠️ ¿Quieres ver solo las de riesgo? (sí/no)',

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
   * Verificar acceso al skill por tenant.
   *
   * Usa el sistema real de módulos del plan (isModuleActive), igual que el resto
   * de la plataforma: los módulos incluidos en el plan están activos por defecto
   * y los TenantFeature solo los sobrescriben (habilitar/deshabilitar explícito).
   * Esto reemplaza el antiguo mapeo a features inventados ('crm', 'booking',
   * 'deals', ...) que nunca existían en tenantFeatures y bloqueaba todo.
   */
  async checkSkillAccess(tenantId: string, intent: string): Promise<boolean> {
    try {
      // select explícito: evita que Prisma intente leer columnas del modelo
      // Tenant que aún no existen en la BD de producción (ej. monedaInferida,
      // agregada en una migración pendiente), lo que lanzaba una excepción que
      // el catch convertía en un falso 'sin acceso' para TODOS los intents.
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          plan: true,
          tenantFeatures: { select: { feature: true, habilitado: true } },
        },
      });

      if (!tenant) return false;

      // Mapping de intents a módulos reales del plan (CrmModule)
      const intentModules: Record<string, CrmModule> = {
        // CRM - Leads
        'crear_lead': 'leads',
        'buscar_lead': 'leads',
        'listar_leads': 'leads',
        'actualizar_lead': 'leads',
        'convertir_lead': 'leads',
        'detectar_ghosting': 'leads',
        'generar_ruta_exito': 'leads',
        'diagnosticos_lead': 'leads',
        'registrar_interaccion': 'leads',

        // CRM - Contactos
        'crear_contacto': 'contactos',
        'listar_contactos': 'contactos',
        'obtener_telefono': 'contactos',

        // CRM - Empresas
        'crear_empresa': 'empresas',

        // CRM - Citas
        'agendar_cita': 'citas',
        'mis_citas': 'citas',
        'cancelar_cita': 'citas',
        'reagendar_cita': 'citas',
        'confirmar_cita': 'citas',
        'auto_agendar': 'citas',

        // CRM - Conversaciones
        'enviar_mensaje': 'mensajes',
        'enviar_mensaje_interno': 'mensajes',
        'crear_conversacion': 'mensajes',
        'cerrar_conversacion': 'mensajes',
        'contactar_humano': 'mensajes',

        // CRM - Tareas
        'crear_tarea': 'tareas',
        'completar_tarea': 'tareas',
        'reprogramar_tarea': 'tareas',
        'mis_tareas': 'tareas',
        'tareas_vencidas': 'tareas',
        'tareas_hoy': 'tareas',

        // CRM - Notas
        'crear_nota': 'tareas',
        'ver_notas': 'tareas',

        // CRM - Pipeline
        'crear_negocio': 'pipeline',
        'actualizar_negocio': 'pipeline',
        'mis_negocios': 'pipeline',
        'calificar_lead': 'pipeline',
        'consultar_estado_pedido': 'pipeline',

        // Catálogo
        'consultar_servicios': 'catalogo',
        'consultar_precio': 'catalogo',
        'buscar_producto': 'catalogo',
        'buscar_catalogo': 'catalogo',
        'gestionar_catalogo': 'catalogo',
        'crear_cotizacion': 'catalogo',

        // Finanzas - Facturación & Gastos
        'crear_factura': 'finanzas',
        'cancelar_factura': 'finanzas',
        'estado_fiscal': 'finanzas',
        'rectificar_factura': 'finanzas',
        'registrar_gasto': 'finanzas',
        'registrar_gasto_vision': 'finanzas',
        'crear_proveedor': 'finanzas',
        'listar_proveedores': 'finanzas',
        'analizar_gastos': 'finanzas',
        'proyeccion_financiera': 'finanzas',
        'proyeccion_impuestos': 'finanzas',
        'analizar_rentabilidad_global': 'finanzas',
        'auditar_integridad_gastos': 'finanzas',
        'auditar_integridad': 'finanzas',
        'impuestos_pendientes': 'finanzas',
        'resumen_impuesto': 'finanzas',
        'marcar_impuesto_presentado': 'finanzas',
        'balance_general': 'finanzas',
        'cuenta_resultados': 'finanzas',
        'balance_comprobacion': 'finanzas',

        // ERP - Inventario
        'salud_inventario': 'inventario',
        'ajustar_stock': 'inventario',
        'consumir_inventario': 'inventario',
        'watchdog_inventario': 'inventario',
        'auditar_fugas_materiales': 'inventario',

        // ERP - Producción & Calidad
        'calcular_costo_produccion': 'produccion',
        'verificar_mermas': 'produccion',
        'detectar_anomalias_calidad': 'calidad',
        'registrar_inspeccion_calidad': 'calidad',

        // ERP - Proyectos
        'rentabilidad_proyecto': 'proyectos',
        'desviaciones_proyecto': 'proyectos',

        // Fábrica Avanzada (Vigésimo entrenamiento)
        'predecir_fallo_activo': 'produccion',
        'dashboard_mantenimiento': 'produccion',
        'proyeccion_capacidad': 'produccion',
        'simular_escenario_produccion': 'produccion',
        'readiness_produccion': 'produccion',
        'plan_compras': 'produccion',
        'optimizar_secuenciacion': 'produccion',
        'maximizar_rentabilidad_scheduling': 'produccion',
        'rentabilidad_produccion': 'produccion',

        // RRHH
        'resumen_rrhh': 'rrhh',
        'aprobar_vacaciones': 'rrhh',
        'riesgo_rotacion': 'rrhh',
        'ejecutar_nomina': 'rrhh',
        'anomalias_asistencia': 'rrhh',
        'resumen_gastos_pendientes': 'rrhh',
        'impacto_vacaciones': 'rrhh',
        'firma_digital_hr': 'rrhh',

        // Producción (bloque 21)
        'detectar_cuellos_botella': 'produccion',
        'estrategia_ensamblaje': 'produccion',

        // Gobernanza RRHH y Ads (bloque 22)
        'autorizar_gastos': 'rrhh',
        'transferir_activo': 'rrhh',
        'auditar_accesos': 'rrhh',
        'kit_offboarding': 'rrhh',
        'pausar_programacion': 'ads',

        // Consultas avanzadas, Web Creator y Training (bloque 23)
        'detalles_negocio': 'pipeline',
        'detalles_contacto': 'contactos',
        'detalles_producto': 'catalogo',
        'exportar_catalogo': 'catalogo',
        'sugerir_respuesta': 'contactos',
        'generar_landing': 'cms',

        // Logística
        'estado_envio': 'logistica',
        'rastrear_pedido': 'logistica',
        'tracking_envio': 'logistica',
        'salud_flota': 'logistica',
        'estado_flota': 'logistica',
        'optimizar_ruta': 'logistica',
        'reorganizar_almacen': 'logistica',
        'actividad_campo': 'logistica',

        // Marketing
        'generar_copy': 'campanas',
        'analizar_sentimiento': 'campanas',
        'sugerir_campania': 'campanas',
        'generar_web_block': 'cms',
        'generar_seo': 'cms',
        'sugerir_automatizacion': 'automatizaciones',
        // ADS
        'programar_campania': 'ads',
        'listar_horarios': 'ads',
        'eliminar_horario': 'ads',
        'crear_test_ab': 'ads',
        'iniciar_test_ab': 'ads',
        'evaluar_test_ab': 'ads',
        'declarar_ganador': 'ads',      // Real Estate (usa el catálogo de inmuebles)
      'generar_descripcion_inmueble': 'catalogo',
      'sugerir_precio_inmueble': 'catalogo',
      'calificar_inmueble': 'catalogo',
      'buscar_inmuebles': 'catalogo',
      'recomendar_inmuebles': 'catalogo',
      'calcular_comision_franquicia': 'catalogo',

      // Insurance / Seguros
      'crear_poliza': 'insurance',
      'mis_polizas': 'insurance',
      'polizas_por_vencer': 'insurance',
      'renovaciones_pendientes': 'insurance',
      'clientes_sin_contacto': 'insurance',
      'crear_siniestro': 'insurance',
      'listar_siniestros': 'insurance',
      'actualizar_siniestro': 'insurance',
      };

      const module = intentModules[intent];
      if (!module) return true; // Si no hay mapping, permitir

      return isModuleActive(module, tenant.plan, tenant.tenantFeatures);
    } catch (error) {
      // Log imprescindible: un fallo aquí bloquearía todos los intents en silencio
      console.error('[SkillOrchestrator] checkSkillAccess error:', error);
      return false;
    }
  },

  // ==================== MENSAJES ====================

  /**
   * Mensaje cuando no hay acceso al módulo
   */
  getNoAccessMessage(intent: string): string {
    const messages: Record<string, string> = {
      'crear_lead': '👥 No tienes acceso al módulo de *Leads*. Contacta al administrador para activarlo.',
      'buscar_lead': '👥 No tienes acceso al módulo de *Leads*. Contacta al administrador para activarlo.',
      'listar_leads': '👥 No tienes acceso al módulo de *Leads*. Contacta al administrador para activarlo.',
      'actualizar_lead': '👥 No tienes acceso al módulo de *Leads*. Contacta al administrador para activarlo.',
      'convertir_lead': '👥 No tienes acceso al módulo de *Leads*. Contacta al administrador para activarlo.',
      'crear_contacto': '✅ No tienes acceso al módulo de *Contactos*. Contacta al administrador para activarlo.',
      'listar_contactos': '✅ No tienes acceso al módulo de *Contactos*. Contacta al administrador para activarlo.',
      'crear_empresa': '🏢 No tienes acceso al módulo de *Empresas*. Contacta al administrador para activarlo.',
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
      'crear_cotizacion': '📋 No tienes acceso al *Catálogo*. Contacta al administrador.',
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
      'crear_proveedor': '🏢 No tienes acceso al módulo de *Proveedores*. Contacta al administrador.',
      'listar_proveedores': '🏢 No tienes acceso al módulo de *Proveedores*. Contacta al administrador.',
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
      'auditar_integridad_gastos': '💳 No tienes acceso al módulo de *Finanzas*. Contacta al administrador.',
      'auditar_integridad': '💳 No tienes acceso al módulo de *Finanzas*. Contacta al administrador.',
      'impuestos_pendientes': '🧾 No tienes acceso al módulo de *Impuestos*. Contacta al administrador.',
      'resumen_impuesto': '🧾 No tienes acceso al módulo de *Impuestos*. Contacta al administrador.',
      'marcar_impuesto_presentado': '🧾 No tienes acceso al módulo de *Impuestos*. Contacta al administrador.',
      'balance_general': '📊 No tienes acceso al módulo de *Contabilidad*. Contacta al administrador.',
      'cuenta_resultados': '📊 No tienes acceso al módulo de *Contabilidad*. Contacta al administrador.',
      'balance_comprobacion': '📊 No tienes acceso al módulo de *Contabilidad*. Contacta al administrador.',
      'auditar_fugas_materiales': '📦 No tienes acceso al módulo de *Inventario*. Contacta al administrador.',
      'actividad_campo': '🚚 No tienes acceso al módulo de *Logística*. Contacta al administrador.',
      'resumen_rrhh': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'aprobar_vacaciones': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'riesgo_rotacion': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'ejecutar_nomina': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'anomalias_asistencia': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'resumen_gastos_pendientes': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'impacto_vacaciones': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'firma_digital_hr': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'detectar_cuellos_botella': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
      'estrategia_ensamblaje': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
      'autorizar_gastos': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'transferir_activo': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'auditar_accesos': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'kit_offboarding': '👥 No tienes acceso al módulo de *RRHH*. Contacta al administrador.',
      'pausar_programacion': '📣 No tienes acceso al módulo de *Ads*. Contacta al administrador para activarlo.',
      'detalles_negocio': '💼 No tienes acceso al módulo de *Pipeline*. Contacta al administrador para activarlo.',
      'detalles_contacto': '👥 No tienes acceso al módulo de *Contactos*. Contacta al administrador para activarlo.',
      'detalles_producto': '📦 No tienes acceso al módulo de *Catálogo*. Contacta al administrador para activarlo.',
      'exportar_catalogo': '📦 No tienes acceso al módulo de *Catálogo*. Contacta al administrador para activarlo.',
      'sugerir_respuesta': '👥 No tienes acceso al módulo de *Contactos*. Contacta al administrador para activarlo.',
      'generar_landing': '🎨 No tienes acceso al módulo de *Web Creator*. Contacta al administrador para activarlo.',
      'predecir_fallo_activo': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
      'dashboard_mantenimiento': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
      'proyeccion_capacidad': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
      'simular_escenario_produccion': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
      'readiness_produccion': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
      'plan_compras': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
      'optimizar_secuenciacion': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
      'maximizar_rentabilidad_scheduling': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
      'rentabilidad_produccion': '🏭 No tienes acceso al módulo de *Producción*. Contacta al administrador.',
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
      'programar_campania': '📣 No tienes acceso al módulo de *Ads*. Contacta al administrador para activarlo.',
      'listar_horarios': '📣 No tienes acceso al módulo de *Ads*. Contacta al administrador para activarlo.',
      'eliminar_horario': '📣 No tienes acceso al módulo de *Ads*. Contacta al administrador para activarlo.',
      'crear_test_ab': '📣 No tienes acceso al módulo de *Ads*. Contacta al administrador para activarlo.',
      'iniciar_test_ab': '📣 No tienes acceso al módulo de *Ads*. Contacta al administrador para activarlo.',
      'evaluar_test_ab': '📣 No tienes acceso al módulo de *Ads*. Contacta al administrador para activarlo.',
      'declarar_ganador': '📣 No tienes acceso al módulo de *Ads*. Contacta al administrador para activarlo.',
      'generar_descripcion_inmueble': '🏠 No tienes acceso al módulo de *Real Estate*. Contacta al administrador.',
      'sugerir_precio_inmueble': '🏠 No tienes acceso al módulo de *Real Estate*. Contacta al administrador.',
      'calificar_inmueble': '🏠 No tienes acceso al módulo de *Real Estate*. Contacta al administrador.',
      'buscar_inmuebles': '🏠 No tienes acceso al módulo de *Real Estate*. Contacta al administrador.',
      'recomendar_inmuebles': '🏠 No tienes acceso al módulo de *Real Estate*. Contacta al administrador.',
      'calcular_comision_franquicia': '🏠 No tienes acceso al módulo de *Real Estate*. Contacta al administrador.',
      'crear_poliza': '🛡️ No tienes acceso al módulo de *Seguros*. Contacta al administrador para activarlo.',
      'mis_polizas': '🛡️ No tienes acceso al módulo de *Seguros*. Contacta al administrador para activarlo.',
      'polizas_por_vencer': '🛡️ No tienes acceso al módulo de *Seguros*. Contacta al administrador para activarlo.',
      'renovaciones_pendientes': '🛡️ No tienes acceso al módulo de *Seguros*. Contacta al administrador para activarlo.',
      'clientes_sin_contacto': '🛡️ No tienes acceso al módulo de *Seguros*. Contacta al administrador para activarlo.',
      'crear_siniestro': '🛡️ No tienes acceso al módulo de *Seguros*. Contacta al administrador para activarlo.',
      'listar_siniestros': '🛡️ No tienes acceso al módulo de *Seguros*. Contacta al administrador para activarlo.',
      'actualizar_siniestro': '🛡️ No tienes acceso al módulo de *Seguros*. Contacta al administrador para activarlo.',
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
🛡️ *Seguros*: Pólizas, renovaciones, aseguradoras y cartera IA

¿En qué puedo ayudarte?`;
  },

  /**
   * Obtener descripción de skill
   */
  getSkillDescription(skillName: string): string {
    const descriptions: Record<string, string> = {
      // Contactos & Leads
      'create_lead': 'Crear un nuevo lead',
      'create_contact': 'Crear un nuevo contacto',
      'create_company': 'Crear una nueva empresa',
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

      // Consultas avanzadas, Web Creator y Training
      'get_deal_details': 'Ver ficha de negocio',
      'get_contact_details': 'Ver ficha de contacto',
      'suggest_customer_response': 'Sugerir respuesta al cliente',
      'generate_landing_draft_chat': 'Generar borrador de landing',

      // Catálogo
      'export_catalog': 'Exportar catálogo',
      'get_catalog_item_details': 'Ver ficha de producto/servicio',
      'export_catalog_chat': 'Exportar catálogo',
      'consultar_precio': 'Buscar en catálogo',
      'buscar_producto': 'Buscar en catálogo',
      'buscar_catalogo': 'Buscar en catálogo',
      'search_catalog': 'Buscar en catálogo',
      'create_cotizacion': 'Crear borrador de cotización desde catálogo',

      // Facturación
      'create_invoice': 'Crear factura',
      'cancel_invoice': 'Cancelar factura',
      'rectify_invoice': 'Rectificar factura',
      'get_invoice_fiscal_status': 'Estado fiscal de factura',

      // Finanzas
      'create_expense': 'Registrar gasto',
      'create_supplier': 'Crear proveedor',
      'list_suppliers': 'Listar proveedores',
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

      // Fábrica Avanzada (Vigésimo entrenamiento)
      'orchestrate_secure_payroll': 'Ejecutar nómina segura',
      'detect_attendance_anomalies': 'Anomalías de asistencia',
      'predict_asset_failure': 'Predecir fallo de activo',
      'get_maintenance_dashboard': 'Dashboard de mantenimiento',
      'analyze_capacity_forecast': 'Proyección de capacidad',
      'simulate_production_scenario': 'Simular escenario de producción',
      'analyze_production_readiness': 'Readiness de producción',
      'suggest_procurement_plan': 'Plan de compras',
      'analyze_schedule_optimization': 'Optimizar secuenciación',
      'maximize_schedule_profitability': 'Maximizar rentabilidad de scheduling',
      'analyze_production_profitability': 'Rentabilidad de producción',

      // RRHH/Producción avanzada (Vigésimo-primer entrenamiento)
      'summarize_pending_expenses': 'Resumen de gastos pendientes de autorizar',
      'analyze_vacation_impact': 'Impacto de vacaciones',
      'detect_bottlenecks': 'Detectar cuellos de botella',
      'suggest_assembly_strategy': 'Estrategia de ensamblaje',
      'orchestrate_digital_signature': 'Firma digital de RRHH',

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

      // Insurance / Seguros
      'create_poliza': 'Registrar una póliza de seguro',
      'list_polizas': 'Listar pólizas del tenant',
      'polizas_por_vencer': 'Consultar pólizas próximas a vencer',
      'renovaciones_pendientes': 'Consultar renovaciones pendientes',
      'clientes_sin_contacto': 'Detectar clientes asegurados sin contacto reciente',
      'create_siniestro': 'Reportar un siniestro contra una póliza',
      'list_siniestros': 'Listar siniestros del tenant',
      'update_siniestro': 'Avanzar el estado de un siniestro',

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
