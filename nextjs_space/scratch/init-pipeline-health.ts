import { PrismaClient } from '@prisma/client';
import { PipelineHealthService } from '../lib/sales/pipeline-health-service';

const prisma = new PrismaClient();

async function initHealth() {
  console.log('🚀 Inicializando Salud del Pipeline...\n');

  const tenants = await prisma.tenant.findMany();
  
  for (const tenant of tenants) {
    console.log(`Processing Tenant: ${tenant.nombre}`);
    const results = await PipelineHealthService.syncPipelineHealth(tenant.id);
    console.log(`   ✅ Sincronizados ${results.length} deals.`);
  }

  console.log('\n✨ Inicialización completada.');
}

initHealth()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
