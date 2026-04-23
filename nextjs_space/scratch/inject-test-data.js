const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function injectData() {
  const ana = await prisma.employee.findFirst({
    where: { fullName: 'Ana García' }
  });
  
  if (ana) {
    console.log('Inyectando datos en Ana García...');
    await prisma.employee.update({
      where: { id: ana.id },
      data: {
        jobTitle: 'Gerente de Administración',
        employeeId: '0139',
        identificationNumber: 'BACA640111JU9', // RFC de ejemplo
        curp: 'BACA640111HSPRMS05',
        socialSecurityNumber: '17866445202',
        mobilePhone: '442 471 3788',
        department: 'Administración',
        isDepartmentAdmin: true
      }
    });
    console.log('Datos inyectados con éxito.');
  }
}

injectData().finally(() => prisma.$disconnect());
