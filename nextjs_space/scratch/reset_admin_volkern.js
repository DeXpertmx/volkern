/**
 * ⚠️ Resetea la contraseña del superadmin `admin@volkern.app`.
 *
 * Ni la URL de la base de datos ni la contraseña viven en este archivo: la URL
 * se toma de `DATABASE_URL` y la contraseña de `ADMIN_TEMP_PASSWORD`. Ver
 * scripts/bootstrap-admin.env.example y docs/ROTACION-CREDENCIALES-ADMIN.md.
 *
 *   ADMIN_TEMP_PASSWORD='…' node scratch/reset_admin_volkern.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const newPassword = process.env.ADMIN_TEMP_PASSWORD;
if (!newPassword) {
  console.error('❌ Define ADMIN_TEMP_PASSWORD en el entorno antes de ejecutar.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('❌ Define DATABASE_URL en el entorno antes de ejecutar.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@volkern.app';
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
