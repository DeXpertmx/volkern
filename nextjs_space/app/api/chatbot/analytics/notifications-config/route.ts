import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export interface PatternAlertConfig {
  enabled: boolean
  /** Severity levels that trigger notifications */
  severities: ('critical' | 'high' | 'medium' | 'low')[]
  /** Notification channels to use */
  channels: ('in_app' | 'telegram' | 'email')[]
  /** Only notify for specific pattern types (empty = all) */
  patternTypes: string[]
  /** Cooldown in minutes before re-notifying about the same pattern type */
  cooldownMinutes: number
}

const DEFAULT_CONFIG: PatternAlertConfig = {
  enabled: false,
  severities: ['critical', 'high'],
  channels: ['in_app'],
  patternTypes: [],
  cooldownMinutes: 60,
}

const CONFIG_KEY = 'chatbot_pattern_alerts_config'

async function getTenantId(): Promise<string> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.tenantId) throw new Error('No autorizado')
  return session.user.tenantId
}

export async function GET() {
  try {
    const tenantId = await getTenantId()
    const record = await prisma.configuracion.findUnique({
      where: { tenantId_clave: { tenantId, clave: CONFIG_KEY } },
    })
    const config: PatternAlertConfig = record
      ? { ...DEFAULT_CONFIG, ...JSON.parse(record.valor) }
      : DEFAULT_CONFIG
    return NextResponse.json(config)
  } catch (error) {
    console.error('[PatternAlertsConfig] Error loading:', error)
    return NextResponse.json(DEFAULT_CONFIG)
  }
}

export async function PUT(request: Request) {
  try {
    const tenantId = await getTenantId()
    const body = await request.json()
    const config: PatternAlertConfig = { ...DEFAULT_CONFIG, ...body }
    const valor = JSON.stringify(config)
    await prisma.configuracion.upsert({
      where: { tenantId_clave: { tenantId, clave: CONFIG_KEY } },
      create: { tenantId, clave: CONFIG_KEY, valor },
      update: { valor },
    })
    return NextResponse.json({ success: true, config })
  } catch (error) {
    console.error('[PatternAlertsConfig] Error saving:', error)
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 })
  }
}
