const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkChatbotData() {
  console.log('--- Checking Chatbot Database State ---');
  
  try {
    const users = await prisma.user.findMany({
      include: { tenant: { include: { features: true } } }
    });
    
    console.log('Users and Tenants:');
    for (const user of users) {
      console.log(`- User: ${user.email}, TenantId: ${user.tenantId}, TenantName: ${user.tenant?.nombre}`);
      
      if (user.tenantId) {
        const config = await prisma.chatbotConfig.findUnique({
          where: { tenantId: user.tenantId }
        });
        console.log(`  Config Status: ${config ? (config.activo ? 'Active' : 'Inactive') : 'NOT FOUND'}`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkChatbotData();
