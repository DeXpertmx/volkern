import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/audit-service';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export class SupportService {
  /**
   * Crea un nuevo ticket de soporte
   */
  static async createTicket(data: {
    tenantId: string;
    subject: string;
    description: string;
    creatorId: string;
    priority?: TicketPriority;
    source?: string;
    channelId?: string;
    entityType?: string;
    entityId?: string;
  }) {
    const now = new Date();
    let slaHours = 720; // Default LOW (30 days)
    if (data.priority === 'CRITICAL') slaHours = 8;
    if (data.priority === 'HIGH') slaHours = 48;
    if (data.priority === 'MEDIUM') slaHours = 168; // 7 days

    const slaDueAt = new Date(now.getTime() + slaHours * 60 * 60 * 1000);

    return await prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          tenantId: data.tenantId,
          subject: data.subject,
          description: data.description,
          creatorId: data.creatorId,
          priority: data.priority || 'MEDIUM',
          source: data.source || 'MANUAL',
          channelId: data.channelId,
          entityType: data.entityType,
          entityId: data.entityId,
          status: 'OPEN',
          slaStartedAt: now,
          slaDueAt: slaDueAt,
          slaState: 'ON_TIME'
        }
      });

      // Crear primer hito en el timeline
      await tx.ticketTimeline.create({
        data: {
          ticketId: ticket.id,
          actorId: data.creatorId,
          action: 'CREATE',
          note: 'Ticket creado exitosamente'
        }
      });

      return ticket;
    });
  }

  /**
   * Actualiza el estado de un ticket
   */
  static async updateStatus(ticketId: string, tenantId: string, userId: string, newStatus: TicketStatus, note?: string) {
    return await prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({
        where: { id: ticketId, tenantId }
      });

      if (!ticket) throw new Error('Ticket no encontrado');

      const updatedTicket = await tx.supportTicket.update({
        where: { id: ticketId },
        data: { 
          status: newStatus,
          resolvedAt: newStatus === 'RESOLVED' || newStatus === 'CLOSED' ? new Date() : undefined
        }
      });

      await tx.ticketTimeline.create({
        data: {
          ticketId,
          actorId: userId,
          action: 'STATUS_CHANGE',
          note: note || `Estado cambiado a ${newStatus}`,
          metadata: { previousStatus: ticket.status, newStatus }
        }
      });

      // Protocolo de Confianza: Si es cierre de ticket crítico, auditar
      if (ticket.priority === 'CRITICAL' && (newStatus === 'RESOLVED' || newStatus === 'CLOSED')) {
        await (AuditService.log as any)({
          tenantId,
          userId,
          action: 'SUPPORT_TICKET_RESOLVE_CRITICAL',
          resourceType: 'SupportTicket',
          resourceId: ticketId,
          details: `Ticket crítico resuelto: ${ticket.subject}. Nota: ${note}`
        });
      }

      return updatedTicket;
    });
  }

  /**
   * Asigna un ticket a un usuario
   */
  static async assignTicket(ticketId: string, tenantId: string, actorId: string, assignedId: string) {
    return await prisma.$transaction(async (tx) => {
      const updatedTicket = await tx.supportTicket.update({
        where: { id: ticketId, tenantId },
        data: { 
          assignedId, 
          status: 'IN_PROGRESS',
          acknowledgeAt: new Date()
        }
      });

      await tx.ticketTimeline.create({
        data: {
          ticketId,
          actorId,
          action: 'ASSIGNMENT',
          note: `Ticket asignado a usuario ID: ${assignedId}`
        }
      });

      return updatedTicket;
    });
  }
}
