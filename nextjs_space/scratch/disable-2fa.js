const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    data: {
      isTwoFactorEnabled: false
    }
  });
  console.log(`✅ 2FA desactivado para ${result.count} usuarios`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
