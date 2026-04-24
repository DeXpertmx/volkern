const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function injectAll() {
  const tenants = await prisma.tenant.findMany();
  
  for (const tenant of tenants) {
    const tenantId = tenant.id;
    console.log('Injecting for tenant:', tenantId);

    try {
      const p1 = await prisma.catalogoItem.upsert({
        where: { tenantId_sku: { tenantId, sku: 'PROD-PANEL-400W' } },
        update: {},
        create: {
          tenantId,
          nombre: 'Panel Solar 400W High Efficiency',
          sku: 'PROD-PANEL-400W',
          precioBase: 250,
          tipo: 'producto',
          isManufactured: true
        }
      });

      const c1 = await prisma.catalogoItem.upsert({
        where: { tenantId_sku: { tenantId, sku: 'RAW-CELL-SILICON' } },
        update: {},
        create: {
          tenantId,
          nombre: 'Celda Silicio Monocristalino',
          sku: 'RAW-CELL-SILICON',
          precioBase: 2,
          tipo: 'producto',
          isStockable: true
        }
      });

      const lineA = await prisma.erp_production_lines.upsert({
        where: { id: `LINE-A-${tenantId}` },
        update: {},
        create: {
          id: `LINE-A-${tenantId}`,
          tenantId,
          name: 'Línea de Ensamblaje A',
          description: 'Principal línea de montaje de paneles'
        }
      });

      await prisma.erp_industrial_assets.upsert({
        where: { id: `ASSET-1-${tenantId}` },
        update: {},
        create: {
          id: `ASSET-1-${tenantId}`,
          tenantId,
          name: 'Prensa Solar-X1',
          status: 'OPERATIONAL',
          totalHoursWorked: 850,
          lineId: lineA.id,
          updatedAt: new Date()
        }
      });

      const bom = await prisma.billOfMaterials.upsert({
        where: { productId: p1.id },
        update: {},
        create: {
          tenantId,
          productId: p1.id,
          laborCost: 45,
          overheadCost: 15,
          isActive: true
        }
      });

      await prisma.boMComponent.createMany({
        data: [
          { bomId: bom.id, componentId: c1.id, quantityRequired: 60, unit: 'unidades' }
        ],
        skipDuplicates: true
      });

      const wo1 = await prisma.workOrder.upsert({
        where: { batchNumber: `BATCH-2026-001-${tenantId}` },
        update: {},
        create: {
          tenantId,
          bomId: bom.id,
          batchNumber: `BATCH-2026-001-${tenantId}`,
          quantityToMake: 100,
          status: 'PLANNED',
          lineId: lineA.id
        }
      });

      await prisma.erp_production_readiness.upsert({
        where: { workOrderId: wo1.id },
        update: {},
        create: {
          id: `READ-${wo1.id}`,
          tenantId,
          workOrderId: wo1.id,
          readyToProduce: true,
          coveragePercent: 100
        }
      });

      await prisma.erp_production_costing.upsert({
        where: { workOrderId: wo1.id },
        update: {},
        create: {
          id: `COST-${wo1.id}`,
          tenantId,
          workOrderId: wo1.id,
          estimatedCost: 1800,
          totalCost: 1850,
          variance: 50,
          margin: 35.5,
          updatedAt: new Date()
        }
      });

      for (let i = 0; i < 7; i++) {
        await prisma.erp_shift_plans.upsert({
          where: { id: `SHIFT-${tenantId}-${i}` },
          update: {},
          create: {
            id: `SHIFT-${tenantId}-${i}`,
            tenantId,
            dayOfWeek: i,
            shiftName: 'Turno Mañana',
            startTime: '08:00',
            endTime: '16:00',
            capacityFactor: 1.0
          }
        });
      }
    } catch (e) {
      console.error(`Error injecting for tenant ${tenantId}:`, e.message);
    }
  }

  process.exit(0);
}

injectAll();
