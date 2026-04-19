import { prisma } from '../db';

export type MarketingAuditCategory = 'SOCIAL' | 'AUTOMATION' | 'CAMPAIGN' | 'AI' | 'SECURITY' | 'COMPLIANCE';

interface AuditLogParams {
  tenantId: string;
  userId?: string;
  action: string;
  category: MarketingAuditCategory;
  entityType?: string;
  entityId?: string;
  details?: any;
  status?: 'SUCCESS' | 'FAILED' | 'WARNING';
  ipAddress?: string;
  userAgent?: string;
}

export class MarketingAuditService {
  /**
   * Registra una acción de marketing para auditoría y gobernanza.
   */
  static async log(params: AuditLogParams) {
    try {
      return await prisma.marketingAuditLog.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          action: params.action,
          category: params.category,
          entityType: params.entityType,
          entityId: params.entityId,
          details: params.details || {},
          status: params.status || 'SUCCESS',
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        }
      });
    } catch (error) {
      console.error('[MarketingAuditService] Error logging audit:', error);
    }
  }

  /**
   * Registra una decisión de la IA (Gemma 4)
   */
  static async logAiDecision(params: {
    tenantId: string;
    suggestion: string;
    context: any;
    outcome: 'ACCEPTED' | 'REJECTED' | 'DISMISSED';
    userId?: string;
  }) {
    return this.log({
      tenantId: params.tenantId,
      userId: params.userId,
      action: 'AI_SUGGESTION_OUTCOME',
      category: 'AI',
      details: {
        suggestion: params.suggestion,
        context: params.context,
        outcome: params.outcome
      }
    });
  }

  /**
   * Registra incidentes de seguridad relacionados con marketing
   */
  static async logSecurityEvent(params: {
    tenantId: string;
    event: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    details: any;
  }) {
    return this.log({
      tenantId: params.tenantId,
      action: `SECURITY_${params.event}`,
      category: 'SECURITY',
      status: params.severity === 'CRITICAL' ? 'FAILED' : 'WARNING',
      details: params.details
    });
  }
}
