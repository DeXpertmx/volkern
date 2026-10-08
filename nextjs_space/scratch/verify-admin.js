/**
 * Comprueba si una contraseña candidata abre la cuenta indicada.
 *
 * La contraseña llega por entorno, nunca escrita aquí: ver
 * scripts/bootstrap-admin.env.example.
 *
 *   ADMIN_CHECK_PASSWORD='…' node scratch/verify-admin.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const PASSWORD = process.env.ADMIN_CHECK_PASSWORD;
if (!PASSWORD) {
  console.error('❌ Define ADMIN_CHECK_PASSWORD en el entorno antes de ejecutar.');
  process.exit(1);
}

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

  // No se imprime la contraseña: la salida de estos scripts acaba en logs.
  const isPasswordValid = await bcrypt.compare(PASSWORD, user.password);
  console.log('¿La contraseña de ADMIN_CHECK_PASSWORD es válida?', isPasswordValid);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
