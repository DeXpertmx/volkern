import { SupportTicket } from '@prisma/client';
import { callGemma } from '@/lib/ai/gemma-client';
import { prisma } from '@/lib/db';

export class GemmaSupportService {
  /**
   * Realiza el triage automático de un ticket nuevo
   */
  static async triageTicket(ticketId: string, tenantId: string) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId, tenantId }
    });

    if (!ticket) return;

    const prompt = `
      Analiza el siguiente ticket de soporte y determina la prioridad (LOW, MEDIUM, HIGH, CRITICAL) y el departamento sugerido (Ventas, Finanzas, Soporte Técnico, Operaciones).
      
      Asunto: ${ticket.subject}
      Descripción: ${ticket.description}
      Origen: ${ticket.source}
      Entidad Vinculada: ${ticket.entityType || 'Ninguna'}
      
      Responde estrictamente en formato JSON:
      {
        "priority": "STRING",
        "department": "STRING",
        "reasoning": "STRING"
      }
    `;

    try {
      const response = await (callGemma as any)({
        prompt,
        temperature: 0.2
      });

      const triage = JSON.parse((response as any).text);

      // Actualizar ticket con la prioridad sugerida
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { 
          priority: triage.priority,
          // Podríamos guardar el razonamiento en el timeline
        }
      });

      await prisma.ticketTimeline.create({
        data: {
          ticketId,
          actorType: 'GEMMA',
          action: 'TRIAGE',
          note: `Triage automático completado: Prioridad ${triage.priority}. Razonamiento: ${triage.reasoning}`,
          metadata: triage
        }
      });

      return triage;
    } catch (error) {
      console.error('[GemmaSupport] Error en triage:', error);
    }
  }

  /**
   * Sugiere una resolución basada en el historial
   */
  static async suggestResolution(ticketId: string, tenantId: string) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId, tenantId }
    });

    if (!ticket) return;

    // Buscar tickets similares resueltos (simplificado: por subject similar?)
    // En un sistema real usaríamos embeddings (Vector DB). 
    // Aquí buscaremos tickets resueltos del mismo tenant.
    const historicalTickets = await prisma.supportTicket.findMany({
      where: { 
        tenantId, 
        status: 'CLOSED',
        id: { not: ticketId }
      },
      take: 5,
      include: { timeline: true }
    });

    const prompt = `
      Actúa como el Integrity Guardian de Volkern. Sugiere una solución para este ticket basado en el contexto actual y el historial proporcionado.
      
      TICKET ACTUAL:
      ${ticket.subject}: ${ticket.description}
      
      HISTORIAL DE TICKETS SIMILARES:
      ${historicalTickets.map(t => `- ${t.subject}: ${t.description}. Resolución: ${t.timeline.find(h => h.action === 'STATUS_CHANGE' && h.note?.includes('RESOLVED'))?.note}`).join('\n')}
      
      Sugerencia de solución (sé conciso y directo):
    `;

    try {
      const response = await (callGemma as any)({ prompt });
      return (response as any).text;
    } catch (error) {
      return "No se pudo generar una sugerencia en este momento.";
    }
  }
}
