import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- AUDITORÍA DE DATOS DE NÓMINA ---')
  
  const tenants = await prisma.tenant.findMany({ take: 5 })
  console.log('Tenants:', tenants.map(t => ({ id: t.id, name: t.name })))

  const employees = await prisma.employee.findMany({
    include: {
      user: true
    }
  })
  console.log('Empleados:', employees.map(e => ({
    id: e.id,
    name: e.name || e.user.name,
    salary: e.salary,
    irpfrate: e.irpfrate,
    ssrate: e.ssrate
  })))

  const commissions = await prisma.comision.findMany({
    where: { estado: 'aprobada' }
  })
  console.log('Comisiones Aprobadas:', commissions.map(c => ({
    id: c.id,
    userId: c.userId,
    monto: c.montoCalculado,
    fecha: c.fechaAprobacion
  })))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
