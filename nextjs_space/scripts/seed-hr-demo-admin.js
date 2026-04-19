const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q';
  console.log(`Seeding HR demo data for Volkern Admin Tenant: ${tenantId}`);

  // Limpieza previa opcional para evitar duplicados en demo si se desea, 
  // pero mejor crear nuevos IDs únicos.

  // 1. Create Employees
  const emp1 = await prisma.employee.create({
    data: {
      tenantId,
      fullName: 'Carlos Jiménez',
      role: 'DevOps Engineer',
      department: 'TECH',
      vacationQuota: 22,
      vacationUsed: 5,
    }
  });

  const emp2 = await prisma.employee.create({
    data: {
      tenantId,
      fullName: 'Ana García',
      role: 'UX Designer',
      department: 'DESIGN',
      vacationQuota: 25,
      vacationUsed: 10,
    }
  });

  const emp3 = await prisma.employee.create({
    data: {
      tenantId,
      fullName: 'Roberto Díaz',
      role: 'Fullstack Developer',
      department: 'TECH',
      vacationQuota: 22,
      vacationUsed: 21,
    }
  });

  // 2. Create Project and Critical Milestone
  const project = await prisma.project.create({
    data: {
      tenantId,
      name: 'Fábrica Inteligente Sector Sur',
      status: 'ACTIVE',
      description: 'Implementación de gemelo digital y Vision-Lock'
    }
  });

  await prisma.projectMilestone.create({
    data: {
      tenantId,
      projectId: project.id,
      name: 'Entrega Final Planta Cádiz',
      isCritical: true,
      dueDate: new Date('2026-05-15T09:00:00Z'),
      status: 'PENDING'
    }
  });

  // 3. Create Vacation Requests (Conflicts)
  
  // Ana García colisiona con hito crítico el 15 de Mayo
  await prisma.vacationRequest.create({
    data: {
      tenantId,
      employeeId: emp2.id,
      startDate: new Date('2026-05-13T00:00:00Z'),
      endDate: new Date('2026-05-16T00:00:00Z'),
      type: 'VACATION',
      status: 'PENDING',
      reason: 'Boda familiar en Sevilla'
    }
  });

  // Roberto Díaz pide 5 días pero solo le queda 1 (Saldo insuficiente)
  await prisma.vacationRequest.create({
    data: {
      tenantId,
      employeeId: emp3.id,
      startDate: new Date('2026-07-01T00:00:00Z'),
      endDate: new Date('2026-07-05T00:00:00Z'),
      type: 'VACATION',
      status: 'PENDING',
      reason: 'Descanso necesario'
    }
  });

  // Carlos Jiménez tiene vacaciones aprobadas (Visualización verde)
  await prisma.vacationRequest.create({
    data: {
      tenantId,
      employeeId: emp1.id,
      startDate: new Date('2026-06-10T00:00:00Z'),
      endDate: new Date('2026-06-20T00:00:00Z'),
      type: 'VACATION',
      status: 'APPROVED',
      reason: 'Viaje a Japón'
    }
  });

  // 4. Expense Claims for Tinder Feed
  await prisma.expenseClaim.create({
    data: {
      tenantId,
      employeeId: emp1.id,
      amount: 45.90,
      currency: 'EUR',
      category: 'TRANSPORT',
      description: 'Taxi Aeropuerto Jerez',
      status: 'PENDING'
    }
  });

  await prisma.expenseClaim.create({
    data: {
      tenantId,
      employeeId: emp2.id,
      amount: 1200.00,
      currency: 'EUR',
      category: 'HARDWARE',
      description: 'iPad Pro para prototipado Vision-Lock',
      status: 'PENDING'
    }
  });

  console.log('--- HR Demo Data Seeded for admin@volkern.app ---');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
