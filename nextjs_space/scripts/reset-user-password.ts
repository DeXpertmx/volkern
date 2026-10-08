// ⚠️ Sustituido por scripts/reset-bruno-password.ts, que además escribe audit log.
// Se conserva solo por compatibilidad; la contraseña ya no vive en el código.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'bruno.hess@dimensionexpert.com';
  const newPassword = process.env.BRUNO_TEMP_PASSWORD; // Nunca en el repositorio
  if (!newPassword) {
    console.error('❌ Define BRUNO_TEMP_PASSWORD en el entorno antes de ejecutar.');
    process.exit(1);
  }

  console.log(`Checking user: ${email}`);

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.error(`User ${email} not found!`);
    process.exit(1);
  }

  console.log(`User found: ${user.name || user.email}`);

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { email },
    data: { password: hashedPassword },
  });

  // No se imprime la contraseña: la salida de estos scripts acaba en logs.
  console.log(`Password reset successfully for ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
