const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TENANT_ID = 'cmo0axgu30000mfux54c6mb30'; // Agencia Expert
const USER_ID = 'cmo3hy4jo0001mft4wro0s30b'; // Admin User

async function main() {
  console.log('🚀 Iniciando seeding de datos financieros...');

  // 1. Limpiar datos previos si es necesario (opcional)
  // await prisma.expense.deleteMany({ where: { tenantId: TENANT_ID } });
  // await prisma.supplier.deleteMany({ where: { tenantId: TENANT_ID } });

  // 2. Crear Proveedores
  const suppliersData = [
    { name: 'Google Cloud EMEA', category: 'SaaS', taxId: 'IE6388047V', email: 'billing@google.com' },
    { name: 'Amazon Web Services', category: 'Infrastructure', taxId: 'LU19647148', email: 'billing@aws.com' },
    { name: 'Inmobiliaria Premium SL', category: 'Rent', taxId: 'B87654321', email: 'rentas@premium.com' },
    { name: 'Iberdrola Energía', category: 'Utilities', taxId: 'A95001234', email: 'soporte@iberdrola.es' },
    { name: 'Vodafone Business', category: 'Connectivity', taxId: 'A12345678', email: 'empresas@vodafone.es' },
    { name: 'Meta Platforms Ireland', category: 'Marketing', taxId: 'IE9692928F', email: 'ads-billing@fb.com' },
  ];

  const suppliers = [];
  for (const s of suppliersData) {
    const supplier = await prisma.supplier.create({
      data: {
        ...s,
        tenantId: TENANT_ID,
      }
    });
    suppliers.push(supplier);
  }
  console.log(`✅ ${suppliers.length} proveedores creados.`);

  // 3. Crear Gastos (Expenses) para los últimos 6 meses
  const categories = ['SaaS', 'Marketing', 'Rent', 'Utilities', 'Payroll', 'Travel'];
  const months = [0, 1, 2, 3, 4, 5];
  
  for (const monthOffset of months) {
    const date = new Date();
    date.setMonth(date.getMonth() - monthOffset);
    
    // Crear un puñado de gastos por mes
    for (let i = 0; i < 5; i++) {
      const supplier = suppliers[Math.floor(Math.random() * suppliers.length)];
      const amount = Math.floor(Math.random() * 500) + 50;
      
      await prisma.expense.create({
        data: {
          tenantId: TENANT_ID,
          createdById: USER_ID,
          supplierId: supplier.id,
          description: `Gasto mensual de ${supplier.name} - ${date.toLocaleString('es-ES', { month: 'long' })}`,
          amount,
          currency: 'EUR',
          date: date,
          status: 'PAID',
          category: supplier.category,
          isAnomaly: Math.random() > 0.9, // 10% de probabilidad de anomalía para visualización
        }
      });
    }
  }
  console.log('✅ Gastos históricos creados.');

  // 4. Crear FinancialSummaries para los últimos 12 meses
  for (let i = 0; i < 12; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    const revenue = 5000 + Math.random() * 3000;
    const expenses = 2000 + Math.random() * 1000;

    await prisma.financialSummary.upsert({
      where: {
        month_year_tenantId: {
          month,
          year,
          tenantId: TENANT_ID
        }
      },
      update: {
        totalRevenue: revenue,
        totalExpenses: expenses,
        netProfit: revenue - expenses,
        taxEstimated: (revenue - expenses) * 0.21,
      },
      create: {
        tenantId: TENANT_ID,
        month,
        year,
        totalRevenue: revenue,
        totalExpenses: expenses,
        netProfit: revenue - expenses,
        taxEstimated: (revenue - expenses) * 0.21,
      }
    });
  }
  console.log('✅ Resúmenes financieros (gráficas) creados.');

  // 5. Crear Facturas Históricas
  const leadIds = ["cmo8tdpjg000dmf4v0q7c7ewp", "cmo8tdpjn000fmf4vkb7o67n2", "cmo8tdpjr000hmf4vf29ab3hk"];
  for (let i = 0; i < 15; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (i * 5));
    const monto = 800 + Math.random() * 1200;
    
    await prisma.invoice.create({
      data: {
        tenantId: TENANT_ID,
        leadId: leadIds[Math.floor(Math.random() * leadIds.length)],
        numero: `INV-2026-${String(i+10).padStart(3, '0')}`,
        monto,
        moneda: 'EUR',
        estado: i % 4 === 0 ? 'pendiente' : 'pagado',
        fechaEmision: date,
        isSealed: true,
        provider: 'volkern',
        verifactuVersion: 1,
      }
    });
  }
  console.log('✅ Facturas adicionales creadas.');

  console.log('✨ Seeding financiero completado con éxito.');
}

main()
  .catch((e) => {
    console.error('❌ Error en el seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
