const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      estado: true,
      isTwoFactorEnabled: true,
      role: { select: { nombre: true } }
    }
  });
  console.log('--- USUARIOS REGISTRADOS ---');
  console.table(users);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
