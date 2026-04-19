const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function seed() {
  console.log('--- SEEDING PAYROLL DEMO DATA ---')
  
  // 1. Obtener el usuario admin
  const admin = await prisma.user.findFirst({
    where: { email: 'admin@volkern.app' }
  })
  
  if (!admin) {
    console.error('Admin user not found')
    process.exit(1)
  }

  // 2. Crear o Actualizar Empleado "Ana García" vinculado al admin
  const ana = await prisma.employee.upsert({
    where: { id: 'clv2p3m1p0001jrnz9q6u5x6n' },
    update: {
      fullName: 'Ana García',
      salary: 2500,
      irpfrate: 15,
      ssrate: 6.35,
      role: 'Sales Executive',
      isActive: true,
      tenantId: admin.tenantId,
      userId: admin.id
    },
    create: {
      id: 'clv2p3m1p0001jrnz9q6u5x6n',
      fullName: 'Ana García',
      salary: 2500,
      irpfrate: 15,
      ssrate: 6.35,
      role: 'Sales Executive',
      isActive: true,
      tenantId: admin.tenantId,
      userId: admin.id
    }
  })
  console.log('Empleado Ana García listo:', ana.id)

  // 3. Crear Comisión Aprobada para Abril 2026
  await prisma.comision.create({
    data: {
      id: 'clv2p3m1p0002jrnz0q6u5x6n',
      userId: admin.id,
      tenantId: admin.tenantId,
      montoCalculado: 450,
      estado: 'aprobada',
      fechaAprobacion: new Date('2026-04-15T12:00:00Z'),
      metodoCalculo: 'Comisión por Venta Directa (CRM)'
    }
  }).catch(() => console.log('La comisión ya existía o hubo un error menor'))

  // 4. Crear Asistencias de prueba
  const days = [1, 2, 3, 6, 7, 8, 9, 10, 13, 14, 15]
  for (const day of days) {
    await prisma.attendance.create({
      data: {
          employeeId: ana.id,
          tenantId: admin.tenantId,
          type: 'CLOCK_IN',
          timestamp: new Date(2026, 3, day, 9, 0, 0)
      }
    }).catch(() => {})
  }
  console.log(`${days.length} registros de asistencia creados`)

  console.log('--- SEED COMPLETADO ---')
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
