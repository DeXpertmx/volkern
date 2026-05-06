export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PackSystem, listPackTemplates, getPackTemplate } from '@/lib/event-engine'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentPack = await PackSystem.loadPack(session.user.tenantId)
    const templates = listPackTemplates()

    return NextResponse.json({
      current: currentPack,
      templates,
      selected: currentPack?.pack || 'basic'
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { pack_id, custom_pack } = body

    let pack
    if (custom_pack) {
      pack = custom_pack
    } else {
      const template = getPackTemplate(pack_id)
      if (!template) {
        return NextResponse.json({ error: 'Pack not found' }, { status: 404 })
      }
      pack = template
    }

    await PackSystem.savePack(session.user.tenantId, pack)

    return NextResponse.json({ success: true, pack })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}