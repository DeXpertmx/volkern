const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkConfidence() {
  // We'll try to find any recent log that has the "No entendí" status
  // or low confidence if it was logged.
  const logs = await prisma.chatbotAuditLog.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  
  console.log('Last logs:');
  logs.forEach(log => {
    console.log(`[${log.createdAt}] Status: ${log.status}, Intent: ${log.intent}, Input: ${log.inputRaw}`);
  });
  
  await prisma.$disconnect();
}

checkConfidence();
