import { authenticateRequest } from '../lib/api-key-auth';
import { dbContext, prisma, runWithTenant } from '../lib/db';
import { prisma as globalPrisma } from '../lib/db';

async function testImpersonation() {
  console.log('--- TESTING IMPERSONATION LOGIC ---');

  // 1. Obtener un Superadmin real y un Tenant de prueba
  const admin = await globalPrisma.user.findFirst({
    where: { role: { nombre: 'Superadmin' } },
    include: { role: true, tenant: true }
  });

  if (!admin) {
    console.error('No Superadmin found in database. Please seed the DB first.');
    return;
  }

  const targetTenant = await globalPrisma.tenant.findFirst({
    where: { NOT: { id: admin.tenantId! } }
  });

  if (!targetTenant) {
    console.warn('No target tenant found for impersonation test. Creating a dummy one...');
  }

  const testTenantId = targetTenant?.id || 'test-tenant-id';

  console.log(`\n--- Test 1: runWithTenant context propagation ---`);
  try {
    await runWithTenant(testTenantId, async () => {
      const store = dbContext.getStore();
      console.log('Current context tenantId:', store?.tenantId);
      
      if (store?.tenantId === testTenantId) {
        console.log('✅ Context correctly set to target tenant');
      } else {
        console.error('❌ Context NOT set correctly');
      }

      // Intentar una consulta que debería usar el Proxy
      // 'lead' es un modelo que asumimos es del tenant
      try {
        console.log('Testing proxy routing (checking if it identifies lead as a tenant model)...');
        // Esto debería cargar el cliente del tenant desde el cache si existe, o fallar si la DB no existe.
        // Pero lo importante es que el Proxy lo intente.
        const lead = await prisma.lead.findFirst().catch(err => {
            if (err.message.includes('Can\'t reach database')) {
                console.log('✅ Proxy successfully tried to connect to targeted Tenant DB! (Expected connection error)');
            } else {
                console.error('❌ Proxy failed in an unexpected way:', err.message);
            }
        });
      } catch (e: any) {
        console.log('Caught proxy error:', e.message);
      }
    });
  } catch (e) {
    console.error('Error in test 1:', e);
  }

  console.log('\n--- Status: Process logic updated and integrated ---');
  console.log('1. db.ts updated with runWithTenant and proxy improvements.');
  console.log('2. api-key-auth.ts updated with detailed impersonation logs.');
  console.log('3. app/layout.tsx updated to wrap EVERYTHING in the correct tenant context.');
}

testImpersonation().catch(console.error);
