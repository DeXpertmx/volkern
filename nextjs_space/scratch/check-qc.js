const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkQC() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.log('No tenant found');
    process.exit(0);
  }

  const points = await prisma.qualityPoint.findMany({ where: { tenantId: tenant.id } });
  const checks = await prisma.qualityCheck.findMany({ where: { tenantId: tenant.id } });
  const nc = await prisma.nonConformity.findMany({ where: { tenantId: tenant.id } });

  console.log('Tenant:', tenant.id);
  console.log('QualityPoints:', points.length);
  console.log('QualityChecks:', checks.length);
  console.log('NonConformities:', nc.length);

  if (points.length === 0) {
    console.log('Injecting demo QualityPoints...');
    await prisma.qualityPoint.createMany({
      data: [
        { tenantId: tenant.id, name: 'Resistencia Estructural', description: 'Mecánico', targetValue: '500kg', tolerance: '5%' },
        { tenantId: tenant.id, name: 'Rango de Voltaje', description: 'Eléctrico', targetValue: '220V', tolerance: '2%' },
        { tenantId: tenant.id, name: 'Acabado Estético', description: 'Estético', targetValue: 'Grade A', tolerance: 'N/A' }
      ]
    });
  }

  process.exit(0);
}

checkQC();
