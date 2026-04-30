import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PackSystem } from '@/lib/event-engine'
import { PACK_TEMPLATES, getPackTemplate, listPackTemplates } from '@/lib/event-engine/pack-templates'

export async function GET() {
  try {
    const templates = listPackTemplates()
    return NextResponse.json({ templates })
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
    const { pack_id, apply_now } = body

    const template = getPackTemplate(pack_id)
    if (!template) {
      return NextResponse.json({ error: 'Pack template not found' }, { status: 404 })
    }

    if (apply_now) {
      await PackSystem.savePack(session.user.tenantId, template)
      return NextResponse.json({ success: true, pack: template })
    }

    return NextResponse.json({ pack: template })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}