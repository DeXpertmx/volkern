import { prisma } from '@/lib/db'
import { EntryManager } from '@/lib/accounting/entry-manager'

async function getAccount(tenantId: string, code: string) {
  const acc = await prisma.accountingAccount.findUnique({
    where: { tenantId_code: { tenantId, code } },
  })
  if (!acc) throw new Error(`Cuenta ${code} no encontrada para tenant ${tenantId}`)
  return acc
}

export async function seedDemoAccountingData(tenantId: string) {
  const entry = async (date: string, desc: string, lines: { code: string; debit: number; credit: number }[]) => {
    const resolved = await Promise.all(
      lines.map(async (l) => ({
        accountId: (await getAccount(tenantId, l.code)).id,
        debit: l.debit,
        credit: l.credit,
      }))
    )
    return (EntryManager.createEntry as any)({
      tenantId,
      date: new Date(date),
      description: desc,
      lines: resolved,
    })
  }

  await entry('2026-01-02', 'Constitución: aporte capital social', [
    { code: '572', debit: 50000, credit: 0 },
    { code: '100', debit: 0, credit: 3000 },
    { code: '112', debit: 0, credit: 1000 },
  ])
  await entry('2026-01-02', 'Préstamo bancario a largo plazo', [
    { code: '572', debit: 30000, credit: 0 },
    { code: '170', debit: 0, credit: 30000 },
  ])
  await entry('2026-01-05', 'Adquisición mobiliario oficina', [
    { code: '216', debit: 8000, credit: 0 },
    { code: '472', debit: 1680, credit: 0 },
    { code: '572', debit: 0, credit: 9680 },
  ])
  await entry('2026-01-05', 'Adquisición equipos informáticos', [
    { code: '217', debit: 12000, credit: 0 },
    { code: '472', debit: 2520, credit: 0 },
    { code: '572', debit: 0, credit: 14520 },
  ])

  await entry('2026-01-15', 'Facturación servicios Enero', [
    { code: '430', debit: 12100, credit: 0 },
    { code: '700', debit: 0, credit: 10000 },
    { code: '477', debit: 0, credit: 2100 },
  ])
  await entry('2026-01-20', 'Cobro facturas Enero', [
    { code: '572', debit: 12100, credit: 0 },
    { code: '430', debit: 0, credit: 12100 },
  ])
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
  await entry('2026-01-31', 'Suministros Enero', [
    { code: '628', debit: 400, credit: 0 },
    { code: '472', debit: 84, credit: 0 },
    { code: '572', debit: 0, credit: 484 },
  ])

  await entry('2026-02-15', 'Facturación servicios Febrero', [
    { code: '430', debit: 14520, credit: 0 },
    { code: '700', debit: 0, credit: 12000 },
    { code: '477', debit: 0, credit: 2520 },
  ])
  await entry('2026-02-20', 'Cobro facturas Febrero', [
    { code: '572', debit: 14520, credit: 0 },
    { code: '430', debit: 0, credit: 14520 },
  ])
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

  await entry('2026-03-15', 'Facturación servicios Marzo', [
    { code: '430', debit: 18150, credit: 0 },
    { code: '700', debit: 0, credit: 15000 },
    { code: '477', debit: 0, credit: 3150 },
  ])
  await entry('2026-03-20', 'Cobro facturas Marzo', [
    { code: '572', debit: 18150, credit: 0 },
    { code: '430', debit: 0, credit: 18150 },
  ])
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
  await entry('2026-03-31', 'Amortización mobiliario Q1', [
    { code: '681', debit: 200, credit: 0 },
    { code: '281', debit: 0, credit: 200 },
  ])
  await entry('2026-03-31', 'Amortización equipos informáticos Q1', [
    { code: '681', debit: 750, credit: 0 },
    { code: '281', debit: 0, credit: 750 },
  ])
  await entry('2026-03-31', 'Pago cuota trimestral préstamo', [
    { code: '170', debit: 1500, credit: 0 },
    { code: '662', debit: 450, credit: 0 },
    { code: '572', debit: 0, credit: 1950 },
  ])
}
