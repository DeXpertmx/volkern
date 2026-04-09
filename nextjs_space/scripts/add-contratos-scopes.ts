import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function addContratosScopes() {
  const newScopes = ['contratos:read', 'contratos:write', 'contratos:delete'];
  
  const apiKeys = await prisma.apiKey.findMany({
    where: { activo: true }
  });

  for (const key of apiKeys) {
    const currentScopes = key.scopes as string[];
    const updatedScopes = [...new Set([...currentScopes, ...newScopes])];
    
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { scopes: updatedScopes }
    });
  }

  console.log(`Updated ${apiKeys.length} API keys with contratos scopes`);
  await prisma.$disconnect();
}

addContratosScopes();
