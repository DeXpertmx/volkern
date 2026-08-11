/** SOLO LECTURA: verifica que el hub Seguros cubre la vertical contable (misma lógica que components/sidebar.tsx) */
import { PLAN_MODULES, PLANS, getActiveModules } from '../lib/plans'
import { HUBS } from '../lib/navigation-config'

// Misma lógica de filtrado del sidebar para hubs (components/sidebar.tsx)
function hubVisible(hub: any, accountType: string, roleName: string, activeModules: string[], isLoading: boolean): boolean {
  const reqAccountType = hub.requiredAccountType as string | undefined
  if (!reqAccountType) return true
  if (reqAccountType === 'SUPERADMIN') return roleName === 'Superadmin' || roleName === 'Admin'
  if (reqAccountType === 'AGENCY') {
    const isAgencyAccount = accountType === 'AGENCY'
    const hasAgencyModule = activeModules.includes('agency')
    return (isAgencyAccount && hasAgencyModule) || roleName === 'Superadmin'
  }
  if (reqAccountType === 'BUSINESS') {
    const isBusiness = accountType === 'BUSINESS' || accountType === 'AGENCY' || roleName === 'Superadmin' || roleName === 'Admin' || roleName === 'Administrador'
    if (!isBusiness) return false
    if (hub.requiredModule && !isLoading && !activeModules.includes(hub.requiredModule)) return false
    return true
  }
  if (hub.requiredModule && !isLoading && !activeModules.includes(hub.requiredModule)) return false
  return true
}

async function main() {
  const seguros = HUBS.find(h => h.id === 'seguros')!
  console.log('Hub seguros:', JSON.stringify({ id: seguros.id, requiredAccountType: seguros.requiredAccountType, requiredModule: seguros.requiredModule, href: seguros.href }))

  const scenarios = [
    { label: 'Cliente despacho (accounting-slot, BUSINESS)', plan: PLANS.ACCOUNTING_SLOT, accountType: 'BUSINESS', role: 'Admin' },
    { label: 'Despacho padre (pro-accounting, AGENCY)', plan: PLANS.PRO_ACCOUNTING, accountType: 'AGENCY', role: 'Admin' },
    { label: 'DeXpert (premium → esencial fallback, BUSINESS)', plan: 'premium', accountType: 'BUSINESS', role: 'Admin' },
  ]

  for (const s of scenarios) {
    const planModules = PLAN_MODULES[s.plan] || []
    const active = await getActiveModules(s.plan, [])
    const hasInsurance = active.includes('insurance')
    const visible = hubVisible(seguros, s.accountType, s.role, active, false)
    console.log(`\n${s.label}`)
    console.log(`  plan=${s.plan} | módulos en PLAN_MODULES=${planModules.length} | activeModules=${active.length}`)
    console.log(`  insurance en activeModules: ${hasInsurance ? '✅' : '❌'}`)
    console.log(`  hub Seguros visible: ${visible ? '✅ SÍ' : '❌ NO'}`)
  }
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
