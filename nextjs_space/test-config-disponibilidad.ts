import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error("No tenant found");
    
    console.log("Saving disponibilidad for tenant:", tenant.id);
    const result = await prisma.configuracion.upsert({
        where: { tenantId_clave: { tenantId: tenant.id, clave: 'disponibilidad_horarios' } },
        update: { valor: 'test' },
        create: { tenantId: tenant.id, clave: 'disponibilidad_horarios', valor: 'test' }
      });
    console.log("Saved:", result);
  } catch (error) {
    console.error("Prisma Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}
test();
