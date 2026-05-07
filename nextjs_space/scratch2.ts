import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  await prisma.user.update({
    where: { email: 'demo@volkern.app' },
    data: { name: 'Demo Volkern' }
  });

  console.log('Renamed demo@volkern.app to Demo Volkern');

  await prisma.$disconnect();
}
main().catch(console.error);
