import { prisma } from '../lib/db';

async function checkPlans() {
  const plans = await prisma.subscriptionPlan.findMany();
  console.log('--- Subscription Plans in DB ---');
  plans.forEach(p => {
    console.log(`Plan: ${p.nombre} (${p.slug})`);
    console.log(`Modules:`, (p.features as any)?.modules);
    console.log('---');
  });
}

checkPlans().catch(console.error).finally(() => prisma.$disconnect());
