const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function injectAll() {
  const tenants = await prisma.tenant.findMany();
  
  for (const tenant of tenants) {
    console.log('Processing tenant:', tenant.id);
    
    // Check if already has data
    const existing = await prisma.qualityPoint.count({ where: { tenantId: tenant.id } });
    if (existing > 0) {
      console.log('Tenant already has data, skipping.');
      continue;
    }

    console.log('Injecting data for tenant:', tenant.id);
    const p1 = await prisma.qualityPoint.create({
      data: { tenantId: tenant.id, name: 'Resistencia Estructural', description: 'Mecánico', targetValue: '500kg', tolerance: '5%' }
    });
    
    await prisma.qualityCheck.createMany({
      data: [
        { tenantId: tenant.id, pointId: p1.id, status: 'PASSED', measuredValue: '510kg', notes: 'Carga superada' },
        { tenantId: tenant.id, pointId: p1.id, status: 'FAILED', measuredValue: '450kg', notes: 'Fallo estructural' }
      ]
    });

    await prisma.nonConformity.create({
      data: {
        tenantId: tenant.id,
        description: 'Fisura detectada en soldadura de soporte B4',
        severity: 'CRITICAL',
        status: 'OPEN',
        reportedBy: 'Sistema IA'
      }
    });
  }

  process.exit(0);
}

injectAll();
