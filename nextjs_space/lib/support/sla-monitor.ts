import { prisma, SlaState } from '@/lib/db';
import { callGemma } from '@/lib/ai/gemma-client';
import { AuditService } from '@/lib/audit-service';
import { GEMMA_SLA_SYSTEM_PROMPT, getGemmaSLAPrompt } from './gemma-sla-prompts';

export class SupportSLAMonitor {
  /**
   * Revisa el estado de todos los tickets activos y dispara alertas/breaches
   */
  static async monitorTenantSLAs(tenantId: string) {
    const activeTickets = await prisma.supportTicket.findMany({
      where: {
        tenantId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        resolvedAt: null
      }
    });

    const now = new Date();

    for (const ticket of activeTickets) {
      if (!ticket.slaDueAt) continue;

      const timeRemaining = ticket.slaDueAt.getTime() - now.getTime();
      const threshold = this.getThreshold(ticket.priority);

      // 1. Detectar BREACH
      if (timeRemaining <= 0 && ticket.slaState !== 'BREACHED') {
        await this.handleBreach(ticket, tenantId);
      } 
      // 2. Detectar AT_RISK (Pre-alert)
      else if (timeRemaining <= threshold && ticket.slaState === 'ON_TIME') {
        await this.handleAtRisk(ticket, tenantId);
      }
    }
  }

  private static getThreshold(priority: string): number {
    // Thresholds: CRITICAL=2h, HIGH=12h, MEDIUM=1d, LOW=7d
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    if (priority === 'CRITICAL') return 2 * hour;
    if (priority === 'HIGH') return 12 * hour;
    if (priority === 'MEDIUM') return 1 * day;
    return 7 * day;
  }

  private static async handleAtRisk(ticket: any, tenantId: string) {
    console.log(`[SLA] Ticket ${ticket.id} is AT RISK`);
    
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { slaState: 'AT_RISK' }
    });

    await prisma.ticketTimeline.create({
      data: {
        ticketId: ticket.id,
        actorType: 'SYSTEM',
        action: 'SLA_WARNING',
        note: `ALERTA: El ticket está cerca de incumplir el SLA de resolución.`,
        slaState: 'AT_RISK'
      }
    });

    // Notificar en Connect vía Gemma usando el contrato estructurado
    try {
      const thresholdMs = this.getThreshold(ticket.priority);
      const timeRemainingMs = ticket.slaDueAt.getTime() - now.getTime();
      
      const gemmaResponse = await callGemma([
        { role: 'system', content: GEMMA_SLA_SYSTEM_PROMPT },
        { role: 'user', content: getGemmaSLAPrompt({
          tenantId,
          eventType: 'SLA_CHECK',
          ticketId: ticket.id,
          timestamp: new Date().toISOString(),
          contextSnapshot: {
            ticket: { 
              id: ticket.id, 
              priority: ticket.priority, 
              status: ticket.status,
              slaDueAt: ticket.slaDueAt.toISOString() 
            },
            timeRemaining: `${Math.round(timeRemainingMs / (60 * 1000))} minutos`,
            threshold: `${Math.round(thresholdMs / (60 * 60 * 1000))} horas`,
            lastActivity: ticket.updatedAt.toISOString(),
            recentMessages: []
          },
          policy: { allowed_actions: ['notify_owner'], critical: ticket.priority === 'CRITICAL' }
        }) }
      ]);
      
      if (gemmaResponse.content) {
        const cleanContent = gemmaResponse.content.replace(/```json|```/g, '').trim();
        const suggestion = JSON.parse(cleanContent);
        console.log(`[Gemma SLA Warning] ${suggestion.message}`);
      }
    } catch (e) {
      console.error('Error calling Gemma for SLA warning', e);
    }
  }

  private static async handleBreach(ticket: any, tenantId: string) {
    console.log(`[SLA] Ticket ${ticket.id} BREACHED`);
    const now = new Date();
    const overdueTimeMs = now.getTime() - ticket.slaDueAt.getTime();

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { 
        slaState: 'BREACHED',
        slaBreachAt: now
      }
    });

    // Obtener últimos eventos del timeline para contexto
    const recentTimeline = await prisma.ticketTimeline.findMany({
      where: { ticketId: ticket.id },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    await prisma.ticketTimeline.create({
      data: {
        ticketId: ticket.id,
        actorType: 'SYSTEM',
        action: 'SLA_BREACH',
        note: `INCUMPLIMIENTO: Se ha superado el tiempo límite de resolución permitido.`,
        slaState: 'BREACHED'
      }
    });

    // Acción de Gemma para Breach
    try {
      const gemmaResponse = await callGemma([
        { role: 'system', content: GEMMA_SLA_SYSTEM_PROMPT },
        { role: 'user', content: getGemmaSLAPrompt({
          tenantId,
          eventType: 'SLA_BREACH',
          ticketId: ticket.id,
          timestamp: now.toISOString(),
          contextSnapshot: { 
            ticket: { 
              id: ticket.id, 
              priority: ticket.priority, 
              slaDueAt: ticket.slaDueAt.toISOString(),
              assignedId: ticket.assignedId 
            }, 
            overdueTime: `${Math.round(overdueTimeMs / (60 * 1000))} minutos`,
            timeline: recentTimeline,
            recentMessages: [] 
          },
          policy: { allowed_actions: ['escalate', 'notify_owner'], critical: true }
        }) }
      ]);
      
      if (gemmaResponse.content) {
        const cleanContent = gemmaResponse.content.replace(/```json|```/g, '').trim();
        const suggestion = JSON.parse(cleanContent);
        
        // Si Gemma sugiere escalado crítico y la confianza es alta
        if (suggestion.type === 'SLA_BREACH' && suggestion.confidence >= 0.8) {
          // Ejecutar escalado si es crítico
          if (ticket.priority === 'CRITICAL') {
            await this.executeAutoEscalation(ticket, tenantId, suggestion.message);
          }
        }
      }
    } catch (e) {
      console.error('Error calling Gemma for SLA breach', e);
    }
  }

  private static async executeAutoEscalation(ticket: any, tenantId: string, reason: string) {
    console.log(`[SLA] Executing Auto-Escalation for ticket ${ticket.id}`);
    await AuditService.log({
      tenantId,
      userId: 'SYSTEM',
      action: 'SUPPORT_SLA_BREACH_CRITICAL',
      resourceType: 'SupportTicket',
      resourceId: ticket.id,
      details: `Escalado automático por breach crítico. Motivo AI: ${reason}`
    });
    
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { escalatedTo: 'OWNER' }
    });

    await prisma.ticketTimeline.create({
      data: {
        ticketId: ticket.id,
        actorType: 'GEMMA',
        action: 'ESCALATION',
        note: `ESCALADO AUTOMÁTICO: ${reason}`,
        slaState: 'BREACHED'
      }
    });
  }
}
