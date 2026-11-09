export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getABTestResults } from '@/lib/campaign-engine'

export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const results = await getABTestResults(params.id)

    return NextResponse.json(results)
  } catch (error: any) {
    console.error('Error al obtener resultados de A/B test:', error)
    return NextResponse.json(
      { error: error.message || 'Error al obtener resultados de A/B test' },
      { status: 500 }
    )
  }
}
