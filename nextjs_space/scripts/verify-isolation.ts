import { PrismaClient } from '@prisma/client';
import { getTenantDb, globalPrisma } from '../lib/db';

/**
 * Script de verificación de aislamiento de datos (Multi-Model)
 * 
 * 1. Crea recursos en un tenant (test-tenant) que tiene DB dedicada.
 * 2. Verifica que los recursos NO existan en la DB global/compartida.
 * 3. Verifica que los recursos SÍ existan en la DB dedicada del tenant.
 * 4. Limpia los datos de prueba.
 */

async function main() {
  const slug = 'volkern-dev'; // Usando el tenant que ya migramos
  
  console.log(`🔍 Iniciando verificación de aislamiento para ${slug}...`);

  const tenant = await globalPrisma.tenant.findUnique({
    where: { slug }
  });

  if (!tenant || !tenant.dbUrl) {
    console.error('❌ Error: El tenant no existe o no tiene DB dedicada configurada.');
    process.exit(1);
  }

  // 1. Obtener el cliente específico del tenant
  const tenantDb = await getTenantDb(tenant.id);
  const globalDirect = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL } }
  });

  const testResults = [];

  // --- PRUEBA 1: LEAD ---
  console.log('\n--- 1. Verificando Aislamiento de Lead ---');
  const newLead = await tenantDb.lead.create({
    data: {
      nombre: 'V-Lead Aislamiento',
      email: `test-${Date.now()}@aislamiento.com`,
      tenantId: tenant.id
    }
  });
  
  const leadInGlobal = await globalDirect.lead.findUnique({ where: { id: newLead.id } });
  const leadInTenant = await tenantDb.lead.findUnique({ where: { id: newLead.id } });

  const leadSuccess = !leadInGlobal && !!leadInTenant;
  testResults.push({ model: 'Lead', success: leadSuccess });
  console.log(leadSuccess ? '✅ Lead aislado correctamente.' : '❌ FALLO: Lead no aislado.');

  // --- PRUEBA 2: PAGE (CMS) ---
  console.log('\n--- 2. Verificando Aislamiento de Page (CMS) ---');
  const newPage = await tenantDb.page.create({
    data: {
      titulo: 'V-Page Aislamiento',
      slug: `v-page-test-${Date.now()}`,
      contenido: { test: true },
      tenantId: tenant.id
    }
  });

  const pageInGlobal = await globalDirect.page.findUnique({ where: { id: newPage.id } });
  const pageInTenant = await tenantDb.page.findUnique({ where: { id: newPage.id } });

  const pageSuccess = !pageInGlobal && !!pageInTenant;
  testResults.push({ model: 'Page', success: pageSuccess });
  console.log(pageSuccess ? '✅ Page aislada correctamente.' : '❌ FALLO: Page no aislada.');

  // --- LIMPIEZA ---
  console.log('\n🧹 Limpiando datos de prueba...');
  await tenantDb.lead.delete({ where: { id: newLead.id } });
  await tenantDb.page.delete({ where: { id: newPage.id } });

  console.log('\n📋 RESUMEN FINAL:');
  testResults.forEach(r => {
    console.log(`${r.success ? '✅' : '❌'} ${r.model}: ${r.success ? 'AISLADO' : 'FALLO'}`);
  });

  await globalDirect.$disconnect();
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await globalPrisma.$disconnect();
  });
