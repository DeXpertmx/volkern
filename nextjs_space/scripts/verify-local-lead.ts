import { prisma } from '../lib/db'
async function main() {
  const lead = await prisma.lead.findFirst({
    where: { email: 'pruebalocal@volkern.test' },
    select: { id: true, nombre: true, email: true, empresa: true, estado: true, tenantId: true, fechaCreacion: true },
  })
  console.log('=== LEAD ===')
  console.log(JSON.stringify(lead, null, 2))
  if (lead?.tenantId) {
    const company = await prisma.contact.findFirst({
      where: { tenantId: lead.tenantId, tipo: 'company', nombre: { contains: 'Volkern Test', mode: 'insensitive' } },
      select: { id: true, nombre: true, email: true, tipo: true },
    })
    console.log('=== EMPRESA AUTO-CREADA ===')
    console.log(JSON.stringify(company, null, 2))
  }
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
