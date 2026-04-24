const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function injectChecks() {
  const tenant = await prisma.tenant.findFirst();
  const point = await prisma.qualityPoint.findFirst({ where: { tenantId: tenant.id } });

  if (!point) {
    console.log('No points found');
    process.exit(1);
  }

  console.log('Injecting 2 QualityChecks...');
  await prisma.qualityCheck.createMany({
    data: [
      { 
        tenantId: tenant.id, 
        pointId: point.id, 
        status: 'PASSED', 
        measuredValue: '510kg', 
        notes: 'Carga superada con éxito' 
      },
      { 
        tenantId: tenant.id, 
        pointId: point.id, 
        status: 'FAILED', 
        measuredValue: '450kg', 
        notes: 'Fallo estructural en soporte' 
      }
    ]
  });

  console.log('Injecting 1 NonConformity...');
  await prisma.nonConformity.create({
    data: {
      tenantId: tenant.id,
      description: 'Fisura detectada en soldadura de soporte B4',
      severity: 'CRITICAL',
      status: 'OPEN',
      reportedBy: 'Sistema IA'
    }
  });

  process.exit(0);
}

injectChecks();
