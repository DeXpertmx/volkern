/**
 * PatternDetector - Detección de patrones de error y anomalías
 *
 * Analiza logs de auditoría y análisis de conversaciones para detectar:
 * - Intents con alta tasa de 'unknown' (confusión de intenciones)
 * - Skills con alta tasa de fallo
 * - Horas pico de fallbacks
 * - Patrones de frustración del cliente
 * - Transferencias a humano frecuentes
 * - Consultas recurrentes sin cobertura en KB
 *
 * Se ejecuta bajo demanda o programado (cron).
 */

import { prisma } from '@/lib/db'

export interface DetectedPattern {
  /** Tipo de patrón detectado */
  type: PatternType
  /** Severidad del patrón */
  severity: 'low' | 'medium' | 'high' | 'critical'
  /** Descripción del patrón */
  description: string
  /** Valor observado */
  value: number
  /** Umbral que se superó */
  threshold: number
  /** Contexto adicional (intent, skill, hora, etc.) */
  context: Record<string, any>
  /** Recomendación para resolver */
  recommendation: string
  /** Timestamp de detección */
  detectedAt: Date
}

export type PatternType =
  | 'high_unknown_rate'         // Muchos intents clasificados como unknown
  | 'high_fallback_rate'        // Muchos fallbacks activados
  | 'skill_failure'             // Skill con alta tasa de error
  | 'sentiment_drop'            // Caída de sentimiento general
  | 'frequent_human_transfer'   // Muchas transferencias a humano
  | 'low_resolution_rate'       // Baja tasa de resolución
  | 'peak_error_hour'           // Hora pico de errores
  | 'repeated_unanswered'       // Pregunta recurrente sin respuesta en KB
  | 'intent_confusion'          // Dos intents frecuentemente confundidos
  | 'entity_extraction_failure' // Fallo recurrente en extracción de entidades
  | 'rate_limit_spike'          // Pico de rate limiting

const DEFAULTS = {
  ANALYSIS_HOURS: 48,
  MIN_SAMPLES: 5,
  UNKNOWN_RATE_THRESHOLD: 0.30,      // 30%+ de intents unknown
  FALLBACK_RATE_THRESHOLD: 0.20,     // 20%+ de mensajes con fallback
  SKILL_FAILURE_THRESHOLD: 0.25,     // 25%+ de errores en un skill
  SENTIMENT_DROP_THRESHOLD: 30,      // Score de sentimiento < 30
  HUMAN_TRANSFER_THRESHOLD: 0.15,    // 15%+ de conversaciones transferidas
  RESOLUTION_RATE_THRESHOLD: 0.40,   // < 40% de conversaciones resueltas
  ERROR_SPIKE_MULTIPLIER: 3,         // 3x la media histórica
}

/**
 * Detecta patrones en los logs de un tenant
 */
export async function detectPatterns(
  tenantId: string,
  options?: {
    hours?: number
    minSamples?: number
  }
): Promise<DetectedPattern[]> {
  const hours = options?.hours || DEFAULTS.ANALYSIS_HOURS
  const minSamples = options?.minSamples || DEFAULTS.MIN_SAMPLES
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)

  const patterns: DetectedPattern[] = []

  try {
    // Obtener logs del período
    const [auditLogs, analyses] = await Promise.all([
      getAuditLogs(tenantId, since),
      getConversationAnalyses(tenantId, since),
    ])

    if (auditLogs.length < minSamples) {
      console.log(`[PatternDetector] Pocos datos (${auditLogs.length} logs, mínimo ${minSamples}) — saltando detección`)
      return []
    }

    // ═══ 1. Alta tasa de 'unknown' ═══
    const unknownIntent = await detectHighUnknownRate(auditLogs, minSamples)
    if (unknownIntent) patterns.push(unknownIntent)

    // ═══ 2. Alta tasa de fallback ═══
    const highFallback = await detectHighFallbackRate(auditLogs, minSamples)
    if (highFallback) patterns.push(highFallback)

    // ═══ 3. Skills con alta tasa de error ═══
    const skillFailures = await detectSkillFailures(auditLogs, minSamples)
    patterns.push(...skillFailures)

    // ═══ 4. Bajo sentimiento / frustración ═══
    const sentimentIssue = await detectSentimentDrop(analyses, minSamples)
    if (sentimentIssue) patterns.push(sentimentIssue)

    // ═══ 5. Transferencias a humano frecuentes ═══
    const transferPattern = await detectFrequentTransfers(analyses, minSamples)
    if (transferPattern) patterns.push(transferPattern)

    // ═══ 6. Baja tasa de resolución ═══
    const resolutionIssue = await detectLowResolution(analyses, minSamples)
    if (resolutionIssue) patterns.push(resolutionIssue)

    // ═══ 7. Hora pico de errores ═══
    const peakHour = await detectPeakErrorHour(auditLogs)
    if (peakHour) patterns.push(peakHour)

    // ═══ 8. Preguntas recurrentes sin respuesta ═══
    const unansweredTopics = await detectRepeatedUnanswered(analyses)
    patterns.push(...unansweredTopics)

    // Loggear los patrones detectados
    if (patterns.length > 0) {
      await saveDetectedPatterns(tenantId, patterns)
      console.log(`[PatternDetector] ✅ ${patterns.length} patrones detectados para tenant ${tenantId}`)

      // Enviar notificaciones si hay patrones críticos/altos configurados
      await sendPatternAlerts(tenantId, patterns).catch(err =>
        console.error('[PatternDetector] Error enviando alertas:', err)
      )
    } else {
      console.log(`[PatternDetector] ✅ Sin patrones anómalos para tenant ${tenantId}`)
    }

    return patterns
  } catch (error) {
    console.error('[PatternDetector] Error:', error)
    return patterns
  }
}

