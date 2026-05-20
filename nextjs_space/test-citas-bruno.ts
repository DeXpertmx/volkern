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

    console.log("=== USUARIO ===");
    console.log("Nombre:", user.name);
    console.log("Tenant:", user.tenant?.nombre);
    console.log("Timezone configurado:", user.timezone);

    const startOfMay = new Date('2026-05-01T00:00:00Z');
    const endOfMay = new Date('2026-05-31T23:59:59Z');

    const citas = await prisma.cita.findMany({
      where: {
        tenantId: user.tenantId,
        fechaHora: {
          gte: startOfMay,
          lte: endOfMay
        }
      },
      orderBy: { fechaHora: 'asc' },
      include: { lead: true }
    });

    console.log("\n=== CITAS EN LA BD ===");
    if (citas.length === 0) {
      console.log("No hay citas en este rango.");
    } else {
      citas.forEach(cita => {
        console.log(`- [${cita.id}] ${cita.titulo} | lead: ${cita.lead?.nombre} | source: ${cita.origenCita || 'volkern'}`);
        console.log(`  fechaHora (UTC crudo de BD): ${cita.fechaHora.toISOString()}`);
        console.log(`  fechaHora (Local server): ${cita.fechaHora.toString()}`);
        console.log("  ---------------------------------");
      });
    }

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
