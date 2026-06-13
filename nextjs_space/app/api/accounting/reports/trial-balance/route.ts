import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { getTrialBalance } from '@/lib/accounting/reports/trial-balance'

export const dynamic = 'force-dynamic'

export const GET = withTenantAuth(async (_request, auth) => {
  try {
    const report = await getTrialBalance(auth.tenant!.id)
    return NextResponse.json(report)
  } catch (error: any) {
    console.error('Trial Balance error:', error)
    return NextResponse.json(
      { error: 'Error al generar Balance de Comprobación', details: error.message },
      { status: 500 }
    )
  }
}, ['accounting:read'])
