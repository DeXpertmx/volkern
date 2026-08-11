import { prisma } from '../lib/db'
async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, roleId: true, role: { select: { nombre: true } }, tenantId: true },
  })
  const su = users.filter(u => u.role?.nombre === 'Superadmin' || u.role?.nombre === 'superadmin' || u.role?.nombre?.toLowerCase().includes('admin'))
  console.log('Usuarios con rol admin/superadmin:')
  for (const u of su) console.log(`  ${u.email} | name=${u.name} | role=${u.role?.nombre} | tenantId=${u.tenantId}`)
  console.log('\nTotal usuarios:', users.length)
  await prisma.$disconnect()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
