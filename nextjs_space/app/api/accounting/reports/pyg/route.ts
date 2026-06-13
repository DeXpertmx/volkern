import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { getPyG } from '@/lib/accounting/reports/pyg'

export const dynamic = 'force-dynamic'

export const GET = withTenantAuth(async (_request, auth) => {
  try {
    const report = await getPyG(auth.tenant!.id)
    return NextResponse.json(report)
  } catch (error: any) {
    console.error('PyG error:', error)
    return NextResponse.json(
      { error: 'Error al generar Cuenta de Resultados', details: error.message },
      { status: 500 }
    )
  }
}, ['accounting:read'])
