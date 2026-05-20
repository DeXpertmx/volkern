import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  try {
    const user = await prisma.user.findFirst({
      where: {
        name: { contains: "Bruno K. Hess" }
      },
      include: {
        tenant: true
      }
    });

    if (!user) {
      console.log("Usuario no encontrado");
      return;
    }

    console.log("Usuario encontrado:");
    console.log("ID:", user.id);
    console.log("Nombre:", user.name);
    console.log("Email:", user.email);
    console.log("Tenant:", user.tenant?.nombre);
    console.log("Metadata:", JSON.stringify(user.metadata, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
