const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testApi() {
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q'; // Tu Tenant ID según los logs
  
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: tenantId },
      include: {
        role: {
          select: { id: true, nombre: true }
        },
        employee: {
          select: { id: true, employeeId: true, department: true, jobTitle: true }
        }
      }
    });
    
    console.log('API SUCCESS: Found', users.length, 'users');
    console.log('Sample User:', JSON.stringify(users[0], null, 2));
  } catch (error) {
    console.error('API ERROR:', error.message);
  }
}

testApi().finally(() => prisma.$disconnect());
