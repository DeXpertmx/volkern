import { prisma } from '../lib/db'
async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'bruno.hess@dimensionexpert.com' },
    select: { id: true, tenantId: true, metadata: true },
  })
  const meta = (user?.metadata as any) || {}
  console.log('=== USUARIO ===')
  console.log('telegram_chat_id:', meta.telegram_chat_id || 'ausente')
  console.log('telegram_link_token:', meta.telegram_link_token ? 'presente' : 'consumido/null')

  if (user?.tenantId) {
    const ints = await prisma.integration.findMany({
      where: { tenantId: user.tenantId, tipo: 'telegram' },
      select: { id: true, nombre: true, credenciales: true, updatedAt: true },
    })
    console.log('\n=== INTEGRACIONES TELEGRAM (admin_chat_id) ===')
    for (const i of ints) {
      const c = (i.credenciales as any) || {}
      console.log(`- ${i.nombre} | admin_chat_id=${c.admin_chat_id || 'ausente'} | bot_token=${c.bot_token ? 'si' : 'no'} | updatedAt=${i.updatedAt}`)
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
