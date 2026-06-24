import { prisma } from '@/lib/db';
import { eventBus, EVENTS } from '@/lib/skills/event-bus';

export class AdoptionTelemetry {
  /**
   * Registra una acción ejecutada desde una recomendación (Trust Protocol y KPI)
   */
  static async trackRecommendationAction(tenantId: string, userId: string, hub: 'DISCOVER' | 'STRATEGY' | 'ASSETS', action: string, metadata: any) {
    try {
      // 1. Escribir en Trust Protocol (Audit)
      await (prisma.trustProtocolLog as any).create({
        data: {
          tenantId,
          userId,
          action: `HUB_ACTION_${hub}`,
          resource: action,
          details: JSON.stringify(metadata),
          confidenceScore: metadata.aiConfidence || null,
          status: 'COMPLETED',
          riskLevel: metadata.riskLevel || 'LOW'
        }
      });

      // 2. Emitir evento para Analytics/KPI
      eventBus.emit((EVENTS as any).SYSTEM.SYSTEM_READY, { // Usamos un evento existente temporalmente o creamos uno de métrica
        tenantId,
        metadata: {
          type: 'ADOPTION_KPI',
          hub,
          action,
          timestamp: new Date()
        }
      });
      
    } catch (error) {
      console.error('[Telemetry] Error tracking adoption:', error);
    }
  }

  /**
   * Log de uso general del Hub
   */
  static async trackHubView(tenantId: string, userId: string, hub: string) {
    // Implementación in-memory o ligera para contar visitas
    console.log(`[Telemetry] User ${userId} viewed ${hub} Hub`);
    // Aquí podríamos conectar con Mixpanel o similar, o sumar contadores en DB.
  }
}
