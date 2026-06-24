import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { AccountingInitializer } from '@/lib/accounting/initializer'
import { seedDemoAccountingData } from '@/lib/accounting/seed-demo-data'

export const dynamic = 'force-dynamic'

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const isSuperadmin = auth.user?.role?.nombre === 'Superadmin'
    if (auth.user?.accountType !== 'AGENCY' && !isSuperadmin) {
      return NextResponse.json({ error: 'Solo disponible para cuentas de Asesoría' }, { status: 403 })
    }

    const slotId = (req as any).nextUrl.pathname.split('/').at(-2)
    if (!slotId) {
      return NextResponse.json({ error: 'ID de slot no proporcionado' }, { status: 400 })
    }

    const slot = await prisma.tenant.findFirst({
      where: { id: slotId, parentId: auth.tenant!.id },
    })

    if (!slot) {
      return NextResponse.json({ error: 'Slot no encontrado o no pertenece a tu despacho' }, { status: 404 })
    }

    await seedDemoAccountingData(slotId)

    const accounts = await prisma.accountingAccount.findMany({
      where: { tenantId: slotId, balance: { not: 0 } },
      orderBy: [{ group: 'asc' }, { code: 'asc' }] as any,
    })

    return NextResponse.json({
      message: 'Datos demo cargados correctamente',
      entries: accounts.filter(a => a.type === 'GASTO' || a.type === 'INGRESO').length,
      accounts: accounts.length,
    })
  } catch (error: any) {
    console.error('Error seeding demo:', error)
    return NextResponse.json({ error: 'Error al sembrar datos demo', details: error.message }, { status: 500 })
  }
}, ['accounting:write'])
