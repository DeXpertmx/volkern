import { prisma } from '../lib/db'
async function main() {
  const conv = await prisma.conversation.findFirst({
    where: { externalRef: 'telegram:646107192' },
    select: { id: true, externalRef: true, estado: true },
    orderBy: { fechaCreacion: 'desc' },
  })
  console.log('=== CONVERSACION ===')
  console.log(JSON.stringify(conv, null, 2))
  if (conv) {
    const msgs = await prisma.message.findMany({
      where: { conversationId: conv.id, direccion: 'saliente' },
      orderBy: { fechaCreacion: 'desc' },
      take: 3,
      select: { contenido: true, fechaCreacion: true },
    })
    console.log('=== RESPUESTAS SALIENTES ===')
    for (const m of msgs) {
      console.log('---' + m.fechaCreacion.toISOString())
      console.log((m.contenido || '').substring(0, 300))
    }
    if (msgs.length === 0) console.log('(sin salientes)')
  }
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
