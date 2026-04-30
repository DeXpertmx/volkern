import { NextResponse } from 'next/server'
import { emit } from '@/lib/event-engine'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { event, data, sync = true } = body

    if (!event) {
      return NextResponse.json({ error: 'event is required' }, { status: 400 })
    }

    const volkernEvent = {
      event,
      tenant_id: session.user.tenantId,
      data: data || {},
      timestamp: new Date().toISOString(),
      correlation_id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    if (sync) {
      await emit(volkernEvent)
      return NextResponse.json({ success: true, correlation_id: volkernEvent.correlation_id })
    } else {
      emit(volkernEvent).catch(console.error)
      return NextResponse.json({ success: true, correlation_id: volkernEvent.correlation_id, queued: true })
    }
  } catch (error) {
    console.error('[Event API] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const event = searchParams.get('event')

    const alertas = await prisma.systemAlert.findMany({
      where: {
        message: { contains: `Event: ${event || ''}` }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    return NextResponse.json({ alerts: alertas })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}