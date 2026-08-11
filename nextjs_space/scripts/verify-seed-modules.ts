/** Verificación SOLO LECTURA (sin tocar BD): el set derivado del seed incluye insurance y coincide con PLAN_MODULES */
import { ALL_MODULES, PLAN_MODULES, PLANS } from '../lib/plans'

const derived = ALL_MODULES.map(m => m.id)
console.log('Derived ALL_FEATURES_SET length:', derived.length)
console.log('Contiene insurance:', derived.includes('insurance'))
console.log('Contiene ads:', derived.includes('ads'))
console.log('Contiene compliance_pro:', derived.includes('compliance_pro'))

// Comparar cada plan sembrado (esencial/profesional/infinity/scale/compliance) con PLAN_MODULES
const checks = [
  { slug: PLANS.ESENCIAL, mods: derived.filter(m => m !== 'compliance_pro') },
  { slug: PLANS.PROFESIONAL, mods: [...derived] },
  { slug: PLANS.INFINITY, mods: [...derived] },
  { slug: PLANS.SCALE, mods: derived.filter(m => m !== 'compliance_pro') },
  { slug: PLANS.COMPLIANCE, mods: [...derived] },
]
let ok = true
for (const c of checks) {
  const planMods = PLAN_MODULES[c.slug]
  const same = JSON.stringify([...c.mods].sort()) === JSON.stringify([...planMods].sort())
  if (!same) {
    ok = false
    const missing = planMods.filter(m => !c.mods.includes(m))
    const extra = c.mods.filter(m => !planMods.includes(m))
    console.log(`❌ ${c.slug}: falta=[${missing.join(',')}] extra=[${extra.join(',')}]`)
  } else {
    console.log(`✅ ${c.slug}: ${c.mods.length} módulos — coincide con PLAN_MODULES y ${c.mods.includes('insurance') ? 'incluye insurance' : 'SIN insurance'}`)
  }
}
console.log('\nResultado:', ok ? 'TODO COINCIDE ✅' : 'HAY DIFERENCIAS ❌')
