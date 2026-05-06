export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PackMarketplace } from '@/lib/event-engine'

export async function GET() {
  try {
    const packs = await PackMarketplace.listPublicPacks()
    return NextResponse.json({ packs })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, pack_id, source_tenant_id } = body

    if (action === 'publish') {
      await PackMarketplace.publishPack(session.user.tenantId, pack_id)
      return NextResponse.json({ success: true })
    }

    if (action === 'download' && source_tenant_id) {
      await PackMarketplace.downloadPack(session.user.tenantId, source_tenant_id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}