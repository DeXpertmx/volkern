const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inject() {
  const tenants = await prisma.tenant.findMany();
  
  for (const tenant of tenants) {
    const tenantId = tenant.id;
    console.log('Injecting inventory for tenant:', tenantId);

    try {
      // 1. Almacenes
      const wh1 = await prisma.warehouse.upsert({
        where: { id: `WH-MAIN-${tenantId}` },
        update: {},
        create: {
          id: `WH-MAIN-${tenantId}`,
          tenantId,
          name: 'Almacén Central',
          location: 'Planta Principal',
          description: 'Silo principal de materias primas y PT'
        }
      });

      const wh2 = await prisma.warehouse.upsert({
        where: { id: `WH-SHOP-${tenantId}` },
        update: {},
        create: {
          id: `WH-SHOP-${tenantId}`,
          tenantId,
          name: 'Tienda Norte',
          location: 'Showroom',
          description: 'Punto de venta y exhibición'
        }
      });

      // 2. Items del catálogo
      const items = await prisma.catalogoItem.findMany({ where: { tenantId } });
      
      for (const item of items) {
        // 3. Stock Levels
        const existing = await prisma.stockLevel.findFirst({
          where: {
            warehouseId: wh1.id,
            catalogoItemId: item.id,
            lotId: null
          }
        });

        if (existing) {
          await prisma.stockLevel.update({
            where: { id: existing.id },
            data: { quantity: 500, minStock: 50 }
          });
        } else {
          await prisma.stockLevel.create({
            data: {
              tenantId,
              warehouseId: wh1.id,
              catalogoItemId: item.id,
              lotId: null,
              quantity: 500,
              minStock: 50
            }
          });
        }

        // 4. Stock Movements
        await prisma.stockMovement.create({
          data: {
            tenantId,
            warehouseId: wh1.id,
            catalogoItemId: item.id,
            type: 'IN',
            quantity: 500,
            reason: 'Carga inicial de sistema',
            referenceId: 'INIT-2026'
          }
        });
      }

      // 5. Lotes Críticos para Alertas
      const criticalItem = items.find(i => i.sku === 'RAW-CELL-SILICON');
      if (criticalItem) {
        await prisma.stockLevel.updateMany({
          where: { warehouseId: wh1.id, catalogoItemId: criticalItem.id },
          data: { quantity: 10, minStock: 100 } // Forzar alerta
        });
      }

    } catch (e) {
      console.error(`Error injecting inventory for tenant ${tenantId}:`, e.message);
    }
  }

  process.exit(0);
}

inject();
