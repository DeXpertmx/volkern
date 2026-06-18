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

/**
 * POST /api/chatbot/analytics/notifications-config
 * Envía una notificación de prueba a los canales configurados
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId || !session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const tenantId = session.user.tenantId
    const userId = session.user.id
    const body = await request.json()
    const config: PatternAlertConfig = { ...DEFAULT_CONFIG, ...body }
    const results: Record<string, any> = {}

    if (config.channels.includes('in_app')) {
      // Crear notificación in-app de prueba
      const notification = await prisma.inAppNotification.create({
        data: {
          tenantId,
          userId,
          title: '🔔 Prueba de alerta — Patrones del Chatbot',
          body: 'Esta es una notificación de prueba. Si ves esto, las alertas in-app funcionan correctamente.\n\nRecibirás este tipo de alertas cuando se detecten patrones críticos en el chatbot.',
          type: 'info',
          data: { source: 'pattern_alert_test' },
          actionUrl: '/dashboard/chatbot/analytics',
        },
      })
      results.in_app = { success: true, id: notification.id }
    }

    if (config.channels.includes('telegram')) {
      try {
        const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
        const { SkillContext } = await import('@/lib/skills/context')
        const ctx = new SkillContext({ tenantId, userId })
        const result = await notifyByTelegram(
          '🔔 *Prueba de Alerta — Chatbot Analytics*\n\n✅ Las alertas de patrones críticos del chatbot funcionan correctamente.\n\nRecibirás este tipo de notificaciones cuando se detecten patrones anómalos en el asistente IA.',
          ctx
        )
        results.telegram = { success: result.success, error: result.error }
      } catch (err) {
        results.telegram = { success: false, error: String(err) }
      }
    }

    if (config.channels.includes('email')) {
      try {
        // Obtener email del usuario actual
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        })
        if (user?.email) {
          const { notifyByEmail } = await import('@/lib/skills/notification-layer')
          const { SkillContext } = await import('@/lib/skills/context')
          const ctx = new SkillContext({ tenantId, userId })
          const result = await notifyByEmail(
            user.email,
            '🔔 Prueba de Alerta — Chatbot Analytics',
            '✅ Las alertas de patrones críticos del chatbot funcionan correctamente.\n\nRecibirás este tipo de notificaciones cuando se detecten patrones anómalos en el asistente IA.',
            ctx
          )
          results.email = { success: result.success, error: result.error }
        } else {
          results.email = { success: false, error: 'Usuario sin email configurado' }
        }
      } catch (err) {
        results.email = { success: false, error: String(err) }
      }
    }

    const allOk = Object.values(results).every((r: any) => r.success !== false)
    return NextResponse.json({
      success: allOk,
      results,
      message: allOk
        ? 'Notificaciones de prueba enviadas correctamente'
        : 'Algunos canales fallaron. Revisa la configuración.',
    })
  } catch (error) {
    console.error('[PatternAlertsConfig] Error sending test:', error)
    return NextResponse.json({ error: 'Error al enviar notificación de prueba' }, { status: 500 })
  }
}
