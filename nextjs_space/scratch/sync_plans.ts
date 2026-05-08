const { globalPrisma } = require('../lib/db');

async function syncPlans() {
  const plans = [
    { slug: 'starter', nombre: 'Starter', precio: 49, moneda: 'EUR', limiteUsuarios: 5, limiteLeads: 1000 },
    { slug: 'growth', nombre: 'Growth', precio: 99, moneda: 'EUR', limiteUsuarios: 15, limiteLeads: 5000 },
    { slug: 'pro', nombre: 'Pro', precio: 199, moneda: 'EUR', limiteUsuarios: 50, limiteLeads: 20000 },
    { slug: 'enterprise', nombre: 'Enterprise', precio: 399, moneda: 'EUR', limiteUsuarios: -1, limiteLeads: -1 },
    { slug: 'ERP_INDUSTRIAL', nombre: 'ERP Industrial', precio: 499, moneda: 'EUR', limiteUsuarios: -1, limiteLeads: -1 }
  ];

  for (const plan of plans) {
    await globalPrisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan
    });
    console.log(`Synced plan: ${plan.slug}`);
  }
  process.exit();
}

syncPlans();
