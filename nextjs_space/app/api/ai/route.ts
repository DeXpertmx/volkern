export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AIEngine, AIModel } from '@/lib/event-engine/ai-engine'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { prompt, model } = body

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }

    const result = await AIEngine.chat({ prompt, model }, session.user.tenantId)

    return NextResponse.json(result)
  } catch (error) {
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
    const model = searchParams.get('model') as AIModel | null

    if (model) {
      AIEngine.setEnabledModels(session.user.tenantId, [model, 'gpt4o'])
    }

    const enabled = AIEngine.getEnabledModels(session.user.tenantId)
    const usage = await AIEngine.getUsage(session.user.tenantId)

    return NextResponse.json({
      enabled,
      usage,
      available: ['gemma', 'gpt4o', 'gpt4', 'claude', 'gemini'] as AIModel[]
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}