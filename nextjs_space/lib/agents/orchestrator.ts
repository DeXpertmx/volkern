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

      const classification = await intentClassifier.classify({ message, userId, tenantId, context });
      
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

      const extraction = await entityExtractor.extract({ message, intent: classification.intent, context });
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
    const skillMap: Record<string, any> = { 'crear_lead': 'create_lead', 'buscar_lead': 'get_lead', 'agendar_cita': 'create_booking', 'mis_citas': 'get_upcoming_bookings', 'cancelar_cita': 'cancel_booking', 'crear_tarea': 'create_task', 'registrar_gasto': 'create_expense', 'enviar_mensaje': 'send_message', 'convertir_lead': 'convert_lead', 'enviar_mensaje_interno': '__internal__' };
    const skillName = skillMap[intent];

    if (intent === 'enviar_mensaje_interno') {
      const { sendInternalMessage } = await import('@/lib/mcp/skills/internalMessageSkill');
      return await sendInternalMessage({ ...params, tenantId });
    }

    if (intent === 'buscar_lead' && (!params.email || !params.nombre)) {
      const leads = await prisma.lead.findMany({
        where: { tenantId },
        take: 10,
        select: { id: true, name: true, email: true, phone: true, stage: true }
      });
      return { leads, count: leads.length };
    }

    if (!skillName || !skills[skillName]) throw new Error(`No hay skill para ${intent}`);
    return await executeSkill(skillName as any, { ...params, tenantId });
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