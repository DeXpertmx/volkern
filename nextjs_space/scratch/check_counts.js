const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const assetCount = await prisma.asset.count();
    const profitabilityCount = await prisma.profitabilityRecord.count();
    const cashflowCount = await prisma.cashflowProjection.count();
    const alertCount = await prisma.executiveAlert.count();
    const projectCount = await prisma.project.count();
    const dealCount = await prisma.deal.count();
    const invoiceCount = await prisma.invoice.count();
    const ticketCount = await prisma.supportTicket.count();

    console.log({
      assetCount,
      profitabilityCount,
      cashflowCount,
      alertCount,
      projectCount,
      dealCount,
      invoiceCount,
      ticketCount
    });
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

check();
