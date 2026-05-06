const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

async function main() {
  const logs = await prisma.auditLog.findMany({
    where: {
      accion: 'LOGIN_FAILURE',
    },
    take: 10,
    orderBy: { fechaCreacion: 'desc' }
  });

  console.log('Últimos fallos de login:');
  logs.forEach(l => {
    console.log(`- ${l.fechaCreacion.toISOString()}: ${l.descripcion}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
