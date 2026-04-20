import { globalPrisma } from '../lib/db';

async function main() {
  const tenant = await globalPrisma.tenant.findFirst({
    select: { id: true, name: true, plan: true }
  });
  console.log('Tenant Plan Information:');
  console.log(JSON.stringify(tenant, null, 2));
}

main().catch(console.error);
