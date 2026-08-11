/** SOLO LECTURA: verifica que insurance está activo para el tenant dexpert y que el hub Seguros sería visible */
import { prisma } from '../lib/db'
import { getActiveModules } from '../lib/plans'
import { HUBS } from '../lib/navigation-config'

async function main() {
  const t = await prisma.tenant.findFirst({ where: { subdomain: 'dexpert' }, select: { id: true, plan: true, subdomain: true, estado: true } })
  if (!t) { console.log('❌ tenant dexpert no encontrado'); process.exit(1) }
  console.log('Tenant:', JSON.stringify(t))

  const tfs = await prisma.tenantFeature.findMany({ where: { tenantId: t.id }, select: { feature: true, habilitado: true, razon: true } })
  console.log('\nTenantFeatures:')
  for (const f of tfs) console.log(`  ${f.feature}: ${f.habilitado ? 'ON' : 'OFF'} (${f.razon || 'sin razón'})`)
  const insuranceTf = tfs.find(f => f.feature === 'insurance')
  console.log(`\nOverride de insurance: ${insuranceTf ? JSON.stringify(insuranceTf) : '(ninguno — activo por plan)'}`)

  const active = await getActiveModules(t.plan, tfs)
  console.log(`\nMódulos activos (${active.length}):`)
  console.log('  Contiene insurance:', active.includes('insurance'))
  console.log('  insurance en lista:', active.includes('insurance') ? '✅ SÍ' : '❌ NO')

  // Hub Seguros en navigation-config
  const segurosHub = HUBS.find(h => h.id === 'seguros' || h.items?.some(i => i.href?.includes('/dashboard/seguros')) || h.basePaths?.some(p => p.includes('seguros')))
  console.log('\nHub Seguros en navigation-config:', JSON.stringify(segurosHub ? { id: segurosHub.id, nombre: segurosHub.nombre, requiredModule: segurosHub.requiredModule, items: segurosHub.items?.map(i => i.name) } : '❌ NO ENCONTRADO', null, 2))

  await prisma.$disconnect()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
