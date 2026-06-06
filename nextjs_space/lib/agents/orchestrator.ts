import { rateLimiter } from './rate-limiter';
import { intentClassifier } from './intent-classifier';
import { confidenceChecker } from './confidence-checker';
import { commandValidator } from './command-validator';
import { entityExtractor } from './entity-extractor';
import { responseFormatter } from './response-formatter';
import { fallbackAgent } from './fallback-agent';
import { prisma } from '@/lib/db';

export interface OrchestratorRequest {
  message: string;
  userId: string;
  tenantId: string;
  chatId?: string;
  isAuthenticated: boolean;
  userRole?: string;
  context?: string;
  previousEntities?: Record<string, any>;
}

export interface OrchestratorResponse {
  success: boolean;
  response: string;
  shouldWaitForMoreInfo?: boolean;
  requiresConfirmation?: boolean;
  confirmationId?: string;
  action?: string;
  metadata?: Record<string, any>;
}

export class MinimaxOrchestratorAgent {
  private retryCount = new Map<string, number>();

  async process(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    const startTime = Date.now();
    const { message, userId, tenantId, chatId, isAuthenticated, userRole, context } = request;

    try {
      const rateCheck = await rateLimiter.check({ userId, chatId, tenantId, isAuthenticated });
      if (!rateCheck.allowed) {
        const response = await responseFormatter.format({ intent: 'rate_limited', action: 'error', success: false, error: rateCheck.message });
        return { success: false, response: `${response.emoji} ${response.text}`, metadata: { rateLimited: true, resetAfter: rateCheck.resetAfterSeconds } };
      }

      const pendingConfirmation = await this.checkPendingConfirmation(userId);
      if (pendingConfirmation) return this.handlePendingConfirmation(request, pendingConfirmation);

      let activeContext = context;
      const pendingCtx = await this.getPendingContext(userId);
      if (pendingCtx) {
        activeContext = `El usuario está respondiendo a la intención previa: ${pendingCtx.intent}. Parámetros faltantes solicitados: ${pendingCtx.missingParams?.join(', ')}. Parámetros ya recolectados: ${JSON.stringify(pendingCtx.collectedParams)}`;
      }

      const classification = await intentClassifier.classify({ message, userId, tenantId, context: activeContext });
      
      // Si hay contexto pendiente, determinar si el usuario está respondiendo a la pregunta anterior
      const hasActionVerb = /\b(crea|busca|agenda|cancela|registra|envía|muestra|lista|dame|nuev[oa]|convierte|genera|analiza|sugiere|aprueba|ajusta|completa|cierra|califica|rectifica)\b/i.test(message);
      const likelyContinuation = pendingCtx && (
        classification.intent === 'consulta_general' || 
        classification.intent === 'unknown' || 
        classification.confidence < 0.7 ||
        (!hasActionVerb && classification.confidence < 0.85)
      );
      
      if (likelyContinuation) {
        classification.intent = pendingCtx!.intent;
        classification.confidence = Math.max(classification.confidence, 0.9);
        // Mezclar parámetros
        classification.extractedParams = { ...pendingCtx.collectedParams, ...classification.extractedParams };
      }

      const minConfidence = classification.intent === 'consulta_general' ? 0.4 : 0.5;
      if (classification.confidence < minConfidence) {
        const response = await responseFormatter.format({ intent: 'consulta_general', action: 'ask_clarification', success: false });
        return { success: false, response: `${response.emoji} ${response.text}`, shouldWaitForMoreInfo: true };
      }

      const confidenceVerdict = await confidenceChecker.check({ intent: classification.intent, confidence: classification.confidence, message, userId, tenantId, hasAllRequiredParams: !classification.needsMoreInfo });

      if (confidenceVerdict.action !== 'execute') {
        const response = await responseFormatter.format({ intent: classification.intent, action: confidenceVerdict.action as any, success: false, missingParams: classification.missingParams });
        return { success: false, response: `${response.emoji} ${response.text}`, shouldWaitForMoreInfo: confidenceVerdict.action === 'ask_clarification', metadata: { confidence: classification.confidence, action: confidenceVerdict.action } };
      }

      // Si teníamos un contexto pendiente, pasamos los parámetros pre-recolectados al extractor
      const contextForExtractor = pendingCtx ? `Parámetros previos: ${JSON.stringify(pendingCtx.collectedParams)}` : activeContext;
      const extraction = await entityExtractor.extract({ 
        message, 
        intent: classification.intent, 
        context: contextForExtractor,
        previousEntities: pendingCtx?.collectedParams
      });
      
      const validation = await commandValidator.validate({ intent: classification.intent, params: extraction.entities, message, userId, tenantId, userRole });

      if (validation.requiresConfirmation) {
        await this.savePendingConfirmation({ userId, tenantId, intent: classification.intent, params: extraction.entities, message, confirmationId: validation.confirmationId! });
        const response = await responseFormatter.format({ intent: classification.intent, action: 'confirmation_pending', success: true, confirmationId: validation.confirmationId });
        return { success: true, response: `${response.emoji} ${response.text}`, requiresConfirmation: true, confirmationId: validation.confirmationId, shouldWaitForMoreInfo: true };
      }

      if (!validation.isValid) {
        const response = await responseFormatter.format({ intent: classification.intent, action: 'error', success: false, error: validation.message });
        return { success: false, response: `${response.emoji} ${response.text}` };
      }

      if (extraction.missingParams.length > 0) {
        const response = await responseFormatter.format({ intent: classification.intent, action: 'ask_clarification', success: false, missingParams: extraction.missingParams });
        await this.savePendingContext(userId, { intent: classification.intent, missingParams: extraction.missingParams, collectedParams: extraction.entities });
        return { success: false, response: `${response.emoji} ${response.text}`, shouldWaitForMoreInfo: true, metadata: { missingParams: extraction.missingParams } };
      }

      if (classification.intent === 'consulta_general' || classification.intent === 'unknown') {
        const response = await responseFormatter.format({ intent: classification.intent, action: 'success', success: true });
        await this.clearPendingContext(userId);
        return { success: true, response: `${response.emoji} ${response.text}`, action: classification.intent };
      }

      const skillResult = await this.executeSkill(classification.intent, extraction.entities, tenantId);
      const response = await responseFormatter.format({ intent: classification.intent, action: 'execute', success: true, data: skillResult });

      await this.clearPendingContext(userId);
      this.retryCount.delete(userId);
      await this.logSuccess({ userId, tenantId, intent: classification.intent, duration: Date.now() - startTime, result: skillResult });

      return { success: true, response: `${response.emoji} ${response.text}`, action: classification.intent, metadata: { result: skillResult, quickReplies: response.quickReplies } };

    } catch (error) {
      const attemptCount = this.retryCount.get(userId) || 0;
      const fallbackResult = await fallbackAgent.handle({ userId, tenantId, originalMessage: message, error: error as Error, errorType: this.determineErrorType(error), attempts: attemptCount, timestamp: new Date(), intent: 'unknown' });

      if (fallbackResult.shouldRetry && attemptCount < 3) {
        this.retryCount.set(userId, attemptCount + 1);
        await this.delay(fallbackResult.retryAfter || 1000);
        return this.process({ ...request, context: `[Reintento ${attemptCount + 1}] ${context || ''}` });
      }

      const response = await responseFormatter.format({ intent: 'consulta_general', action: 'fallback_to_human', success: false, error: fallbackResult.response });
      await this.logError({ userId, tenantId, message, error: error as Error, fallbackResult });
      this.retryCount.delete(userId);

      return { success: false, response: `${response.emoji} ${response.text}`, metadata: { error: true, fallbackLevel: fallbackResult.level } };
    }
  }

