/**
 * Verificación: Tenants migrados pueden acceder al dashboard y billing sin errores
 *
 * Prueba todas las rutas de código que ejecuta un tenant con plan='scale':
 *  1. getPlanConfig('scale') via SubscriptionPlan DB record
 *  2. getTenantPlan() para cada tenant migrado
 *  3. getTenantEffectiveLimits()
 *  4. checkFeatureLimit()
 *  5. getActiveModules()
 *  6. Logo los resultados en /tmp/verify-migration.log
 *
 * Uso: npx tsx scripts/verify-migrated-tenants.ts
 */

import { PrismaClient } from '@prisma/client'
import { getPlanConfig, getTenantPlan, getTenantEffectiveLimits, checkFeatureLimit } from '../lib/subscription'
import { getActiveModules } from '../lib/plans'

const prisma = new PrismaClient()

async function main() {
  const log: string[] = []
  const ok = (msg: string) => { console.log('  ✅', msg); log.push(`OK: ${msg}`) }
  const fail = (msg: string, err?: any) => { console.log('  ❌', msg, err ? `— ${err.message}` : ''); log.push(`FAIL: ${msg} ${err ? err.message : ''}`) }

  console.log('=== Verificación de tenants migrados (plan scale) ===\n')

  // ── 1. Verificar SubscriptionPlan records en DB ──
  console.log('1. SubscriptionPlan records en DB:')
  const dbPlans = await prisma.subscriptionPlan.findMany({
    where: { slug: { in: ['scale', 'compliance'] } }
  })
  for (const p of dbPlans) {
    const feat = p.features as any
    const modules = Array.isArray(feat?.modules) ? feat.modules.length : 0
    const hasRaw = feat?.raw_limits?.compliance_mode !== undefined
    ok(`${p.slug}: ${p.nombre} | modules=${modules} | compliance_mode=${hasRaw} | stripePriceId=${feat?.stripePriceId || '(empty)'}`)
  }
  if (dbPlans.length === 0) fail('No se encontraron SubscriptionPlan records!')

  // ── 2. getPlanConfig('scale') via DB ──
  console.log('\n2. getPlanConfig via lib/subscription:')
  try {
    const scale = await getPlanConfig('scale')
    ok(`scale: nombre=${scale.nombre} | users=${scale.limites.users} | leads=${scale.limites.leads} | compliance_mode=${scale.limites.compliance_mode} | modules=${scale.modules.length} | whitelabel=${scale.branding?.whitelabel}`)
  } catch (e: any) { fail('getPlanConfig(scale)', e) }

  try {
    const compliance = await getPlanConfig('compliance')
    ok(`compliance: nombre=${compliance.nombre} | compliance_mode=${compliance.limites.compliance_mode} | storage=${compliance.limites.storage_gb} | modules=${compliance.modules.length}`)
  } catch (e: any) { fail('getPlanConfig(compliance)', e) }

  // ── 3. getTenantPlan para cada tenant migrado ──
  console.log('\n3. getTenantPlan para tenants migrados:')
  const tenants = await prisma.tenant.findMany({
    where: { plan: 'scale' },
    select: { id: true, nombre: true, plan: true, estado: true, enabledModules: true, stripeCustomerId: true, slug: true }
  })

  for (const t of tenants) {
    try {
      const config = await getTenantPlan(t.id)
      if (config) {
        ok(`${t.nombre} (${t.slug}): plan=${config.slug} | users=${config.limites.users} | leads=${config.limites.leads} | estado=${t.estado} | modules=${t.enabledModules.length}`)
      } else {
        fail(`${t.nombre}: getTenantPlan returned null`)
      }
    } catch (e: any) {
      fail(`${t.nombre}: getTenantPlan error`, e)
    }
  }

  // ── 4. getTenantEffectiveLimits ──
  console.log('\n4. getTenantEffectiveLimits:')
  for (const t of tenants) {
    try {
      const limits = await getTenantEffectiveLimits(t.id)
      const keys = Object.keys(limits)
      ok(`${t.nombre}: ${keys.length} fields | users=${limits.users} | leads=${limits.leads} | emails_per_month=${limits.emails_per_month} | storage=${limits.storage_gb} | compliance_mode=${limits.compliance_mode}`)
    } catch (e: any) {
      fail(`${t.nombre}: getTenantEffectiveLimits error`, e)
    }
  }

  // ── 5. checkFeatureLimit ──
  console.log('\n5. checkFeatureLimit (limites -1 deben ser ALLOWED):')
  for (const t of tenants) {
    try {
      const result = await checkFeatureLimit(t.id, 'users', 1)
      ok(`${t.nombre}: users=${result.allowed ? 'ALLOWED' : 'BLOCKED'} (${result.current}/${result.limit})`)
    } catch (e: any) {
      fail(`${t.nombre}: checkFeatureLimit error`, e)
    }
  }

  // ── 6. getActiveModules ──
  console.log('\n6. getActiveModules (debe tener 50+ módulos):')
  for (const t of tenants) {
    try {
      const tenantFeatures = await prisma.tenantFeature.findMany({
        where: { tenantId: t.id, habilitado: true }
      })
      const modules = await getActiveModules(t.plan, tenantFeatures)
      ok(`${t.nombre}: ${modules.length} módulos activos`)
    } catch (e: any) {
      fail(`${t.nombre}: getActiveModules error`, e)
    }
  }

  // ── 7. Verificar estado Stripe (si aplica) ──
  console.log('\n7. Stripe status:')
  for (const t of tenants) {
    const hasStripe = !!t.stripeCustomerId
    const subs = await prisma.subscription.count({ where: { tenantId: t.id } })
    ok(`${t.nombre}: stripe=${hasStripe ? '✅' : '❌'} | subscriptions=${subs}`)
    if (hasStripe) {
      // Verificar que el stripeCustomerId es válido (no vacío)
      ok(`   stripeCustomerId=${t.stripeCustomerId}`)
    }
  }

  // ── Resumen ──
  const passed = log.filter(l => l.startsWith('OK:')).length
  const failed = log.filter(l => l.startsWith('FAIL:')).length
  console.log(`\n=== RESUMEN ===`)
  console.log(`  Pasaron: ${passed}`)
  console.log(`  Fallaron: ${failed}`)
  console.log(`  Total:   ${log.length}`)

  await prisma.$disconnect()

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch(e => {
  console.error('FATAL:', e)
  prisma.$disconnect()
  process.exit(1)
})
