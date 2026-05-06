import { prisma } from '@/lib/db';
import { skillsLogger, trackSkillExecution } from './observability';
import { eventBus, EVENTS } from './event-bus';

/**
 * ERP Inventory Skills
 */

export interface AdjustStockInput {
  tenantId: string;
  catalogoItemId: string;
  warehouseId?: string; // Si no se provee, se usa el Almacén Central
  type: 'IN' | 'OUT' | 'TRANSFER';
  quantity: number;
  reason: string;
  userId?: string;
  referenceId?: string;
  targetWarehouseId?: string; // Solo para TRANSFER
}

/**
 * Obtener o crear Almacén Central por defecto
 */
async function getOrCreateDefaultWarehouse(tenantId: string) {
  let warehouse = await prisma.warehouse.findFirst({
    where: { tenantId, name: 'Almacén Central' }
  });

  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: {
        tenantId,
        name: 'Almacén Central',
        location: 'Principal',
        description: 'Almacén generado automáticamente por el sistema.'
      }
    });
  }

  return warehouse;
}

/**
 * Ajustar Stock (Transaccional)
 */
export async function adjustStock(input: AdjustStockInput) {
  return await trackSkillExecution('adjust_stock', async () => {
    const { tenantId, catalogoItemId, type, quantity, reason, userId, referenceId } = input;

    return await prisma.$transaction(async (tx: any) => {
      // 1. Determinar Almacén
      const warehouse = input.warehouseId 
        ? await tx.warehouse.findUnique({ where: { id: input.warehouseId } })
        : await getOrCreateDefaultWarehouse(tenantId);

      if (!warehouse) throw new Error('Almacén no encontrado');

      // 2. Actualizar o Crear StockLevel
      const stockLevel = await tx.stockLevel.upsert({
        where: {
          warehouseId_catalogoItemId_lotId: {
            warehouseId: warehouse.id,
            catalogoItemId,
            lotId: null as any
          }
        },
        update: {
          quantity: type === 'IN' ? { increment: quantity } : { decrement: quantity },
          lastSync: new Date()
        },
        create: {
          tenantId,
          warehouseId: warehouse.id,
          catalogoItemId,
          lotId: null,
          quantity: type === 'IN' ? quantity : -quantity
        }
      });

      // 3. Registrar Movimiento
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          warehouseId: warehouse.id,
          catalogoItemId,
          userId,
          type,
          quantity,
          reason,
          referenceId
        }
      });

      // 4. Lógica de Transferencia (si aplica)
      if (type === 'TRANSFER' && input.targetWarehouseId) {
         await tx.stockLevel.upsert({
            where: {
              warehouseId_catalogoItemId_lotId: {
                warehouseId: input.targetWarehouseId,
                catalogoItemId,
                lotId: null as any
              }
            },
            update: {
              quantity: { increment: quantity },
              lastSync: new Date()
            },
            create: {
              tenantId,
              warehouseId: input.targetWarehouseId,
              catalogoItemId,
              lotId: null,
              quantity
            }
         });

         await tx.stockMovement.create({
            data: {
              tenantId,
              warehouseId: input.targetWarehouseId,
              catalogoItemId,
              userId,
              type: 'IN',
              quantity,
              reason: `Transferencia desde ${warehouse.name}`,
              referenceId
            }
         });
      }

      skillsLogger.info(`Ajuste de stock: ${type} ${quantity}u para item ${catalogoItemId}`, { 
        tenantId, 
        warehouse: warehouse.name 
      });

      // 5. Emitir evento para proactividad (alertas de stock bajo)
      if (stockLevel.quantity <= (stockLevel.minStock || 0)) {
        eventBus.emit(EVENTS.RESOURCE_UPDATED, {
          type: 'stock_alert',
          id: stockLevel.id,
          tenantId,
          metadata: { currentQuantity: stockLevel.quantity, minStock: stockLevel.minStock }
        });
      }

      return { stockLevel, movement };
    });
  });
}

/**
 * Motor de Consumo de Inventario: Descontar producto o componentes (BoM)
 */
