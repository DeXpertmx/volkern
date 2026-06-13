import { prisma } from '../lib/db'
import { AccountingInitializer } from '../lib/accounting/initializer'
import { EntryManager } from '../lib/accounting/entry-manager'

async function getAccount(tenantId: string, code: string) {
  const acc = await prisma.accountingAccount.findUnique({
    where: { tenantId_code: { tenantId, code } },
  })
  if (!acc) throw new Error(`Cuenta ${code} no encontrada`)
  return acc
}

async function main() {
  console.log('=== Sembrando Demo Contable ===')

  const suffix = Date.now().toString().slice(-4)
  const tenant = await prisma.tenant.create({
    data: {
      nombre: `Demo Contable ${suffix}`,
      slug: `demo-contable-${suffix}`,
      plan: 'profesional',
      estado: 'activo',
    },
  })
  const tenantId = tenant.id
  console.log(`Tenant creado: ${tenant.nombre} (${tenantId})`)

  await AccountingInitializer.initializeTenant(tenantId, 'PYMES', 'NINGUNO')
  console.log('PGC Pymes inicializado')

  // Helper to get an entry
  const entry = async (date: string, desc: string, lines: { code: string; debit: number; credit: number }[]) => {
    const resolved = await Promise.all(
      lines.map(async (l) => ({
        accountId: (await getAccount(tenantId, l.code)).id,
        debit: l.debit,
        credit: l.credit,
      }))
    )
    return EntryManager.createEntry({
      tenantId,
      date: new Date(date),
      description: desc,
      lines: resolved,
    })
  }

  // === Asiento 1: Constitución — Aporte de capital + préstamo ===
  console.log('1/10 Constitución...')
  await entry('2026-01-02', 'Constitución de la sociedad: aporte capital social', [
    { code: '572', debit: 50000, credit: 0 },
    { code: '100', debit: 0, credit: 3000 },
    { code: '112', debit: 0, credit: 1000 },
  ])
  await entry('2026-01-02', 'Préstamo bancario a largo plazo', [
    { code: '572', debit: 30000, credit: 0 },
    { code: '170', debit: 0, credit: 30000 },
  ])

  // === Asiento 2: Compra de inmovilizado ===
  console.log('2/10 Compra inmovilizado...')
  await entry('2026-01-05', 'Adquisición de mobiliario de oficina', [
    { code: '216', debit: 8000, credit: 0 },
    { code: '472', debit: 1680, credit: 0 },
    { code: '572', debit: 0, credit: 9680 },
  ])
  await entry('2026-01-05', 'Adquisición de equipos informáticos', [
    { code: '217', debit: 12000, credit: 0 },
    { code: '472', debit: 2520, credit: 0 },
    { code: '572', debit: 0, credit: 14520 },
  ])

  // === Asiento 3: Enero — Ventas y facturación ===
  console.log('3/10 Ventas Enero...')
  await entry('2026-01-15', 'Facturación servicios profesionales Enero', [
    { code: '430', debit: 12100, credit: 0 },
    { code: '700', debit: 0, credit: 10000 },
    { code: '477', debit: 0, credit: 2100 },
  ])
  await entry('2026-01-20', 'Cobro facturas Enero', [
    { code: '572', debit: 12100, credit: 0 },
    { code: '430', debit: 0, credit: 12100 },
  ])

  // === Asiento 4: Enero — Gastos operativos ===
  console.log('4/10 Gastos Enero...')
  await entry('2026-01-31', 'Nómina empleados Enero', [
    { code: '640', debit: 4500, credit: 0 },
    { code: '642', debit: 1485, credit: 0 },
    { code: '4751', debit: 0, credit: 450 },
    { code: '476', debit: 0, credit: 1485 },
    { code: '465', debit: 0, credit: 4050 },
  ])
  await entry('2026-01-31', 'Pago nómina Enero', [
    { code: '465', debit: 4050, credit: 0 },
    { code: '572', debit: 0, credit: 4050 },
  ])
  await entry('2026-01-31', 'Alquiler oficina Enero', [
    { code: '621', debit: 1500, credit: 0 },
    { code: '472', debit: 315, credit: 0 },
    { code: '572', debit: 0, credit: 1815 },
  ])
  await entry('2026-01-31', 'Suministros (luz, internet) Enero', [
    { code: '628', debit: 400, credit: 0 },
    { code: '472', debit: 84, credit: 0 },
    { code: '572', debit: 0, credit: 484 },
  ])

  // === Asiento 5: Febrero — Más ventas ===
  console.log('5/10 Ventas Febrero...')
  await entry('2026-02-15', 'Facturación servicios profesionales Febrero', [
    { code: '430', debit: 14520, credit: 0 },
    { code: '700', debit: 0, credit: 12000 },
    { code: '477', debit: 0, credit: 2520 },
  ])
  await entry('2026-02-20', 'Cobro facturas Febrero', [
    { code: '572', debit: 14520, credit: 0 },
    { code: '430', debit: 0, credit: 14520 },
  ])

  // === Asiento 6: Febrero — Gastos ===
  console.log('6/10 Gastos Febrero...')
  await entry('2026-02-28', 'Nómina empleados Febrero', [
    { code: '640', debit: 4500, credit: 0 },
    { code: '642', debit: 1485, credit: 0 },
    { code: '4751', debit: 0, credit: 450 },
    { code: '476', debit: 0, credit: 1485 },
    { code: '465', debit: 0, credit: 4050 },
  ])
  await entry('2026-02-28', 'Pago nómina Febrero', [
    { code: '465', debit: 4050, credit: 0 },
    { code: '572', debit: 0, credit: 4050 },
  ])
  await entry('2026-02-28', 'Alquiler oficina Febrero', [
    { code: '621', debit: 1500, credit: 0 },
    { code: '472', debit: 315, credit: 0 },
    { code: '572', debit: 0, credit: 1815 },
  ])
  await entry('2026-02-28', 'Servicios profesionales (asesoría)', [
    { code: '623', debit: 600, credit: 0 },
    { code: '472', debit: 126, credit: 0 },
    { code: '572', debit: 0, credit: 726 },
  ])

  // === Asiento 7: Marzo — Ventas ===
  console.log('7/10 Ventas Marzo...')
  await entry('2026-03-15', 'Facturación servicios profesionales Marzo', [
    { code: '430', debit: 18150, credit: 0 },
    { code: '700', debit: 0, credit: 15000 },
    { code: '477', debit: 0, credit: 3150 },
  ])
  await entry('2026-03-20', 'Cobro facturas Marzo', [
    { code: '572', debit: 18150, credit: 0 },
    { code: '430', debit: 0, credit: 18150 },
  ])

  // === Asiento 8: Marzo — Gastos ===
  console.log('8/10 Gastos Marzo...')
  await entry('2026-03-31', 'Nómina empleados Marzo', [
    { code: '640', debit: 4500, credit: 0 },
    { code: '642', debit: 1485, credit: 0 },
    { code: '4751', debit: 0, credit: 450 },
    { code: '476', debit: 0, credit: 1485 },
    { code: '465', debit: 0, credit: 4050 },
  ])
  await entry('2026-03-31', 'Pago nómina Marzo', [
    { code: '465', debit: 4050, credit: 0 },
    { code: '572', debit: 0, credit: 4050 },
  ])
  await entry('2026-03-31', 'Alquiler oficina Marzo', [
    { code: '621', debit: 1500, credit: 0 },
    { code: '472', debit: 315, credit: 0 },
    { code: '572', debit: 0, credit: 1815 },
  ])
  await entry('2026-03-31', 'Gastos publicidad y marketing', [
    { code: '627', debit: 1200, credit: 0 },
    { code: '472', debit: 252, credit: 0 },
    { code: '572', debit: 0, credit: 1452 },
  ])

  // === Asiento 9: Amortización trimestral ===
  console.log('9/10 Amortización trimestral...')
  await entry('2026-03-31', 'Amortización mobiliario Q1 (10% anual lineal)', [
    { code: '681', debit: 200, credit: 0 },
    { code: '281', debit: 0, credit: 200 },
  ])
  await entry('2026-03-31', 'Amortización equipos informáticos Q1 (25% anual lineal)', [
    { code: '681', debit: 750, credit: 0 },
    { code: '281', debit: 0, credit: 750 },
  ])

  // === Asiento 10: Pago cuota préstamo ===
  console.log('10/10 Pago préstamo...')
  await entry('2026-03-31', 'Pago cuota trimestral préstamo (capital + intereses)', [
    { code: '170', debit: 1500, credit: 0 },
    { code: '662', debit: 450, credit: 0 },
    { code: '572', debit: 0, credit: 1950 },
  ])

  console.log('')
  console.log('=== Demo Contable completada ===')
  console.log(`Tenant ID: ${tenantId}`)
  console.log(`Para acceder, usa el Login-as desde el panel de gestoría`)
  console.log('')
  console.log('Resumen de cuentas:')
  const accounts = await prisma.accountingAccount.findMany({
    where: { tenantId, balance: { not: 0 } },
    orderBy: [{ group: 'asc' }, { code: 'asc' }],
  })
  for (const acc of accounts) {
    console.log(`  ${acc.code} ${acc.name.padEnd(40)} ${acc.type.padEnd(8)} ${Number(acc.balance).toFixed(2)} €`)
  }

  const totalActivo = accounts.filter(a => a.type === 'ACTIVO').reduce((s, a) => s + Number(a.balance), 0)
  const totalPasivo = accounts.filter(a => a.type === 'PASIVO').reduce((s, a) => s + Number(a.balance), 0)
  const totalGastos = accounts.filter(a => a.type === 'GASTO').reduce((s, a) => s + Number(a.balance), 0)
  const totalIngresos = accounts.filter(a => a.type === 'INGRESO').reduce((s, a) => s + Number(a.balance), 0)

  console.log('')
  console.log(`Balance: Activo=${totalActivo.toFixed(2)} € / Pasivo+PN=${totalPasivo.toFixed(2)} € / PyG: Gastos=${totalGastos.toFixed(2)} € / Ingresos=${totalIngresos.toFixed(2)} €`)
  console.log(`Resultado del ejercicio: ${(totalIngresos - totalGastos).toFixed(2)} €`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
