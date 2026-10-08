/**
 * ⚠️⚠️ Resetea la contraseña de `bruno.hess@dimensionexpert.com`, una cuenta REAL
 * cuyo propietario ya cambió su contraseña a una propia (03/09). Re-ejecutar esto
 * contra producción lo deja fuera. Ver scripts/reset-bruno-password.ts.
 *
 * Ni la URL de la base de datos ni la contraseña viven en este archivo: la URL
 * se toma de `DATABASE_URL` y la contraseña de `BRUNO_TEMP_PASSWORD`.
 *
 *   BRUNO_TEMP_PASSWORD='…' node scratch/reset_admin_direct.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const newPassword = process.env.BRUNO_TEMP_PASSWORD;
if (!newPassword) {
  console.error('❌ Define BRUNO_TEMP_PASSWORD en el entorno antes de ejecutar.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('❌ Define DATABASE_URL en el entorno antes de ejecutar.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const email = 'bruno.hess@dimensionexpert.com';
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const user = await prisma.user.update({
    where: { email },
    data: {
      password: hashedPassword,
      estado: 'activo'
    }
  });

  // No se imprime la contraseña: la salida de estos scripts acaba en logs.
  console.log(`✅ EXITO: Contraseña reseteada para ${user.email}`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async err => {
  console.error('❌ ERROR:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
