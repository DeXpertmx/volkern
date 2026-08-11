/** Verificación SOLO LECTURA: accounting-slot y pro-accounting ahora incluyen insurance */
import { PLAN_MODULES, PLANS } from '../lib/plans'

const slots = ['accounting-slot', 'pro-accounting']
let ok = true
for (const slug of slots) {
  const mods = PLAN_MODULES[slug]
  const has = mods?.includes('insurance')
  console.log(`${has ? '✅' : '❌'} ${slug}: ${mods?.length} módulos — ${has ? 'incluye insurance' : 'SIN insurance'}`)
  if (!has) ok = false
}
console.log('\nResultado:', ok ? 'TODO OK ✅' : 'FALTA ALGO ❌')
