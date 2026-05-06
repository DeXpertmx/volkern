const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

async function main() {
  const email = 'bruno.hess@dimensionexpert.com';
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      tenant: true
    }
  });

  if (!user) {
    console.log('Usuario no encontrado');
    return;
  }

  console.log('Usuario encontrado:', {
    email: user.email,
    tenant: user.tenant?.subdomain,
    hasPassword: !!user.password
  });

  const isPasswordValid = await bcrypt.compare('Volkern2024!', user.password);
  console.log('¿Password "Volkern2024!" es válido?', isPasswordValid);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
