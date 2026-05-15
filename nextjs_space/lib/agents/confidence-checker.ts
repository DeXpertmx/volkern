import { prisma } from '@/lib/db';

export interface ConfidenceVerdict {
  action: 'execute' | 'ask_clarification' | 'fallback_to_human' | 'reject';
  confidence: number;
  threshold: number;
  reason: string;
  suggestedResponse?: string;
  needsReview?: boolean;
}

export interface ConfidenceThresholds {
  execute: number;
  clarify: number;
  reject: number;
}

export class ConfidenceCheckerAgent {
  private thresholds: ConfidenceThresholds = {
    execute: 0.75,
    clarify: 0.50,
    reject: 0.30
  };

  private highRiskIntents: string[] = [
    'cancelar_cita',
    'eliminar_lead',
    'eliminar_tarea',
    'actualizar_lead',
    'modificar_cita'
  ];

  private lowRiskIntents: string[] = [
    'consulta_general',
    'mis_citas',
    'buscar_lead'
  ];

  async check(params: {
    intent: string;
    confidence: number;
    message: string;
    userId: string;
    tenantId: string;
    hasAllRequiredParams: boolean;
    context?: string;
  }): Promise<ConfidenceVerdict> {
    const { intent, confidence, message, userId, tenantId, hasAllRequiredParams } = params;
    
    const effectiveThreshold = this.getEffectiveThreshold(intent);
    
    if (confidence >= effectiveThreshold.execute) {
      await this.logVerdict({
        userId,
        tenantId,
        intent,
        confidence,
        verdict: 'execute',
        threshold: effectiveThreshold.execute
      });
      
      return {
        action: 'execute',
        confidence,
        threshold: effectiveThreshold.execute,
        reason: `Confianza suficiente (${(confidence * 100).toFixed(0)}% >= ${(effectiveThreshold.execute * 100).toFixed(0)}%)`
      };
    }
    
    if (confidence >= effectiveThreshold.clarify) {
      const suggestedResponse = this.generateClarificationMessage(intent, confidence, message);
      
      await this.logVerdict({
        userId,
        tenantId,
        intent,
        confidence,
        verdict: 'ask_clarification',
        threshold: effectiveThreshold.clarify
      });
      
      return {
        action: 'ask_clarification',
        confidence,
        threshold: effectiveThreshold.clarify,
        reason: `Confianza insuficiente (${(confidence * 100).toFixed(0)}% < ${(effectiveThreshold.execute * 100).toFixed(0)}%)`,
        suggestedResponse
      };
    }
    
    if (confidence >= effectiveThreshold.reject) {
      await this.logVerdict({
        userId,
        tenantId,
        intent,
        confidence,
        verdict: 'fallback_to_human',
        threshold: effectiveThreshold.reject
      });
      
      return {
        action: 'fallback_to_human',
        confidence,
        threshold: effectiveThreshold.reject,
        reason: `Confianza muy baja (${(confidence * 100).toFixed(0)}%). Se requiere intervención humana.`,
        needsReview: true,
        suggestedResponse: 'Lo siento, no estoy seguro de lo que necesitas. Un agente humano te atenderá en breve.'
      };
    }
    
    await this.logVerdict({
      userId,
      tenantId,
      intent,
      confidence,
      verdict: 'reject',
      threshold: effectiveThreshold.reject
    });
    
    return {
      action: 'reject',
      confidence,
      threshold: effectiveThreshold.reject,
      reason: `Confianza insuficiente (${(confidence * 100).toFixed(0)}%). No se pudo determinar la intención.`,
      suggestedResponse: 'No he podido entender tu solicitud. Por favor, reformula tu mensaje o contacta a soporte.'
    };
  }

  private getEffectiveThreshold(intent: string): ConfidenceThresholds {
    if (this.highRiskIntents.includes(intent)) {
      return { execute: 0.85, clarify: 0.65, reject: 0.40 };
    }
    
    if (this.lowRiskIntents.includes(intent)) {
      return { execute: 0.60, clarify: 0.40, reject: 0.25 };
    }
    
    return this.thresholds;
  }

  private generateClarificationMessage(intent: string, confidence: number, originalMessage: string): string {
    const confidencePercent = (confidence * 100).toFixed(0);
    
    const messages: Record<string, string> = {
      'crear_lead': '¿Podrías proporcionarme el nombre y email del contacto que quieres agregar?',
      'agendar_cita': 'Para agendar una cita, necesito saber con quién (email), fecha y hora. ¿Me los proporcionas?',
      'buscar_lead': '¿Qué lead estás buscando? Dame su email o nombre completo.',
      'crear_tarea': '¿Qué tarea necesitas crear? Dame un título y opcionalmente una fecha de vencimiento.',
      'registrar_gasto': '¿Qué gasto quieres registrar? Necesito el monto y el concepto.',
      'enviar_mensaje': '¿A quién quieres enviar mensaje y qué quieres decirle?',
      'consulta_general': `No estoy seguro de entenderte (${confidencePercent}% de certeza). ¿Podrías reformular tu consulta?`
    };
    
    return messages[intent] || `No estoy completamente seguro de lo que necesitas (${confidencePercent}% de certeza). ¿Podrías ser más específico?`;
  }

  private async logVerdict(params: {
    userId: string;
    tenantId: string;
    intent: string;
    confidence: number;
    verdict: string;
    threshold: number;
  }): Promise<void> {
    try {
      await prisma.chatbotAuditLog.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          intent: params.intent,
          status: 'PENDING',
          inputRaw: `confidence_verdict:${params.verdict}`,
          detectedEntities: {
            verdict: params.verdict,
            threshold: params.threshold,
            confidence: params.confidence,
            timestamp: new Date().toISOString()
          },
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.error('Error logging confidence verdict:', error);
    }
  }

  updateThresholds(newThresholds: Partial<ConfidenceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }

  async getConfidenceStats(tenantId: string, hours: number = 24): Promise<any> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const logs = await prisma.chatbotAuditLog.findMany({
      where: {
        tenantId,
        createdAt: { gte: since }
      },
      select: {
        intent: true,
        metadata: true
      }
    });
    
    const statsByIntent: Record<string, { count: number; avgConfidence: number; lowCount: number }> = {};
    
    for (const log of logs) {
      const conf = log.metadata?.confidence;
      if (!conf || !log.intent) continue;
      
      if (!statsByIntent[log.intent]) {
        statsByIntent[log.intent] = { count: 0, avgConfidence: 0, lowCount: 0 };
      }
      
      const stat = statsByIntent[log.intent];
      stat.count++;
      stat.avgConfidence += conf;
      if (conf < this.thresholds.execute) {
        stat.lowCount++;
      }
    }
    
    for (const intent of Object.keys(statsByIntent)) {
      const stat = statsByIntent[intent];
      stat.avgConfidence = stat.count > 0 ? stat.avgConfidence / stat.count : 0;
    }
    
    return statsByIntent;
  }
}

export const confidenceChecker = new ConfidenceCheckerAgent();