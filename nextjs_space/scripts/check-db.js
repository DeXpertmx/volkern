const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const messages = await prisma.chatMessage.findMany({
    where: {
      metadata: {
        path: ['isGemmaSuggestion'],
        equals: true
      }
    }
  });
  console.log('Mensajes de Gemma encontrados:', messages.length);
  if (messages.length > 0) {
    console.log('Último mensaje:', messages[0].content);
    console.log('Metadata:', JSON.stringify(messages[0].metadata, null, 2));
  }
  process.exit(0);
}

check();