// ==================== DETECTORES ESPECÍFICOS ====================

async function detectHighUnknownRate(
  logs: any[],
  minSamples: number
): Promise<DetectedPattern | null> {
  const totalWithIntent = logs.filter(l => l.intent).length
  const unknownCount = logs.filter(l => l.intent === 'unknown').length

  if (totalWithIntent < minSamples) return null

  const rate = unknownCount / totalWithIntent
  if (rate < DEFAULTS.UNKNOWN_RATE_THRESHOLD) return null

  return {
    type: 'high_unknown_rate',
    severity: rate >= 0.5 ? 'critical' : 'high',
    description: `${Math.round(rate * 100)}% de los mensajes clasificados como 'unknown' (${unknownCount} de ${totalWithIntent})`,
    value: Math.round(rate * 100),
    threshold: DEFAULTS.UNKNOWN_RATE_THRESHOLD * 100,
    context: { totalMessages: totalWithIntent, unknownCount },
    recommendation: 'Revisar el IntentClassifierAgent. Considerar agregar ejemplos de entrenamiento para las consultas más frecuentes. Revisar el reranker de KB para mejorar respuestas.',
    detectedAt: new Date(),
  }
}

async function detectHighFallbackRate(
  logs: any[],
  minSamples: number
): Promise<DetectedPattern | null> {
  const errorLogs = logs.filter(l => l.status === 'ERROR' || l.status === 'BLOCKED_RATE_LIMIT')
  if (logs.length < minSamples) return null

  const rate = errorLogs.length / logs.length
  if (rate < DEFAULTS.FALLBACK_RATE_THRESHOLD) return null

  return {
    type: 'high_fallback_rate',
    severity: rate >= 0.4 ? 'critical' : 'high',
    description: `${Math.round(rate * 100)}% de operaciones con error (${errorLogs.length} de ${logs.length})`,
    value: Math.round(rate * 100),
    threshold: DEFAULTS.FALLBACK_RATE_THRESHOLD * 100,
    context: { totalOperations: logs.length, errorCount: errorLogs.length },
    recommendation: 'Revisar el ExecutionEngine y la conectividad con APIs externas. Verificar rate limiting y timeouts.',
    detectedAt: new Date(),
  }
}

async function detectSkillFailures(
  logs: any[],
  minSamples: number
): Promise<DetectedPattern[]> {
  const patterns: DetectedPattern[] = []

  // Agrupar por skill
  const bySkill: Record<string, { total: number; errors: number }> = {}
  for (const log of logs) {
    if (!log.skillExecuted) continue
    if (!bySkill[log.skillExecuted]) bySkill[log.skillExecuted] = { total: 0, errors: 0 }
    bySkill[log.skillExecuted].total++
    if (log.status === 'ERROR') bySkill[log.skillExecuted].errors++
  }

  for (const [skill, stats] of Object.entries(bySkill)) {
    if (stats.total < minSamples) continue
    const errorRate = stats.errors / stats.total
    if (errorRate < DEFAULTS.SKILL_FAILURE_THRESHOLD) continue

    patterns.push({
      type: 'skill_failure',
      severity: errorRate >= 0.5 ? 'critical' : 'high',
      description: `Skill '${skill}' tiene ${Math.round(errorRate * 100)}% de errores (${stats.errors} de ${stats.total} ejecuciones)`,
      value: Math.round(errorRate * 100),
      threshold: DEFAULTS.SKILL_FAILURE_THRESHOLD * 100,
      context: { skill, totalExecutions: stats.total, errorCount: stats.errors },
      recommendation: `Revisar el skill '${skill}'. Verificar lógica, dependencias y manejo de errores. Considerar agregar validación de entrada.`,
      detectedAt: new Date(),
    })
  }

  return patterns
}

