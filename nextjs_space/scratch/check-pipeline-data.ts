import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
  console.log('🔍 Diagnosticando datos del Pipeline...\n');

  const tenants = await prisma.tenant.findMany({ take: 5 });
  console.log(`🏢 Tenants encontrados: ${tenants.length}`);
  
  for (const tenant of tenants) {
    const stages = await prisma.pipelineStage.findMany({
      where: { tenantId: tenant.id }
    });
    
    const deals = await prisma.deal.findMany({
      where: { tenantId: tenant.id }
    });

    console.log(`Tenant: ${tenant.nombre} (${tenant.id})`);
    console.log(`   - Etapas: ${stages.length}`);
    console.log(`   - Deals: ${deals.length}`);
    if (stages.length > 0) {
      console.log(`   - Nombres de etapas: ${stages.map(s => s.nombre).join(', ')}`);
    }
    console.log('');
  }
}

checkData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
