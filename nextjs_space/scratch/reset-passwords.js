const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('volkern123456', 10);
  
  const emails = ['bruno.hess@dimensionexpert.com', 'admin@volkern.app'];
  
  for (const email of emails) {
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword }
    });
    console.log(`✅ Contraseña actualizada para: ${email}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
