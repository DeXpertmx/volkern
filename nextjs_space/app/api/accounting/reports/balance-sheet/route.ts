import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { getBalanceSheet } from '@/lib/accounting/reports/balance-sheet'

export const dynamic = 'force-dynamic'

export const GET = withTenantAuth(async (_request, auth) => {
  try {
    const report = await getBalanceSheet(auth.tenant!.id)
    return NextResponse.json(report)
  } catch (error: any) {
    console.error('Balance Sheet error:', error)
    return NextResponse.json(
      { error: 'Error al generar Balance de Situación', details: error.message },
      { status: 500 }
    )
  }
}, ['accounting:read'])
