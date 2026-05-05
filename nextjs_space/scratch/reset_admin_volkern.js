const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient({
  datasources: {
    db: { url: "postgresql://neondb_owner:npg_qi4kcVBa1vUR@ep-withered-mode-al6o4sjg-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require" }
  }
});

async function main() {
  const email = 'admin@volkern.app';
  const newPassword = 'Volkern2024!';
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  const user = await prisma.user.update({
    where: { email },
    data: { 
      password: hashedPassword,
      estado: 'activo'
    }
  });
  
  console.log(`✅ EXITO: Contraseña reseteada para ${user.email}`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ ERROR:', err.message);
  process.exit(1);
});
