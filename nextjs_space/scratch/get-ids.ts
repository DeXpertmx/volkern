import { prisma } from '../lib/db';

async function main() {
  const tenant = await prisma.tenant.findFirst();
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  console.log(JSON.stringify({ tenantId: tenant?.id, userId: user?.id }));
}

main();
