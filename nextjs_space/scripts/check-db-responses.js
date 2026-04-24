const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const responses = await prisma.gemmaResponse.findMany();
  console.log('Respuestas de Gemma encontradas:', responses.length);
  if (responses.length > 0) {
    console.log('Última respuesta:', responses[0].message);
  }
  process.exit(0);
}

check();
