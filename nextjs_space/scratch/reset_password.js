const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const email = 'bruno.hess@dimensionexpert.com';
  const newPassword = 'Volkern2026!';
  
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  
  const user = await prisma.user.update({
    where: { email },
    data: { password: hashedPassword }
  });
  
  console.log(`✅ Password reset successfully for ${email}`);
  console.log(`New password: ${newPassword}`);

  // Also verify admin@volkern.app
  const adminApp = await prisma.user.findUnique({
     where: { email: 'admin@volkern.app' }
  });
  
  if (adminApp) {
    console.log(`✅ User admin@volkern.app is present (ID: ${adminApp.id})`);
  } else {
    // If it didn't exist (it should based on previous search), we could create it or rename admin@volkern.com
    console.log(`⚠️ User admin@volkern.app not found.`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
