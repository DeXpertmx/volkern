const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testService() {
  try {
    const tenant = await prisma.tenant.findFirst();
    const tenantId = tenant.id;

    console.log('Testing QualityPoint.findMany...');
    const points = await prisma.qualityPoint.findMany({ where: { tenantId } });
    console.log('Points:', points.length);

    console.log('Testing QualityCheck.findMany...');
    const checks = await prisma.qualityCheck.findMany({
      where: { tenantId },
      include: {
        point: true,
        project: { select: { name: true } },
        workOrder: { select: { batchNumber: true } }
      }
    });
    console.log('Checks:', checks.length);

    process.exit(0);
  } catch (error) {
    console.error('FAILED:', error);
    process.exit(1);
  }
}

testService();
