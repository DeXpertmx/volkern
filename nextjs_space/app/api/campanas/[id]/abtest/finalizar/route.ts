export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { finalizarABTest } from '@/lib/campaign-engine'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    await finalizarABTest(params.id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error al finalizar A/B test:', error)
    return NextResponse.json(
      { error: error.message || 'Error al finalizar A/B test' },
      { status: 500 }
    )
  }
}