async function detectSentimentDrop(
  analyses: any[],
  minSamples: number
): Promise<DetectedPattern | null> {
  if (analyses.length < minSamples) return null

  const negativeAnalyses = analyses.filter(
    (a: any) => a.sentiment === 'negative' || a.sentiment === 'frustrated'
  )

  if (negativeAnalyses.length < 2) return null

  const avgSentiment = analyses.reduce((sum: number, a: any) => sum + (a.sentimentScore || 50), 0) / analyses.length
  if (avgSentiment >= DEFAULTS.SENTIMENT_DROP_THRESHOLD) return null

  return {
    type: 'sentiment_drop',
    severity: avgSentiment < 20 ? 'critical' : 'high',
    description: `Sentimiento promedio bajo: ${Math.round(avgSentiment)}/100. ${negativeAnalyses.length} de ${analyses.length} conversaciones con sentimiento negativo`,
    value: Math.round(avgSentiment),
    threshold: DEFAULTS.SENTIMENT_DROP_THRESHOLD,
    context: { averageSentiment: Math.round(avgSentiment), negativeCount: negativeAnalyses.length, totalAnalyses: analyses.length },
    recommendation: 'Revisar las conversaciones con sentimiento negativo. Identificar puntos de fricción comunes. Considerar ajustar el tono del asistente o mejorar respuestas para los temas que generan frustración.',
    detectedAt: new Date(),
  }
}

async function detectFrequentTransfers(
  analyses: any[],
  minSamples: number
): Promise<DetectedPattern | null> {
  if (analyses.length < minSamples) return null

  const transfers = analyses.filter((a: any) => a.requiredHumanTransfer)
  const rate = transfers.length / analyses.length
  if (rate < DEFAULTS.HUMAN_TRANSFER_THRESHOLD) return null

  return {
    type: 'frequent_human_transfer',
    severity: rate >= 0.3 ? 'high' : 'medium',
    description: `${Math.round(rate * 100)}% de conversaciones requirieron transferencia humana (${transfers.length} de ${analyses.length})`,
    value: Math.round(rate * 100),
    threshold: DEFAULTS.HUMAN_TRANSFER_THRESHOLD * 100,
    context: { totalConversations: analyses.length, transferCount: transfers.length },
    recommendation: 'Revisar los skills que preceden a las transferencias. Identificar consultas que el chatbot no puede manejar y agregar KB articles o skills nuevos.',
    detectedAt: new Date(),
  }
}

async function detectLowResolution(
  analyses: any[],
  minSamples: number
): Promise<DetectedPattern | null> {
  if (analyses.length < minSamples) return null

  const resolved = analyses.filter((a: any) => a.resolved)
  const rate = resolved.length / analyses.length
  if (rate >= DEFAULTS.RESOLUTION_RATE_THRESHOLD) return null

  return {
    type: 'low_resolution_rate',
    severity: rate < 0.2 ? 'critical' : 'high',
    description: `Solo ${Math.round(rate * 100)}% de conversaciones resueltas (${resolved.length} de ${analyses.length})`,
    value: Math.round(rate * 100),
    threshold: DEFAULTS.RESOLUTION_RATE_THRESHOLD * 100,
    context: { totalConversations: analyses.length, resolvedCount: resolved.length },
    recommendation: 'Analizar las conversaciones no resueltas. Considerar mejorar la capacidad del chatbot para cerrar conversaciones con confirmación explícita.',
    detectedAt: new Date(),
  }
}

async function detectPeakErrorHour(
  logs: any[]
): Promise<DetectedPattern | null> {
  const errors = logs.filter(l => l.status === 'ERROR')
  if (errors.length < 5) return null

  const byHour: Record<number, number> = {}
  for (const err of errors) {
    const hour = new Date(err.createdAt).getHours()
    byHour[hour] = (byHour[hour] || 0) + 1
  }

  const avgPerHour = errors.length / 24
  let peakHour = -1
  let peakCount = 0

  for (const [hour, count] of Object.entries(byHour)) {
    if (count > peakCount && count > avgPerHour * DEFAULTS.ERROR_SPIKE_MULTIPLIER) {
      peakHour = parseInt(hour)
      peakCount = count
    }
  }

  if (peakHour === -1) return null

  return {
    type: 'peak_error_hour',
    severity: peakCount > avgPerHour * 5 ? 'high' : 'medium',
    description: `Pico de errores a las ${peakHour}:00h (${peakCount} errores, promedio: ${Math.round(avgPerHour)}/h)`,
    value: peakCount,
    threshold: Math.round(avgPerHour * DEFAULTS.ERROR_SPIKE_MULTIPLIER),
    context: { peakHour, errorCount: peakCount, hourlyAverage: Math.round(avgPerHour), totalErrors: errors.length },
    recommendation: peakHour >= 22 || peakHour <= 6
      ? 'Los errores ocurren mayormente fuera de horario laboral. Verificar procesos nocturnos (backups, mantenimiento) que puedan afectar la disponibilidad.'
      : `Investigar la causa del pico de errores a las ${peakHour}:00h. Revisar logs del sistema para ese horario.`,
    detectedAt: new Date(),
  }
}