  private async executeSkill(intent: string, params: any, tenantId: string): Promise<any> {
    const { skills, executeSkill } = await import('@/lib/skills');
    const skillMap: Record<string, any> = {
      'crear_lead': 'create_lead',
      'actualizar_lead': 'update_lead',
      'buscar_lead': 'get_lead',
      'convertir_lead': 'convert_lead',
      'obtener_telefono': 'obtener_telefono',
      'registrar_interaccion': 'registrar_interaccion',
      'diagnosticos_lead': 'complete_diagnosis',
      'agendar_cita': 'create_booking',
      'mis_citas': 'get_upcoming_bookings',
      'cancelar_cita': 'cancel_booking',
      'confirmar_cita': 'confirm_booking',
      'reagendar_cita': '__reschedule__',
      'auto_agendar': 'auto_schedule',
      'crear_tarea': 'create_task',
      'completar_tarea': 'complete_task',
      'mis_tareas': 'get_pending_tasks',
      'crear_nota': 'create_note',
      'ver_notas': 'get_notes_by_lead',
      'crear_conversacion': 'create_conversation',
      'cerrar_conversacion': 'close_conversation',
      'enviar_mensaje': 'send_message',
      'enviar_mensaje_interno': '__internal__',
      'crear_negocio': 'create_deal',
      'actualizar_negocio': 'update_deal',
      'mis_negocios': 'list_deals',
      'listar_contactos': 'list_contacts',
      'listar_leads': 'list_leads',
      'calificar_lead': 'prequalify_lead',
      'detectar_ghosting': 'detect_ghosting',
      'generar_ruta_exito': 'generate_success_path',
      'crear_factura': 'create_invoice',
      'cancelar_factura': 'cancel_invoice',
      'estado_fiscal': 'get_invoice_fiscal_status',
      'rectificar_factura': 'rectify_invoice',
      'registrar_gasto': 'create_expense',
      'registrar_gasto_vision': 'register_expense_vision',
      'crear_proveedor': 'create_supplier',
      'analizar_gastos': 'analyze_burn_rate',
      'proyeccion_financiera': 'project_financial_forecast',
      'proyeccion_impuestos': 'tax_prospector',
      'auditar_integridad_gastos': 'audit_expense_integrity',
      'salud_inventario': 'get_inventory_health',
      'ajustar_stock': 'adjust_stock',
      'consumir_inventario': 'process_inventory_consumption',
      'watchdog_inventario': 'inventory_watchdog',
      'buscar_producto': 'search_catalog',
      'gestionar_catalogo': 'export_catalog',
      'generar_copy': 'generate_marketing_copy',
      'analizar_sentimiento': 'analyze_marketing_sentiment',
      'sugerir_campania': 'suggest_campaign_optimization',
      'resumen_rrhh': 'get_hr_daily_brief',
      'aprobar_vacaciones': 'approve_vacation_voice',
      'riesgo_rotacion': 'talent_retention_risk',
      'rentabilidad_proyecto': 'get_project_profitability',
      'desviaciones_proyecto': 'detect_project_drifting',
      'auditar_integridad': 'audit_finance_integrity',
      'actividad_campo': 'get_field_activity',
      'auditar_fugas_materiales': 'audit_material_leaks',
      'analizar_rentabilidad_global': 'analyze_global_profitability',
      'calcular_costo_produccion': 'calculate_production_cost',
      'detectar_anomalias_calidad': 'detect_quality_anomalies',
      'verificar_mermas': 'verify_waste_integrity',
      'registrar_inspeccion_calidad': 'register_qc_inspection',

      // Real Estate
      'generar_descripcion_inmueble': 'generate_property_description',
      'sugerir_precio_inmueble': 'suggest_price_based_on_market',
      'calificar_inmueble': 'calculate_property_quality_score',
      'buscar_inmuebles': 'search_properties_by_filters',
      'recomendar_inmuebles': 'recommend_properties',
      'calcular_comision_franquicia': 'calculate_franchise_commissions',

      // Logística
      'estado_envio': 'get_shipment_status',
      'rastrear_pedido': 'track_order',
      'salud_flota': 'check_fleet_health',
      'optimizar_ruta': 'optimize_route',
      'reorganizar_almacen': 'suggest_warehouse_reorganization',
    };
    const skillName = skillMap[intent];

    if (intent === 'enviar_mensaje_interno') {
      const { sendInternalMessage } = await import('@/lib/mcp/skills/internalMessageSkill');
      return await sendInternalMessage({ ...params, tenantId });
    }

    if (intent === 'buscar_lead' && (!params.email || !params.nombre)) {
      const leads = await prisma.lead.findMany({
        where: { tenantId },
        take: 10,
        select: { id: true, nombre: true, name: true, email: true, phone: true, telefono: true, stage: true }
      });
      return { leads, count: leads.length };
    }

    if (intent === 'reagendar_cita') {
      const { prisma } = await import('@/lib/db');
      const cita = await prisma.cita.findFirst({ where: { id: params.citaId || params.citaId, tenantId } });
      if (!cita) throw new Error('No se encontró la cita especificada');
      const fechaHora = params.fechaHora || new Date(`${params.fecha}T${params.hora || '12:00'}:00`);
      const updated = await prisma.cita.update({
        where: { id: cita.id },
        data: { fechaHora, estado: 'pendiente' }
      });
      return { success: true, cita: updated, message: `Cita reprogramada para ${fechaHora.toLocaleString()}` };
    }

    if (!skillName || !skills[skillName]) throw new Error(`No hay skill para ${intent}`);
    const normalizedParams = this.normalizeParams(params);
    return await executeSkill(skillName as any, { ...normalizedParams, tenantId });
  }

