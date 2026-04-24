const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inject() {
  const tenants = await prisma.tenant.findMany();
  
  for (const tenant of tenants) {
    const tenantId = tenant.id;
    console.log('Injecting projects for tenant:', tenantId);

    try {
      // 1. Buscar un lead para vincular (opcional)
      const lead = await prisma.lead.findFirst({ where: { tenantId } });

      // 2. Proyectos
      const p1 = await prisma.project.upsert({
        where: { id: `PROJ-SOLAR-${tenantId}` },
        update: {},
        create: {
          id: `PROJ-SOLAR-${tenantId}`,
          tenantId,
          name: 'Instalación Parque Solar Industrial',
          description: 'Despliegue de 500 paneles solares en sede norte.',
          status: 'ACTIVE',
          budget: 250000,
          progress: 35,
          leadId: lead ? lead.id : null,
          startDate: new Date(),
        }
      });

      const p2 = await prisma.project.upsert({
        where: { id: `PROJ-MAINT-${tenantId}` },
        update: {},
        create: {
          id: `PROJ-MAINT-${tenantId}`,
          tenantId,
          name: 'Mantenimiento Correctivo Planta A',
          description: 'Reparación de cimentación y estructura de soporte.',
          status: 'PLANNING',
          budget: 45000,
          progress: 5,
          startDate: new Date(),
        }
      });

      // 3. Hitos para el primer proyecto
      const milestones = [
        { name: 'Estudio de Suelos', status: 'COMPLETED', due: -10, critical: true },
        { name: 'Cimentación Perimetral', status: 'IN_PROGRESS', due: 5, critical: true },
        { name: 'Estructura de Soporte', status: 'PENDING', due: 15, critical: false },
        { name: 'Cableado y Conexión', status: 'PENDING', due: 30, critical: true },
      ];

      for (const m of milestones) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + m.due);

        await prisma.projectMilestone.create({
          data: {
            tenantId,
            projectId: p1.id,
            name: m.name,
            status: m.status,
            dueDate,
            isCritical: m.critical,
            completedAt: m.status === 'COMPLETED' ? new Date() : null
          }
        });
      }

    } catch (e) {
      console.error(`Error injecting projects for tenant ${tenantId}:`, e.message);
    }
  }

  process.exit(0);
}

inject();
