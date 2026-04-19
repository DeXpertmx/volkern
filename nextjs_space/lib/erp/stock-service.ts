import { prisma } from '@/lib/db';

export class StockService {
  /**
   * Registra un movimiento de stock vinculado opcionalmente a un lote
   */
  static async registerMovement(data: {
    tenantId: string;
    warehouseId: string;
    catalogoItemId: string;
    lotId?: string;
    type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER' | 'CONSUMPTION' | 'PRODUCTION_OUTPUT';
    quantity: number;
    reason?: string;
    referenceId?: string;
    metadata?: any;
  }) {
    return await prisma.$transaction(async (tx) => {
      // 1. Crear el movimiento
      const movement = await tx.stockMovement.create({
        data: {
          tenantId: data.tenantId,
          warehouseId: data.warehouseId,
          catalogoItemId: data.catalogoItemId,
          lotId: data.lotId,
          type: data.type,
          quantity: data.quantity,
          reason: data.reason,
          referenceId: data.referenceId,
          metadata: data.metadata || {}
        }
      });

      // 2. Actualizar o crear el nivel de stock (StockLevel)
      // Se segmenta por Warehouse + Item + Lot
      await tx.stockLevel.upsert({
        where: {
          warehouseId_catalogoItemId_lotId: {
            warehouseId: data.warehouseId,
            catalogoItemId: data.catalogoItemId,
            lotId: data.lotId || null as any // Prisma maneja null en unique si está permitido
          }
        },
        update: {
          quantity: { increment: data.quantity },
          lastSync: new Date()
        },
        create: {
          tenantId: data.tenantId,
          warehouseId: data.warehouseId,
          catalogoItemId: data.catalogoItemId,
          lotId: data.lotId,
          quantity: data.quantity
        }
      });

      return movement;
    });
  }

  /**
   * Cambia el estado de un lote (Calidad)
   */
  static async updateLotStatus(lotId: string, status: 'QUARANTINE' | 'AVAILABLE' | 'REJECTED', tenantId: string) {
    return await prisma.inventoryLot.update({
      where: { id: lotId, tenantId },
      data: { status }
    });
  }

  /**
   * Obtiene disponibilidad real considerando lotes aprobados y reservas
   */
  static async getAvailableStock(catalogoItemId: string, tenantId: string) {
    const stockLevels = await prisma.stockLevel.findMany({
      where: { 
        catalogoItemId, 
        tenantId,
        OR: [
          { lot: null },
          { lot: { status: 'AVAILABLE' } }
        ]
      }
    });

    const totalPhysical = stockLevels.reduce((acc, curr) => acc + curr.quantity, 0);
    
    const reservations = await prisma.materialRequirement.aggregate({
      where: { catalogItemId: catalogoItemId, tenantId, status: 'RESERVED' },
      _sum: { reservedQty: true }
    });

    const totalReserved = reservations._sum.reservedQty || 0;

    return {
      physical: totalPhysical,
      reserved: totalReserved,
      available: Math.max(0, totalPhysical - totalReserved)
    };
  }
}
