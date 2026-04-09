import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const citas = await prisma.cita.findMany({
    where: {
      fechaHora: { gte: new Date() }
    },
    select: {
      id: true,
      titulo: true,
      googleCalendarEventId: true,
      fechaHora: true
    },
    orderBy: { fechaHora: 'asc' },
    take: 20
  });
  
  console.log('\n📅 CITAS FUTURAS:');
  citas.forEach(c => {
    console.log(`  - ${c.titulo} | ${c.fechaHora.toISOString().slice(0,16)} | GCal ID: ${c.googleCalendarEventId || 'NULL'}`);
  });
  
  const sinId = citas.filter(c => !c.googleCalendarEventId).length;
  const conId = citas.filter(c => c.googleCalendarEventId).length;
  console.log(`\n📊 Resumen: ${conId} con GoogleCalendarEventId, ${sinId} sin ID`);
}

main().then(() => prisma.$disconnect());
