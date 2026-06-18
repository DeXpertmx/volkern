import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    chatbotAuditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
  }
  return { prisma: mockPrisma }
})

import { detectPatterns, getRecentPatterns } from '@/lib/chat/pattern-detector'

describe('PatternDetector — detectPatterns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debe devolver array vacío si hay pocos logs (< minSamples)', async () => {
    const { prisma } = await import('@/lib/db')
    vi.mocked(prisma.chatbotAuditLog.findMany).mockImplementation(async ({ where }: any) => {
      if (where?.event === 'conversation_analysis') return []
      return [] // audit logs vacíos
    })

    const result = await detectPatterns('tenant-1', { hours: 48, minSamples: 10 })
    expect(result).toEqual([])
  })

  it('debe detectar high_unknown_rate cuando hay muchos unknown', async () => {
    const { prisma } = await import('@/lib/db')

    // 10 logs, 5 de ellos con intent='unknown' → 50% > 30% threshold
    const auditLogs = Array.from({ length: 10 }, (_, i) => ({
      id: `log-${i}`,
      tenantId: 'tenant-1',
      intent: i < 5 ? 'unknown' : 'agendar_cita',
      skillExecuted: i < 5 ? null : 'create_booking',
      status: i < 5 ? 'SUCCESS' : 'ERROR',
      errorMessage: null,
      createdAt: new Date(),
    }))

    vi.mocked(prisma.chatbotAuditLog.findMany).mockImplementation(async ({ where }: any) => {
      if (where?.event === 'conversation_analysis') return []
      return auditLogs
    })

    const result = await detectPatterns('tenant-1', { hours: 48, minSamples: 3 })
    expect(result.length).toBeGreaterThanOrEqual(1)
    const unknownPattern = result.find(p => p.type === 'high_unknown_rate')
    expect(unknownPattern).toBeDefined()
    expect(unknownPattern!.value).toBe(50) // 50%
  })

  it('debe detectar skill_failure para skills con alta tasa de error', async () => {
    const { prisma } = await import('@/lib/db')

    const auditLogs = Array.from({ length: 10 }, (_, i) => ({
      id: `log-${i}`,
      tenantId: 'tenant-1',
      intent: 'crear_lead',
      skillExecuted: 'create_lead',
      status: i < 4 ? 'ERROR' : 'SUCCESS', // 40% error > 25% threshold
      errorMessage: i < 4 ? 'Timeout' : null,
      createdAt: new Date(),
    }))

    vi.mocked(prisma.chatbotAuditLog.findMany).mockImplementation(async ({ where }: any) => {
      if (where?.event === 'conversation_analysis') return []
      return auditLogs
    })

    const result = await detectPatterns('tenant-1', { hours: 48, minSamples: 3 })
    const skillFailure = result.find(p => p.type === 'skill_failure')
    expect(skillFailure).toBeDefined()
    expect(skillFailure!.context.skill).toBe('create_lead')
    expect(skillFailure!.value).toBeGreaterThanOrEqual(30) // 40%
  })

  it('debe detectar sentimiento negativo en análisis', async () => {
    const { prisma } = await import('@/lib/db')

    // Audit logs mínimos para pasar el check
    const auditLogs = Array.from({ length: 10 }, (_, i) => ({
      id: `log-${i}`,
      tenantId: 'tenant-1',
      intent: 'consulta_general',
      status: 'SUCCESS',
      createdAt: new Date(),
    }))

    // 5 análisis con sentimiento bajo (score < 30 para que pase el threshold)
    const analyses = Array.from({ length: 5 }, (_, i) => ({
      id: `analysis-${i}`,
      tenantId: 'tenant-1',
      event: 'conversation_analysis',
      createdAt: new Date(),
      severity: 'high',
      metadata: {
        sentiment: i < 3 ? 'negative' : 'neutral',
        sentimentScore: i < 3 ? 15 : 40,
        resolved: false,
        requiredHumanTransfer: false,
        topics: [],
        recommendations: [],
      },
    }))

    let callCount = 0
    vi.mocked(prisma.chatbotAuditLog.findMany).mockImplementation(async ({ where }: any) => {
      callCount++
      if (where?.event === 'conversation_analysis') return analyses
      return auditLogs
    })

    const result = await detectPatterns('tenant-1', { hours: 48, minSamples: 3 })
    const sentimentDrop = result.find(p => p.type === 'sentiment_drop')
    expect(sentimentDrop).toBeDefined()
  })

  it('debe detectar high_fallback_rate si hay muchos errores', async () => {
    const { prisma } = await import('@/lib/db')

    // 10 logs, 4 errores → 40% > 20% threshold
    const auditLogs = Array.from({ length: 10 }, (_, i) => ({
      id: `log-${i}`,
      tenantId: 'tenant-1',
      intent: 'agendar_cita',
      status: i < 4 ? 'ERROR' : 'SUCCESS',
      createdAt: new Date(),
    }))

    vi.mocked(prisma.chatbotAuditLog.findMany).mockImplementation(async ({ where }: any) => {
      if (where?.event === 'conversation_analysis') return []
      return auditLogs
    })

    const result = await detectPatterns('tenant-1', { hours: 48, minSamples: 3 })
    const fallbackPattern = result.find(p => p.type === 'high_fallback_rate')
    expect(fallbackPattern).toBeDefined()
    expect(fallbackPattern!.value).toBe(40) // 40%
  })
})

describe('PatternDetector — getRecentPatterns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debe devolver array vacío si no hay patrones', async () => {
    const { prisma } = await import('@/lib/db')
    vi.mocked(prisma.chatbotAuditLog.findMany).mockResolvedValue([])
    const result = await getRecentPatterns('tenant-1', 48)
    expect(result).toEqual([])
  })

  it('debe parsear patrones desde logs', async () => {
    const { prisma } = await import('@/lib/db')
    vi.mocked(prisma.chatbotAuditLog.findMany).mockResolvedValueOnce([
      {
        id: 'pattern-1',
        severity: 'high',
        createdAt: new Date('2026-06-15T10:00:00Z'),
        metadata: {
          type: 'high_unknown_rate',
          description: '50% de mensajes clasificados como unknown',
          value: 50,
          threshold: 30,
          context: { totalMessages: 20 },
          recommendation: 'Revisar el classifier',
        },
      },
    ])

    const result = await getRecentPatterns('tenant-1', 48)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('high_unknown_rate')
    expect(result[0].value).toBe(50)
    expect(result[0].severity).toBe('high')
  })
})
