import { prisma } from '../lib/db';
import { runHistoricalConsolidation } from '../lib/skills/financial-consolidation-skills';

async function main() {
  console.log('🚀 Iniciando Consolidación Histórica (Re-Scan)...');
  
  // En una arquitectura multi-tenant, buscaríamos todos los tenants.
  // En local, usaremos el tenant por defecto (slug: "demo")
  const tenant = await prisma.tenant.findFirst();
  
  if (!tenant) {
    console.error('❌ No se encontró ningún tenant para consolidar.');
    return;
  }

  let owner = await prisma.user.findFirst({
    where: { role: { nombre: 'OWNER' } }
  });

  if (!owner) {
     console.warn('⚠️ No se encontró un usuario con rol OWNER. Intentando con primer usuario disponible...');
     owner = await prisma.user.findFirst();
  }

  if (!owner) {
     console.error('❌ No se encontró ningún usuario en la base de datos.');
     return;
  }

  console.log(`🔍 Escaneando historial para Tenant: ${tenant.name} (${tenant.id})`);
  
  const result = await runHistoricalConsolidation({
    tenantId: tenant.id,
    userId: owner.id,
    userEmail: owner.email
  });

  console.log('✅ Consolidación completada con éxito.');
  console.log(`📊 Meses procesados: ${result.processedMonths}`);
  console.log(`🛡️ Hash de Integridad Inicial: ${result.integrityHash}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