async function detectRepeatedUnanswered(
  analyses: any[]
): Promise<DetectedPattern[]> {
  const patterns: DetectedPattern[] = []

  // Extraer recomendaciones recurrentes de los análisis
  const recommendations: string[] = []
  for (const a of analyses) {
    if ((a as any).recommendations) {
      recommendations.push(...(a as any).recommendations)
    }
  }

  // Contar frecuencias de temas en recomendaciones
  const topicCounts: Record<string, number> = {}
  for (const rec of recommendations) {
    // Extraer tema principal de la recomendación
    const match = rec.match(/sobre\s+["']?([^"']+)["']?|KB\s+(?:para|de|sobre)\s+(\w+)/i)
    const topic = match?.[1] || match?.[2] || rec.substring(0, 40)
    topicCounts[topic] = (topicCounts[topic] || 0) + 1
  }

  for (const [topic, count] of Object.entries(topicCounts)) {
    if (count >= 3) {
      patterns.push({
        type: 'repeated_unanswered',
        severity: count >= 5 ? 'high' : 'medium',
        description: `"${topic.substring(0, 60)}" apareció ${count} veces como tema sin resolver`,
        value: count,
        threshold: 3,
        context: { topic: topic.substring(0, 100), occurrenceCount: count },
        recommendation: `Crear un KB article sobre "${topic}" para resolver esta consulta recurrentemente.`,
        detectedAt: new Date(),
      })
    }
  }

  return patterns
}

// ==================== HELPERS ====================

