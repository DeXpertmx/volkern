import { getUpcomingBookings } from './lib/skills/booking-skills';

async function test() {
  const tenantId = 'dimension-expert-tenant-id'; // wait, I don't know his tenant ID
  const userId = 'cmov5loev0004l7045r7hkuww'; // From the previous query

  // We can just query his tenant ID from prisma
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  
  const result = await getUpcomingBookings(user.tenantId, 10, userId, '2026-05-20', 'Europe/Madrid');
  console.log("Bookings found:", result.citas.length);
  result.citas.forEach((c: any) => console.log(c.titulo, "-> Local Time:", c.fechaHoraLocal));
  
  await prisma.$disconnect();
}

test();