  private normalizeParams(params: Record<string, any>): Record<string, any> {
    const normalized = { ...params };
    const map: Record<string, string> = {
      fecha: 'date',
      telefono: 'phone',
      monto: 'amount',
      concepto: 'concept',
      duracion: 'duration',
      prioridad: 'priority',
      titulo: 'title',
      descripcion: 'description',
      fechaVencimiento: 'dueDate',
      fechaHora: 'datetime',
    };
    for (const [spanish, english] of Object.entries(map)) {
      if (normalized[spanish] !== undefined && normalized[english] === undefined) {
        normalized[english] = normalized[spanish];
      }
    }
    return normalized;
  }

  private async checkPendingConfirmation(userId: string): Promise<any> {
    return await prisma.pendingCommand.findFirst({ where: { userId, status: 'pending', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  }

  private async handlePendingConfirmation(request: OrchestratorRequest, pending: any): Promise<OrchestratorResponse> {
    const result = await commandValidator.validate({ intent: pending.intent, params: pending.params, message: request.message, userId: request.userId, tenantId: request.tenantId, isReauth: true, confirmationResponse: request.message });
    if (result.isValid) return this.process({ ...request, message: pending.originalMessage, context: `[Confirmado: ${request.message}]` });
    const response = await responseFormatter.format({ intent: pending.intent, action: 'error', success: false, error: result.message });
    return { success: false, response: `${response.emoji} ${response.text}` };
  }

  private async savePendingConfirmation(data: any): Promise<void> {
    await prisma.pendingCommand.upsert({ where: { id: data.confirmationId }, update: data, create: { id: data.confirmationId, userId: data.userId, tenantId: data.tenantId, intent: data.intent, params: data.params as any, originalMessage: data.message, status: 'pending', expiresAt: new Date(Date.now() + 60 * 1000) } });
  }

  private async savePendingContext(userId: string, ctx: any): Promise<void> {
    try {
      await prisma.chatbotAuditLog.upsert({ 
        where: { id: `ctx_${userId}` }, 
        update: { detectedEntities: ctx }, 
        create: { 
          id: `ctx_${userId}`,
          status: 'PENDING_CONTEXT', 
          userId, 
          tenantId: 'pending', 
          detectedEntities: ctx,
          createdAt: new Date()
        } 
      });
    } catch (e) { console.error('Error saving pending context:', e); }
  }

  private async clearPendingContext(userId: string): Promise<void> {
    try {
      await prisma.chatbotAuditLog.deleteMany({ where: { userId, status: 'PENDING_CONTEXT' } });
      await prisma.chatbotAuditLog.delete({ where: { id: `ctx_${userId}` } }).catch(() => {});
    } catch (e) { console.error('Error clearing pending context:', e); }
  }

  private async getPendingContext(userId: string): Promise<any> {
    try {
      const record = await prisma.chatbotAuditLog.findUnique({ where: { id: `ctx_${userId}` } });
      if (record && record.detectedEntities) {
        // Only return if it's less than 5 minutes old
        if (Date.now() - record.createdAt.getTime() < 5 * 60 * 1000) {
          return record.detectedEntities;
        } else {
          await this.clearPendingContext(userId);
        }
      }
    } catch (e) { console.error('Error getting pending context:', e); }
    return null;
  }

  private determineErrorType(error: any): string {
    if (error.message?.includes('timeout')) return 'timeout';
    if (error.message?.includes('rate')) return 'rate_limit';
    if (error.message?.includes('parse')) return 'parse_error';
    if (error.message?.includes('validation')) return 'validation_error';
    if (error.message?.includes('API')) return 'api_error';
    return 'unknown';
  }

  private delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }

  private async logSuccess(data: any): Promise<void> {
    try { 
      await prisma.chatbotAuditLog.create({ 
        data: { 
          userId: data.userId, 
          tenantId: data.tenantId, 
          intent: data.intent, 
          status: 'SUCCESS',
          executionTimeMs: data.duration,
          skillResult: data.result ? (typeof data.result === 'object' ? data.result : { raw: data.result }) : undefined,
          createdAt: new Date()
        } 
      }); 
    } catch (e) { console.error('Error logging success:', e); }
  }

  private async logError(data: any): Promise<void> {
    try { 
      await prisma.chatbotAuditLog.create({ 
        data: { 
          userId: data.userId, 
          tenantId: data.tenantId, 
          status: 'ERROR',
          inputRaw: data.message?.substring(0, 500),
          errorMessage: data.error?.message || 'Unknown error',
          skillResult: data.fallbackResult ? { fallback: data.fallbackResult } : undefined,
          createdAt: new Date()
        } 
      }); 
    } catch (e) { console.error('Error logging error:', e); }
  }

  async getStats(tenantId: string, hours: number = 24): Promise<any> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const logs = await prisma.chatbotAuditLog.findMany({ where: { tenantId, event: { in: ['orchestrator_success', 'orchestrator_error'] }, createdAt: { gte: since } } });
    const successCount = logs.filter(l => l.event === 'orchestrator_success').length;
    const total = logs.length;
    return { total, successRate: total > 0 ? (successCount / total) * 100 : 100 };
  }
}

export const orchestrator = new MinimaxOrchestratorAgent();