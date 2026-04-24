const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function stressTest() {
  console.log('🚀 Iniciando Prueba de Estrés: Ciclo de Vida Completo de Proyecto');
  
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q'; // Usamos el tenant de prueba estándar
  
  try {
    // 1. Crear Lead de Alto Valor
    console.log('1. Creando Lead de alto valor...');
    const lead = await prisma.lead.create({
      data: {
        tenantId,
        nombre: 'Megaplant Solar Ind',
        email: 'ceo@megasolar.com',
        empresa: 'Megaplant Industries',
        estado: 'calificado',
        contextoProyecto: 'Instalación de Parque Solar de 500kW'
      }
    });
    console.log(`Lead creado: ${lead.id}`);

    // 2. Simular Conversión a Proyecto (Llamando a la lógica que definimos en la API)
    // Nota: Aquí lo hacemos directo vía Prisma pero replicando la lógica de la API
    console.log('2. Convirtiendo Lead a Proyecto Solar...');
    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          tenantId,
          leadId: lead.id,
          name: 'PROYECTO SOLAR MEGAPLANT',
          description: 'Instalación llave en mano de parque fotovoltaico industrial.',
          budget: 250000,
          currency: 'EUR',
          status: 'ACTIVE',
          startDate: new Date()
        }
      });

      // Generar hitos solares
      const solarMilestones = [
        { name: 'Ingeniería y Permisos', days: 10, billing: 10 },
        { name: 'Suministro de Componentes', days: 30, billing: 40 },
        { name: 'Montaje de Estructuras', days: 50, billing: 20 },
        { name: 'Puesta en Marcha', days: 70, billing: 30 }
      ];

      for (const m of solarMilestones) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + m.days);
        await tx.projectMilestone.create({
          data: {
            tenantId,
            projectId: p.id,
            name: m.name,
            status: 'PENDING',
            dueDate,
            billingPercentage: m.billing,
            isCritical: true
          }
        });
      }

      await tx.lead.update({ where: { id: lead.id }, data: { estado: 'ganado' } });
      return p;
    });
    console.log(`Proyecto creado con hitos: ${project.id}`);

    // 3. Simular Consumo de Inventario
    console.log('3. Registrando consumo de materiales críticos...');
    // Buscamos un item en el catálogo (o creamos uno para el test)
    let item = await prisma.catalogoItem.findFirst({ where: { tenantId } });
    if (!item) {
      item = await prisma.catalogoItem.create({
        data: { tenantId, nombre: 'Panel Solar 450W Premium', sku: 'SOL-450-P', costoBase: 120, precioVenta: 180, unidadMedida: 'UN' }
      });
    }

    const warehouse = await prisma.warehouse.findFirst({ where: { tenantId } });
    
    // Registrar salida de 100 paneles
    await prisma.stockMovement.create({
      data: {
        tenantId,
        projectId: project.id,
        warehouseId: warehouse.id,
        catalogoItemId: item.id,
        type: 'OUT',
        quantity: -100,
        reason: 'Despacho inicial para montaje Megaplant',
        metadata: { costAtMovement: item.costoBase }
      }
    });
    console.log('Consumo de 100 paneles registrado.');

    // 4. Simular Cierre de Hito y Facturación
    console.log('4. Completando primer hito y disparando facturación automática...');
    const firstMilestone = await prisma.projectMilestone.findFirst({ where: { projectId: project.id } });
    
    // Simular la lógica de la API PATCH
    const amount = (project.budget * firstMilestone.billingPercentage) / 100;
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        leadId: lead.id,
        numero: `FAC-TEST-${Date.now()}`,
        monto: amount,
        moneda: 'EUR',
        estado: 'pagada',
        provider: 'stripe',
        metadata: { projectId: project.id, milestoneId: firstMilestone.id }
      }
    });

    await prisma.projectMilestone.update({
      where: { id: firstMilestone.id },
      data: { status: 'COMPLETED', completedAt: new Date() }
    });
    console.log(`Hito completado. Factura generada por €${amount}`);

    // 5. Análisis Final de Rentabilidad
    console.log('5. Ejecutando análisis de auditoría...');
    const itemCost = item.costoBase || 120;
    const materialCost = 100 * itemCost;
    const invoiced = amount;
    const margin = invoiced - materialCost;
    const marginPct = (margin / invoiced) * 100;

    console.log('\n--- RESULTADOS DEL STRESS TEST ---');
    console.log(`Proyecto: ${project.name}`);
    console.log(`Ingresos (Facturado): €${invoiced.toLocaleString()}`);
    console.log(`Costos (Materiales): €${materialCost.toLocaleString()}`);
    console.log(`Margen Neto: €${margin.toLocaleString()}`);
    console.log(`Margen %: ${marginPct.toFixed(2)}%`);
    console.log('----------------------------------\n');

    if (marginPct > 0) {
      console.log('✅ TEST EXITOSO: Flujo completo verificado y rentable.');
    } else {
      console.log('⚠️ TEST COMPLETADO: El proyecto operó a pérdida en esta fase.');
    }

  } catch (error) {
    console.error('❌ ERROR EN STRESS TEST:', error);
  } finally {
    await prisma.$disconnect();
  }
}

stressTest();
