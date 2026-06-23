import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    chatbotAuditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
  }
  return { prisma: mockPrisma }
})

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithFallback: vi.fn().mockResolvedValue({
    choices: [{ message: { content: '{}' } }],
  }),
}))

import { analyzeConversation, getRecentAnalyses } from '@/lib/chat/conversation-analyzer'

describe('ConversationAnalyzer — analyzeConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debe devolver análisis básico para conversaciones muy cortas (<4 mensajes)', async () => {
    const messages = [
      { role: 'user', content: 'Hola', timestamp: new Date('2026-01-01T10:00:00') },
      { role: 'assistant', content: 'Hola, ¿en qué puedo ayudarte?', timestamp: new Date('2026-01-01T10:00:30') },
    ]
    const result = await analyzeConversation('conv-1', 'tenant-1', messages, [])

    expect(result.conversationId).toBe('conv-1')
    expect(result.sentiment).toBe('neutral')
    expect(result.sentimentScore).toBe(50)
    expect(result.intentsDetected).toEqual([])
    expect(result.skillsUsed).toEqual([])
    expect(result.fallbackCount).toBe(0)
    expect(result.unknownCount).toBe(0)
    expect(result.totalMessages).toBe(2)
    expect(result.topics).toEqual([])
  })

  it('debe contar fallbacks y unknowns desde auditLogs', async () => {
    const messages = [
      { role: 'user', content: 'Hola', timestamp: new Date('2026-01-01T10:00:00') },
      { role: 'assistant', content: 'Hola', timestamp: new Date('2026-01-01T10:00:30') },
      { role: 'user', content: 'Quiero agendar', timestamp: new Date('2026-01-01T10:01:00') },
      { role: 'assistant', content: 'Claro', timestamp: new Date('2026-01-01T10:01:30') },
    ]
    const auditLogs = [
      { intent: 'unknown', status: 'SUCCESS' },
      { intent: 'agendar_cita', skillExecuted: 'create_booking', status: 'ERROR', errorMessage: 'Timeout' },
    ]
    const result = await analyzeConversation('conv-2', 'tenant-1', messages, auditLogs)

    expect(result.intentsDetected).toContain('unknown')
    expect(result.intentsDetected).toContain('agendar_cita')
    expect(result.skillsUsed).toContain('create_booking')
    expect(result.fallbackCount).toBe(1) // 1 ERROR
    expect(result.unknownCount).toBe(1)  // 1 unknown
  })

  it('debe detectar requiredHumanTransfer si hay skill transfer_to_human', async () => {
    const messages = [
      { role: 'user', content: 'Hola', timestamp: new Date('2026-01-01T10:00:00') },
      { role: 'assistant', content: 'Hola', timestamp: new Date('2026-01-01T10:00:30') },
      { role: 'user', content: 'Necesito un humano', timestamp: new Date('2026-01-01T10:01:00') },
      { role: 'assistant', content: 'Te transfiero', timestamp: new Date('2026-01-01T10:01:30') },
    ]
    const auditLogs = [
      { intent: 'contactar_humano', skillExecuted: 'transfer_to_human', status: 'SUCCESS' },
    ]
    const result = await analyzeConversation('conv-3', 'tenant-1', messages, auditLogs)
    expect(result.requiredHumanTransfer).toBe(true)
  })

  it('debe calcular duración correctamente', async () => {
    const messages = [
      { role: 'user', content: 'Hola', timestamp: new Date('2026-01-01T10:00:00') },
      { role: 'assistant', content: 'Adiós', timestamp: new Date('2026-01-01T11:30:00') }, // 90 min después
      { role: 'user', content: 'Gracias', timestamp: new Date('2026-01-01T11:00:00') },
      { role: 'assistant', content: 'De nada', timestamp: new Date('2026-01-01T11:31:00') },
    ]
    const result = await analyzeConversation('conv-4', 'tenant-1', messages, [])
    expect(result.durationMinutes).toBe(91) // 10:00 → 11:31
  })

  it('debe usar fallback por regex si el LLM falla', async () => {
    const { callAssistantWithFallback } = await import('@/lib/assistant/openrouter-client')
    vi.mocked(callAssistantWithFallback).mockRejectedValueOnce(new Error('API Error'))

    const messages = [
      { role: 'user', content: 'Hola, qué mal servicio, no funciona nada', timestamp: new Date('2026-01-01T10:00:00') },
      { role: 'assistant', content: 'Lo siento', timestamp: new Date('2026-01-01T10:00:30') },
      { role: 'user', content: 'Quiero cancelar', timestamp: new Date('2026-01-01T10:01:00') },
      { role: 'assistant', content: 'Claro', timestamp: new Date('2026-01-01T10:01:30') },
    ]
    const result = await analyzeConversation('conv-5', 'tenant-1', messages, [])
    expect(result.sentiment).toBe('negative')
    expect(result.sentimentScore).toBeLessThanOrEqual(25)
    expect(result.resolutionConfidence).toBe(0.4) // fallback confidence
  })

  it('debe detectar sentimiento positivo con fallback regex', async () => {
    const { callAssistantWithFallback } = await import('@/lib/assistant/openrouter-client')
    vi.mocked(callAssistantWithFallback).mockRejectedValueOnce(new Error('API Error'))

    const messages = [
      { role: 'user', content: 'Excelente servicio, muchas gracias', timestamp: new Date('2026-01-01T10:00:00') },
      { role: 'assistant', content: 'De nada', timestamp: new Date('2026-01-01T10:00:30') },
      { role: 'user', content: 'Perfecto, funcionó todo genial', timestamp: new Date('2026-01-01T10:01:00') },
      { role: 'assistant', content: 'Me alegro', timestamp: new Date('2026-01-01T10:01:30') },
    ]
    const result = await analyzeConversation('conv-6', 'tenant-1', messages, [])
    expect(result.sentiment).toBe('positive')
    expect(result.sentimentScore).toBeGreaterThanOrEqual(75)
  })
})

describe('ConversationAnalyzer — getRecentAnalyses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debe devolver array vacío si no hay análisis', async () => {
    const result = await getRecentAnalyses('tenant-1', 24)
    expect(result).toEqual([])
  })

  it('debe parsear análisis desde logs', async () => {
    const { prisma } = await import('@/lib/db')
    vi.mocked(prisma.chatbotAuditLog.findMany).mockResolvedValueOnce([
      {
        id: 'log-1',
        tenantId: 'tenant-1',
        createdAt: new Date('2026-06-15T10:00:00Z'),
        metadata: {
          conversationId: 'conv-1',
          sentiment: 'positive',
          sentimentScore: 85,
          resolved: true,
          resolutionConfidence: 0.9,
          intentsDetected: ['agendar_cita'],
          skillsUsed: ['create_booking'],
          fallbackCount: 0,
          unknownCount: 0,
          totalMessages: 5,
          durationMinutes: 10,
          requiredHumanTransfer: false,
          topics: ['citas', 'servicios'],
          recommendations: [],
        },
        severity: 'info',
      },
    ])

    const result = await getRecentAnalyses('tenant-1', 24)
    expect(result).toHaveLength(1)
    expect(result[0].sentiment).toBe('positive')
    expect(result[0].sentimentScore).toBe(85)
    expect(result[0].resolved).toBe(true)
    expect(result[0].topics).toContain('citas')
  })
})