async function getAuditLogs(tenantId: string, since: Date): Promise<any[]> {
  return prisma.chatbotAuditLog.findMany({
    where: {
      tenantId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })
}

async function getConversationAnalyses(tenantId: string, since: Date): Promise<any[]> {
  const records = await prisma.chatbotAuditLog.findMany({
    where: {
      tenantId,
      intent: 'conversation_analysis',
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  // Aplanar metadata para que los detectores accedan directamente a sentiment, resolved, etc.
  return records.map(record => ({
    ...record,
    ...((record.skillParams as Record<string, unknown>) || {}),
  }))
}

async function saveDetectedPatterns(tenantId: string, patterns: DetectedPattern[]): Promise<void> {
  try {
    // Guardar cada patrón como un log de auditoría
    for (const pattern of patterns) {
      await prisma.chatbotAuditLog.create({
        data: {
          tenantId,
          intent: 'detected_pattern',
          // `status` es obligatorio en el modelo: sin él el create fallaba en
          // validación y el catch lo dejaba en un console.error, así que los
          // patrones detectados no se guardaban nunca.
          status: 'SUCCESS',
          skillParams: {
            type: pattern.type,
            severity: pattern.severity,
            description: pattern.description,
            value: pattern.value,
            threshold: pattern.threshold,
            context: pattern.context,
            recommendation: pattern.recommendation,
          },
        },
      })
    }
  } catch (error) {
    console.error('[PatternDetector] Error guardando patrones:', error)
  }
}

// ==================== ALERTAS ====================

interface PatternAlertConfig {
  enabled: boolean
  severities: string[]
  channels: string[]
  patternTypes: string[]
  cooldownMinutes: number
}

const CONFIG_KEY = 'chatbot_pattern_alerts_config'

/**
 * Envía notificaciones cuando se detectan patrones según la configuración del tenant.
 * Soporta notificaciones in-app y Telegram.
 */
async function sendPatternAlerts(tenantId: string, patterns: DetectedPattern[]): Promise<void> {
  try {
    // Cargar configuración de alertas
    const record = await prisma.configuracion.findUnique({
      where: { tenantId_clave: { tenantId, clave: CONFIG_KEY } },
    })
    if (!record) return // Sin configuración, no enviar

    const config: PatternAlertConfig = JSON.parse(record.valor)
    if (!config.enabled) return

    // Filtrar patrones por severidad configurada
    const notifiablePatterns = patterns.filter(p =>
      config.severities.includes(p.severity) &&
      (config.patternTypes.length === 0 || config.patternTypes.includes(p.type))
    )
    if (notifiablePatterns.length === 0) return

    // Verificar cooldown cross-channel (basado en chatbotAuditLog)
    const cooldownSince = new Date(Date.now() - config.cooldownMinutes * 60 * 1000)
    const recentAlert = await prisma.chatbotAuditLog.findFirst({
      where: {
        tenantId,
        intent: 'pattern_alert_sent',
        createdAt: { gte: cooldownSince },
      },
    })
    if (recentAlert) {
      console.log(`[PatternDetector] Alertas enviadas recientemente, saltando notificación (cooldown: ${config.cooldownMinutes}min)`)
      return
    }

    // Construir mensaje de alerta
    const criticalCount = notifiablePatterns.filter(p => p.severity === 'critical').length
    const highCount = notifiablePatterns.filter(p => p.severity === 'high').length
    const totalCount = notifiablePatterns.length

    const title = `🚨 ${totalCount} patrón(es) anómalo(s) detectado(s)`
    const body = notifiablePatterns
      .slice(0, 5)
      .map(p => `• [${p.severity.toUpperCase()}] ${p.description} (${p.value}%)`)
      .join('\n')
    const fullBody = `${body}\n\n${criticalCount} críticos, ${highCount} altos — Revisa el dashboard de analytics.`

    // Enviar por cada canal configurado
    const sendPromises: Promise<any>[] = []

    if (config.channels.includes('in_app')) {
      // Obtener usuarios admin del tenant para notificar
      const adminUsers = await prisma.user.findMany({
        where: { tenantId, role: { nombre: { in: ['admin', 'superadmin'] } } },
        select: { id: true },
      })

      for (const user of adminUsers) {
        sendPromises.push(
          prisma.inAppNotification.create({
            data: {
              tenantId,
              userId: user.id,
              title,
              body: fullBody,
              type: 'warning',
              data: {
                source: 'pattern_detector',
                patterns: notifiablePatterns.map(p => ({
                  type: p.type,
                  severity: p.severity,
                  value: p.value,
                  description: p.description,
                })),
                dashboardUrl: '/dashboard/chatbot/analytics',
              },
              actionUrl: '/dashboard/chatbot/analytics',
            },
          })
        )
      }
    }

    if (config.channels.includes('telegram')) {
      const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
      const { SkillContext } = await import('@/lib/skills/context')
      const ctx = new SkillContext({ tenantId })
      sendPromises.push(
        notifyByTelegram(
          `*${title}*\n\n${fullBody}\n\n🔗 [Ver dashboard](https://volkern.app/dashboard/chatbot/analytics)`,
          ctx
        )
      )
    }
    // Registrar alerta enviada para cooldown cross-channel
    await prisma.chatbotAuditLog.create({
      data: {
        tenantId,
        intent: 'pattern_alert_sent',
        // Obligatorio en el modelo; sin él la fila de cooldown no se escribía
        // y el `.catch` vacío ocultaba el motivo.
        status: 'SUCCESS',
        skillParams: {
          patternCount: notifiablePatterns.length,
          severities: notifiablePatterns.map(p => p.severity),
          channels: config.channels,
        },
      },
    }).catch((error) => console.error('[PatternDetector] Error registrando alerta enviada:', error))

    await Promise.allSettled(sendPromises)
    console.log(`[PatternDetector] ✅ ${sendPromises.length} notificaciones enviadas para tenant ${tenantId}`)
  } catch (error) {
    console.error('[PatternDetector] Error enviando alertas:', error)
  }
}

/**
 * Obtiene los patrones detectados recientemente para un tenant
 */
export async function getRecentPatterns(
  tenantId: string,
  hours: number = 48
): Promise<DetectedPattern[]> {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)
    const logs = await prisma.chatbotAuditLog.findMany({
      where: {
        tenantId,
        intent: 'detected_pattern',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return logs.map(log => ({
      type: (log.skillParams as any)?.type || 'unknown',
      severity: (log.skillParams as any)?.severity || 'low',
      description: (log.skillParams as any)?.description || '',
      value: (log.skillParams as any)?.value || 0,
      threshold: (log.skillParams as any)?.threshold || 0,
      context: (log.skillParams as any)?.context || {},
      recommendation: (log.skillParams as any)?.recommendation || '',
      detectedAt: log.createdAt,
    }))
  } catch {
    return []
  }
}