export async function processInventoryConsumption(input: {
  tenantId: string;
  productId: string;
  quantity: number;
  warehouseId?: string;
  userId?: string;
}) {
  return await trackSkillExecution('process_inventory_consumption', async () => {
    const { tenantId, productId, quantity, userId } = input;

    return await prisma.$transaction(async (tx: any) => {
      // 1. Determinar Almacén
      const warehouse = input.warehouseId 
        ? await tx.warehouse.findUnique({ where: { id: input.warehouseId } })
        : await getOrCreateDefaultWarehouse(tenantId);
      
      if (!warehouse) throw new Error('Almacén no encontrado');

      // 2. Verificar si el producto tiene BoM activo
      const bom = await tx.billOfMaterials.findUnique({
        where: { productId },
        include: { components: true }
      });

      if (bom && bom.isActive) {
        // --- ESCENARIO INDUSTRIAL: CONSUMIR COMPONENTES ---
        for (const item of bom.components) {
          const quantityToReduce = item.quantityRequired * quantity;
          
          const stock = await tx.stockLevel.upsert({
            where: {
              warehouseId_catalogoItemId_lotId: {
                warehouseId: warehouse.id,
                catalogoItemId: item.componentId,
                lotId: null as any
              }
            },
            update: {
              quantity: { decrement: quantityToReduce },
              lastSync: new Date()
            },
            create: {
              tenantId,
              warehouseId: warehouse.id,
              catalogoItemId: item.componentId,
              lotId: null,
              quantity: -quantityToReduce
            }
          });

          // 🛡️ LOG DE INTEGRIDAD: Registrar el consumo industrial
          await tx.productionLog.create({
            data: {
              tenantId,
              action: 'AUTOMATIC_CONSUMPTION',
              catalogoItemId: item.componentId,
              quantity: quantityToReduce,
              userId
            }
          });

          // Registrar anomalía si el stock queda negativo
          if (stock.quantity < 0) {
            console.warn(`[InventoryGuard] Stock negativo detectado para componente ${item.componentId}`);
            // TODO: Trigger anomaly notification
          }
        }
      } else {
        // --- ESCENARIO SIMPLE: CONSUMIR PRODUCTO DIRECTO ---
        const stock = await tx.stockLevel.upsert({
          where: {
            warehouseId_catalogoItemId_lotId: {
              warehouseId: warehouse.id,
              catalogoItemId: productId,
              lotId: null as any
            }
          },
          update: {
            quantity: { decrement: quantity },
            lastSync: new Date()
          },
          create: {
            tenantId,
            warehouseId: warehouse.id,
            catalogoItemId: productId,
            lotId: null,
            quantity: -quantity
          }
        });

        // Log simple
        await tx.productionLog.create({
          data: {
            tenantId,
            action: 'AUTOMATIC_CONSUMPTION',
            catalogoItemId: productId,
            quantity: quantity,
            userId
          }
        });

        if (stock.quantity < 0) {
          console.warn(`[InventoryGuard] Stock negativo detectado para producto ${productId}`);
        }
      }

      // 3. Disparar Watchdog (después de la transacción para ver valores reales)
      // Nota: Esto se llamará fuera del await si es asíncrono, o aquí. 
      // Por consistencia lo llamamos al final.
      return { success: true, warehouse: warehouse.name };
    });
  });
}

/**
 * Análisis de Salud de Inventario (Proyecciones IA)
 */
export async function getInventoryHealth(input: { tenantId: string, catalogoItemId?: string }) {
  return await trackSkillExecution('get_inventory_health', async () => {
     // Aquí integraríamos lógica histórica para predecir agotamiento.
     // Por ahora, devolvemos un resumen de existencias críticas.
     // Prisma no soporta comparación entre columnas directamente en findMany
     // Usamos queryRaw para identificar los IDs y luego findMany para hidratar
     const criticalItemsIds = await prisma.$queryRaw<{ id: string }[]>`
       SELECT id FROM erp_stock_levels 
       WHERE "tenantId" = ${input.tenantId} 
       AND quantity <= "minStock"
     `;

     const ids = criticalItemsIds.map((i: any) => i.id);

     const criticalItems = await prisma.stockLevel.findMany({
       where: {
         id: { in: ids }
       },
       include: {
         catalogoItem: { select: { nombre: true, sku: true } },
         warehouse: { select: { name: true } }
       }
     });

     return {
       status: criticalItems.length > 0 ? 'WARNING' : 'HEALTHY',
       criticalItemsCount: criticalItems.length,
       items: criticalItems.map(item => ({
         name: item.catalogoItem.nombre,
         sku: item.catalogoItem.sku,
         current: item.quantity,
         min: item.minStock,
         warehouse: item.warehouse.name
       })),
       recommendation: criticalItems.length > 0 
        ? `Se detectaron ${criticalItems.length} productos bajo el stock mínimo. Revisa las órdenes de compra.`
        : "Niveles de stock óptimos para la demanda proyectada."
     };
  });
}
