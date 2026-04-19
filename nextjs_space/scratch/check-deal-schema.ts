import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const deals = await prisma.deal.findMany({ take: 1 });
    console.log('Deals fields:', Object.keys(deals[0] || {}));
    
    // Test the problematic query
    const testQuery = await prisma.deal.findMany({
      orderBy: { healthScore: 'desc' },
      take: 1
    });
    console.log('Query successful');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
