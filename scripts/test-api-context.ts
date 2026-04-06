import { dbContext, prisma } from '../lib/db';
import { getTenantDb } from '../lib/db';

/**
 * Prueba conceptual del Wrapper y el Proxy Mágico
 */

async function mockApiHandler() {
  console.log('--- DENTRO DEL HANDLER MOCKED ---');
  
  // Consultamos leads usando el 'prisma' proxy
  const leads = await prisma.lead.findMany({ take: 1 });
  
  console.log(`[Proxy] Encontrados ${leads.length} leads.`);
  if (leads.length > 0) {
    console.log(`[Proxy] Lead name: ${leads[0].nombre}`);
    console.log(`[Proxy] TenantId en record: ${leads[0].tenantId}`);
  }
}

async function runTest() {
  console.log('🚀 Probando aislamiento mágico via Context...');
  
  const tenantSlug = 'test-tenant';
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  
  if (!tenant || !tenant.dbUrl) {
    console.error('Tenant test-tenant no listo.');
    return;
  }

  const tenantClient = await getTenantDb(tenant.id);

  console.log('\nEjecutando con contexto de TEST-TENANT...');
  await dbContext.run({ tenantId: tenant.id, client: tenantClient }, async () => {
    await mockApiHandler();
  });

  console.log('\nEjecutando SIN contexto (Global)...');
  await mockApiHandler();
}

runTest().catch(console.error).finally(() => process.exit(0));
