/**
 * Consulta los audit logs recientes del chatbot para ver qué clasificó.
 */
import { prisma } from '../lib/db';

async function main() {
  const logs = await prisma.chatbotAuditLog.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 45 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { intent: true, status: true, inputRaw: true, gemmaOutput: true, skillExecuted: true, errorMessage: true, createdAt: true },
  });
  for (const l of logs) {
    console.log('-----');
    console.log('intent:', l.intent, '| status:', l.status, '| skill:', l.skillExecuted);
    console.log('input:', (l.inputRaw || '').slice(0, 120));
    console.log('raw:', (l.gemmaOutput || '').slice(0, 400));
    if (l.errorMessage) console.log('error:', l.errorMessage.slice(0, 200));
    console.log('at:', l.createdAt);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
