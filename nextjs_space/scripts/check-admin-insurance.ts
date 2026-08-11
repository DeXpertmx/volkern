import { prisma } from '../lib/db'
import { ALL_MODULES, PLAN_MODULES, PLANS, getPlanConfig } from '../lib/plans'

async function main() {
  console.log('=== ALL_MODULES: insurance? ===')
  const mod = ALL_MODULES.find(m => m.id === 'insurance')
  console.log(mod ? JSON.stringify(mod) : '❌ insurance NO está en ALL_MODULES')

  console.log('\n=== PLAN_MODULES (hardcodeado, por slug): ===')
  for (const slug of Object.values(PLANS)) {
    const modules = PLAN_MODULES[slug] || []
    console.log(`  ${slug}: ${modules.includes('insurance' as any) ? '✅ incluye insurance' : '— no incluye'}`)
  }

  console.log('\n=== Planes en BD (subscriptionPlan): ===')
  const count = await prisma.subscriptionPlan.count()
  console.log(`  Total de planes en BD: ${count}`)
  const plans = await prisma.subscriptionPlan.findMany({ select: { slug: true, nombre: true, features: true } })
  for (const p of plans) {
    const mods = (p.features as any)?.modules
    const includes = Array.isArray(mods) && mods.includes('insurance')
    console.log(`  ${p.nombre} (${p.slug}): ${includes ? '✅ incluye insurance' : '— sin insurance (o modules no definido)'}`)
  }

  console.log('\n=== getPlanConfig por slug: ===')
  for (const slug of ['esencial', 'profesional', 'infinity', 'trial']) {
    try {
      const cfg = await getPlanConfig(slug)
      const mods = cfg?.modules || []
      console.log(`  ${slug}: ${mods.includes('insurance' as any) ? '✅ insurance en plan' : '— sin insurance'}`)
    } catch (e: any) {
      console.log(`  ${slug}: ERROR ${e.message}`)
    }
  }

  console.log('\n=== TenantFeatures con insurance: ===')
  const tfs = await prisma.tenantFeature.findMany({ where: { feature: 'insurance' }, select: { tenantId: true, habilitado: true, razon: true } })
  if (tfs.length === 0) console.log('  (ningún override de insurance — depende del plan)')
  for (const tf of tfs) console.log(`  tenant ${tf.tenantId}: ${tf.habilitado ? 'ON' : 'OFF'} — ${tf.razon || ''}`)

  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
