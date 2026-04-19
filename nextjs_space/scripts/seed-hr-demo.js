const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('No tenant found. Please run the onboarding first.');
    return;
  }

  const tenantId = tenant.id;
  console.log(`Seeding HR demo data for tenant: ${tenantId}`);

  // 1. Create Employees
  const employees = [
    { fullName: 'Carlos Jiménez', role: 'DevOps Engineer', department: 'TECH', vacationQuota: 22, vacationUsed: 5 },
    { fullName: 'Ana García', role: 'UX Designer', department: 'DESIGN', vacationQuota: 25, vacationUsed: 10 },
    { fullName: 'Roberto Díaz', role: 'Fullstack Developer', department: 'TECH', vacationQuota: 22, vacationUsed: 21 }, // Almost out of days
    { fullName: 'Elena Rivas', role: 'Project Manager', department: 'MANAGEMENT', vacationQuota: 30, vacationUsed: 2 },
  ];

  const createdEmployees = [];
  for (const empData of employees) {
    const emp = await prisma.employee.create({
      data: { ...empData, tenantId }
    });
    createdEmployees.push(emp);
  }

  // 2. Create a Project and Milestones
  const project = await prisma.project.create({
    data: {
      name: 'Industrial Expansion v2',
      tenantId,
      status: 'ACTIVE',
      description: 'Main industrial project for 2026'
    }
  });

  await prisma.projectMilestone.createMany({
    data: [
      {
        tenantId,
        projectId: project.id,
        name: 'Entrega Final Planta Cadiz',
        isCritical: true,
        dueDate: new Date('2026-05-15T10:00:00Z'),
        status: 'PENDING'
      },
      {
        tenantId,
        projectId: project.id,
        name: 'Revisión de Seguridad MCP',
        isCritical: false,
        dueDate: new Date('2026-05-20T10:00:00Z'),
        status: 'PENDING'
      }
    ]
  });

  // 3. Create Vacation Requests
  // Request 1: Valid
  await prisma.vacationRequest.create({
    data: {
      tenantId,
      employeeId: createdEmployees[0].id,
      startDate: new Date('2026-06-01T00:00:00Z'),
      endDate: new Date('2026-06-10T00:00:00Z'),
      type: 'VACATION',
      status: 'APPROVED',
      reason: 'Vacaciones de verano adelantadas'
    }
  });

  // Request 2: Conflict with critical milestone (Entrega Final Planta Cadiz)
  await prisma.vacationRequest.create({
    data: {
      tenantId,
      employeeId: createdEmployees[1].id,
      startDate: new Date('2026-05-14T00:00:00Z'),
      endDate: new Date('2026-05-17T00:00:00Z'),
      type: 'VACATION',
      status: 'PENDING',
      reason: 'Escapada de fin de semana'
    }
  });

  // Request 3: Out of quota (Roberto Díaz has 21/22 used, requesting 5 days)
  await prisma.vacationRequest.create({
    data: {
      tenantId,
      employeeId: createdEmployees[2].id,
      startDate: new Date('2026-07-01T00:00:00Z'),
      endDate: new Date('2026-07-05T00:00:00Z'),
      type: 'VACATION',
      status: 'PENDING',
      reason: 'Días de descanso necesarios'
    }
  });

  // 4. Create Expense Claims for Tinder-feed
  await prisma.expenseClaim.createMany({
    data: [
      {
        tenantId,
        employeeId: createdEmployees[0].id,
        amount: 45.50,
        currency: 'EUR',
        category: 'TRAVEL',
        description: 'Taxi a la terminal de carga',
        status: 'PENDING'
      },
      {
        tenantId,
        employeeId: createdEmployees[3].id,
        amount: 890.00,
        currency: 'EUR',
        category: 'EQUIPMENT',
        description: 'Licencia de software Vision-Lock Enterprise',
        status: 'PENDING'
      }
    ]
  });

  console.log('Demo data seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
