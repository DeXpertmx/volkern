import { prisma } from '@/lib/db';
import { trackSkillExecution } from './observability';
import { notificationService } from './notification-layer';
import { createSystemContext } from './context';

/**
 * AI Inventory Watchdog (Gemma 4 logic)
 * Vigilante silencioso que detecta rupturas de stock y sugiere compras proactivas.
 */
export async function inventoryWatchdog(input: {
  tenantId: string;
}) {
  return await trackSkillExecution('inventory_watchdog', async () => {
    const { tenantId } = input;
    const context = createSystemContext(tenantId);

    // 1. Obtener todos los ítems que están por debajo o igual al punto de reorden
    const healthCheck = await prisma.stockLevel.findMany({
      where: {
        tenantId,
        catalogoItem: {
          inventoryConfig: {
            reorderPoint: { gte: 0 }
          }
        }
      },
      include: {
        catalogoItem: {
          include: {
            inventoryConfig: true
          }
        },
        warehouse: true
      }
    });

    const criticalItems = healthCheck.filter(stock => {
      const reorderPoint = stock.catalogoItem.inventoryConfig?.reorderPoint ?? 0;
      return stock.quantity <= reorderPoint;
    });

    if (criticalItems.length === 0) return { status: 'OK', message: 'Inventario saludable' };

    // 2. Para cada ítem crítico, disparar notificación multicanal con acción interactiva
    const notifications = [];

    for (const item of criticalItems) {
      const itemName = item.catalogoItem.nombre;
      const sku = item.catalogoItem.sku;
      const currentStock = item.quantity;
      const reorderPoint = item.catalogoItem.inventoryConfig?.reorderPoint;
      
      const proactiveMessage = `⚠️ <b>ALERTA DE STOCK: ${itemName}</b>\n\nEl stock ha bajado a <b>${currentStock}</b> unidades en ${item.warehouse.name}.\nEl punto de reorden configurado es de ${reorderPoint}.\n\n¿Deseas autorizar la reposición inmediata?`;

      // Enlace profundo al catálogo filtrando por SKU
      const actionUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'}/dashboard/catalogo?search=${sku}`;

      const users = await prisma.user.findMany({
        where: { tenantId, role: 'ADMIN' },
        take: 1
      });

      if (users.length > 0) {
        const admin = users[0];
        
        // Enviamos notificación multicanal (In-App + Telegram)
        await notificationService.send(
          { 
            type: 'user', 
            id: admin.id, 
            email: admin.email, 
            name: admin.name,
            telegramChatId: (admin.metadata as any)?.telegram_chat_id 
          },
          {
            title: `⚠️ Alerta de Inventario: ${itemName}`,
            body: proactiveMessage,
            priority: 'urgent',
            actions: [
              {
                label: '🛒 Autorizar Compra',
                url: actionUrl
              }
            ]
          },
          { channel: 'in_app', priority: 'high' }, // Por defecto in_app, pero notificationService.send con 'urgent' y admin disparará Telegram si está configurado
          context
        );

        // Intento forzado a Telegram si no se disparó por el dispatcher automático de email
        notificationService.send(
            { type: 'user', id: admin.id, telegramChatId: (admin.metadata as any)?.telegram_chat_id },
            { body: proactiveMessage, actions: [{ label: '🛒 Autorizar Compra', url: actionUrl }] },
            { channel: 'telegram', priority: 'urgent' },
            context
        ).catch(err => console.error('[Watchdog] Failed to dispatch urgent Telegram:', err));

        notifications.push({
          itemId: item.catalogoItemId,
          message: proactiveMessage
        });
      }
    }

    return {
      status: 'CRITICAL',
      alertsCount: criticalItems.length,
      alerts: notifications
    };
  });
}
