import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Subscription Plans...');

  const plans = [
    {
      nombre: 'Starter',
      slug: 'starter',
      precio: 49,
      moneda: 'MXN',
      intervalo: 'mensual',
      descripcion: 'Para pequeños emprendedores y startups.',
      limiteUsuarios: 3,
      limiteLeads: 500,
      limiteStorage: 5,
      activo: true,
      esPublico: true,
      features: {
        ui_features: ['3 Usuarios', '500 Leads', 'Soporte Email', 'Dashboard Básico']
      }
    },
    {
      nombre: 'Professional',
      slug: 'professional',
      precio: 129,
      moneda: 'MXN',
      intervalo: 'mensual',
      descripcion: 'Nuestra solución más equilibrada para equipos en crecimiento.',
      limiteUsuarios: 10,
      limiteLeads: 5000,
      limiteStorage: 20,
      activo: true,
      esPublico: true,
      esPopular: true,
      features: {
        ui_features: ['10 Usuarios', '5000 Leads', 'Automatizaciones', 'Marca Blanca']
      }
    },
    {
      nombre: 'Enterprise',
      slug: 'enterprise',
      precio: 399,
      moneda: 'MXN',
      intervalo: 'mensual',
      descripcion: 'Potencia total para empresas consolidadas.',
      limiteUsuarios: -1,
      limiteLeads: -1,
      limiteStorage: 100,
      activo: true,
      esPublico: true,
      features: {
        ui_features: ['Usuarios Ilimitados', 'Leads Ilimitados', 'Soporte 24/7', 'API Access']
      }
    }
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
    console.log(`✅ Plan ${plan.nombre} creado.`);
  }

  console.log('✨ Seed completado.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
