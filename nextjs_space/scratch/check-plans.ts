import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.subscriptionPlan.findMany().then(plans => {
  console.log('Plans found:', plans.length);
  console.log(JSON.stringify(plans, null, 2));
}).finally(() => p.$disconnect());
