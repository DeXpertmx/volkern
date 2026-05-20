import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  try {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error("No user found");
    
    console.log("Creating ausencia for user:", user.id);
    const ausencia = await prisma.ausencia.create({
      data: {
        userId: user.id,
        titulo: 'Test Ausencia',
        fechaInicio: new Date(),
        fechaFin: new Date(),
        razon: 'Test',
        tipo: 'vacaciones',
        color: '#ff0000',
        activo: true
      }
    });
    console.log("Created:", ausencia);
  } catch (error) {
    console.error("Prisma Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}
test();
