import { prisma } from '@/lib/db';

export class ConnectService {
  /**
   * Asegura que un canal de sistema exista (ej. #finanzas, #ventas)
   */
  static async ensureSystemChannel(tenantId: string, name: string, txClient?: any) {
    const client = txClient || prisma;
    
    let channel = await client.chatChannel.findFirst({
      where: { tenantId, name, type: 'system' }
    });

    if (!channel) {
      console.log(`[ConnectService] Creando canal de sistema: ${name} para tenant ${tenantId}`);
      channel = await client.chatChannel.create({
        data: { tenantId, name, type: 'system', isLocked: false }
      });
      
      const users = await client.user.findMany({ where: { tenantId, estado: 'activo' } });
      console.log(`[ConnectService] Suscribiendo ${users.length} usuarios al canal ${name}`);
      await client.chatSubscription.createMany({
        data: users.map((u: any) => ({ tenantId, userId: u.id, channelId: channel!.id })),
        skipDuplicates: true
      });
    }
    return channel;
  }

  /**
   * Envía una notificación de sistema a un canal específico
   */
  static async notifySystem(tenantId: string, channelName: string, content: string, attribution?: { entityType: string, entityId: string }) {
    const channel = await this.ensureSystemChannel(tenantId, channelName);
    return await this.sendMessage({
      tenantId,
      channelId: channel.id,
      content,
      isSystemMessage: true,
      attributions: attribution ? [attribution] : undefined
    });
  }

  /**
   * Asegura que un tenant tenga sus canales operativos base y que todos sus usuarios estén suscritos.
   */
  static async ensureCoreChannels(tenantId: string) {
    const channels = ['General', 'Ventas', 'Finanzas', 'Operaciones'];
    const results = [];
    for (const name of channels) {
      results.push(await this.ensureSystemChannel(tenantId, name));
    }
    return results;
  }

  /**
   * Asegura que un usuario específico esté suscrito a los canales core
   */
  static async ensureUserSubscriptions(tenantId: string, userId: string) {
    const channels = await this.ensureCoreChannels(tenantId);
    await prisma.chatSubscription.createMany({
      data: channels.map(c => ({
        tenantId,
        userId,
        channelId: c.id
      })),
      skipDuplicates: true
    });
  }

  static async ensureGeneralChannel(tenantId: string, userId?: string) {
    await this.ensureCoreChannels(tenantId);
    if (userId) {
      await this.ensureUserSubscriptions(tenantId, userId);
    }
  }

  /**
   * Envía un mensaje a un canal
   */
  static async sendMessage(data: {
    tenantId: string;
    channelId: string;
    senderId?: string;
    content: string;
    isSystemMessage?: boolean;
    attributions?: Array<{ entityType: string; entityId: string }>;
  }) {
    return await prisma.$transaction(async (tx) => {
      const message = await tx.chatMessage.create({
        data: {
          tenantId: data.tenantId,
          channelId: data.channelId,
          senderId: data.senderId,
          content: data.content,
          isSystemMessage: data.isSystemMessage || false,
          attributions: data.attributions ? {
            create: data.attributions.map(attr => ({
              ...attr,
              tenantId: data.tenantId
            }))
          } : undefined
        },
        include: {
          attributions: true
        }
      });

      // Actualizar lastReadAt para el remitente si no es mensaje de sistema
      if (data.senderId) {
        await tx.chatSubscription.update({
          where: {
            userId_channelId: {
              userId: data.senderId,
              channelId: data.channelId
            }
          },
          data: {
            lastReadAt: new Date()
          }
        });
      }

      return message;
    });
  }

  /**
   * Crea un canal vinculado a una entidad de negocio (Proyecto, Deal, etc.)
   */
  static async createEntityChannel(data: {
    tenantId: string;
    name: string;
    type: 'project' | 'deal' | 'ticket';
    entityId: string;
    userIds?: string[];
  }) {
    return await prisma.$transaction(async (tx) => {
      const channel = await tx.chatChannel.create({
        data: {
          tenantId: data.tenantId,
          name: data.name,
          type: data.type
        }
      });

      if (data.userIds && data.userIds.length > 0) {
        await tx.chatSubscription.createMany({
          data: data.userIds.map(uid => ({
            tenantId: data.tenantId,
            userId: uid,
            channelId: channel.id
          }))
        });
      }

      return channel;
    });
  }
}
