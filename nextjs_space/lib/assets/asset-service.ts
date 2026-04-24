import { prisma } from '@/lib/db';
import { createHash } from 'crypto';

export class AssetService {
  /**
   * Registra un nuevo activo
   */
  static async createAsset(tenantId: string, data: any) {
    const asset = await prisma.asset.create({
      data: {
        ...data,
        tenantId
      }
    });

    await this.logEvent(tenantId, asset.id, 'CREATION', `Activo creado: ${asset.name}`);
    return asset;
  }

  /**
   * Asigna un activo a un empleado
   */
  static async assignAsset(tenantId: string, assetId: string, employeeId: string, note?: string) {
    return await prisma.$transaction(async (tx) => {
      // 1. Crear la asignación
      const assignment = await tx.assetAssignment.create({
        data: {
          tenantId,
          assetId,
          employeeId,
          note
        }
      });

      // 2. Actualizar estado del activo
      await tx.asset.update({
        where: { id: assetId },
        data: { status: 'ASSIGNED' }
      });

      // 3. Log Event con Sello
      await this.logEvent(tenantId, assetId, 'ASSIGNMENT', `Asignado a empleado ${employeeId}`, null, tx);

      return assignment;
    });
  }

  /**
   * Registra mantenimiento y opcionalmente crea ticket en Taskforce
   */
  static async registerMaintenance(tenantId: string, assetId: string, data: any, createTicket: boolean = false) {
    return await prisma.$transaction(async (tx) => {
      const maintenance = await tx.assetMaintenance.create({
        data: {
          ...data,
          tenantId,
          assetId
        }
      });

      if (createTicket) {
        const asset = await tx.asset.findUnique({ where: { id: assetId } });
        // Crear ticket en Taskforce
        const ticket = await tx.supportTicket.create({
          data: {
            tenantId,
            subject: `MANTENIMIENTO: ${asset?.name}`,
            description: `Mantenimiento preventivo programado para el activo ${asset?.serialNumber}. Detalles: ${data.description}`,
            priority: 'MEDIUM',
            status: 'OPEN',
            source: 'SYSTEM',
            entityType: 'ASSET',
            entityId: assetId,
            creatorId: 'SYSTEM' // O un ID de sistema
          }
        });
        
        await tx.assetMaintenance.update({
          where: { id: maintenance.id },
          data: { ticketId: ticket.id }
        });
      }

      await this.logEvent(tenantId, assetId, 'MAINTENANCE', `Mantenimiento registrado: ${data.type}`, null, tx);

      return maintenance;
    });
  }

  /**
   * Log de eventos con Sellado Criptográfico (Trust Protocol)
   */
  private static async logEvent(tenantId: string, assetId: string, eventType: string, description: string, metadata: any = null, tx: any = prisma) {
    const timestamp = new Date().toISOString();
    const payload = `${tenantId}|${assetId}|${eventType}|${timestamp}`;
    const hash = createHash('sha256').update(payload).digest('hex');

    return await tx.assetEvent.create({
      data: {
        tenantId,
        assetId,
        eventType,
        description,
        metadata: metadata || {},
        hash,
        createdAt: new Date(timestamp)
      }
    });
  }

  /**
   * Monitor de Vencimientos (Watchdog)
   * Gemma debería llamar a esto o esto disparar a Gemma
   */
  static async checkRenewals(tenantId: string) {
    const now = new Date();
    const threshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 días

    const expiringAssets = await prisma.asset.findMany({
      where: {
        tenantId,
        OR: [
          { renewalDate: { lte: threshold, gte: now } },
          { warrantyEnd: { lte: threshold, gte: now } }
        ],
        status: { not: 'RETIRED' }
      }
    });

    for (const asset of expiringAssets) {
      // Si ya tiene un ticket abierto, no duplicar
      const existingTicket = await prisma.supportTicket.findFirst({
        where: { tenantId, entityId: asset.id, entityType: 'ASSET', status: 'OPEN' }
      });

      if (!existingTicket) {
        await this.registerMaintenance(tenantId, asset.id, {
          type: 'PREVENTIVE',
          description: `ALERTA EXPIRACIÓN: El activo o licencia está próximo a vencer (${asset.renewalDate || asset.warrantyEnd}).`
        }, true);
      }
    }

    return expiringAssets;
  }
}
