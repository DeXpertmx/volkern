import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    chatbotAuditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
  }
  return { prisma: mockPrisma }
})

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithFallback: vi.fn().mockResolvedValue({
    choices: [{ message: { content: '[]' } }],
  }),
}))

import { generateSuggestions, getRecentSuggestions, updateSuggestionStatus } from '@/lib/chat/improvement-engine'
import type { DetectedPattern } from '@/lib/chat/pattern-detector'

describe('ImprovementEngine — generateSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debe devolver array vacío si no hay patrones', async () => {
    const result = await generateSuggestions('tenant-1', [])
    expect(result).toEqual([])
  })

  it('debe generar sugerencia para high_unknown_rate', async () => {
    const patterns: DetectedPattern[] = [{
      type: 'high_unknown_rate',
      severity: 'high',
      description: '50% de mensajes clasificados como unknown',
      value: 50,
      threshold: 30,
      context: { totalMessages: 20, unknownCount: 10 },
      recommendation: 'Revisar classifier',
      detectedAt: new Date(),
    }]

    const result = await generateSuggestions('tenant-1', patterns)
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].type).toBe('add_training_examples')
    expect(result[0].priority).toBe('high')
    expect(result[0].status).toBe('pending')
    expect(result[0].category).toBe('training')
  })

  it('debe generar sugerencia para skill_failure', async () => {
    const patterns: DetectedPattern[] = [{
      type: 'skill_failure',
      severity: 'high',
      description: 'Skill create_booking tiene 40% de errores',
      value: 40,
      threshold: 25,
      context: { skill: 'create_booking', totalExecutions: 10, errorCount: 4 },
      recommendation: 'Revisar el skill',
      detectedAt: new Date(),
    }]

    const result = await generateSuggestions('tenant-1', patterns)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('improve_skill_error_handling')
    expect(result[0].title).toContain('create_booking')
  })

  it('debe generar sugerencia para repeated_unanswered', async () => {
    const patterns: DetectedPattern[] = [{
      type: 'repeated_unanswered',
      severity: 'high',
      description: '"facturación electrónica" apareció 5 veces',
      value: 5,
      threshold: 3,
      context: { topic: 'facturación electrónica', occurrenceCount: 5 },
      recommendation: 'Crear KB article sobre facturación',
      detectedAt: new Date(),
    }]

    const result = await generateSuggestions('tenant-1', patterns)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('create_kb_article')
    expect(result[0].title).toContain('facturación electrónica')
  })

  it('debe asignar prioridad critical si el patrón es critical', async () => {
    const patterns: DetectedPattern[] = [{
      type: 'high_unknown_rate',
      severity: 'critical',
      description: '80% de mensajes clasificados como unknown',
      value: 80,
      threshold: 30,
      context: { totalMessages: 10, unknownCount: 8 },
      recommendation: 'Revisar classifier',
      detectedAt: new Date(),
    }]

    const result = await generateSuggestions('tenant-1', patterns)
    expect(result[0].priority).toBe('critical')
  })

  it('debe devolver sugerencias existentes si ya hay muchas recientes', async () => {
    const { prisma } = await import('@/lib/db')

    // Simular que ya hay 10 sugerencias recientes (MAX_SUGGESTIONS)
    const existingSuggestions = Array.from({ length: 10 }, (_, i) => ({
      id: `sug-${i}`,
      event: 'improvement_suggestion',
      severity: 'info',
      createdAt: new Date(),
      metadata: {
        id: `imp_${i}`,
        type: 'add_training_examples',
        title: `Sugerencia ${i}`,
        description: 'Test',
        priority: 'medium',
        status: 'pending',
        implementationGuide: '',
        estimatedImpact: '',
        category: 'training',
        sourcePattern: 'high_unknown_rate',
      },
    }))

    vi.mocked(prisma.chatbotAuditLog.findMany).mockResolvedValueOnce(existingSuggestions)

    const patterns: DetectedPattern[] = [{
      type: 'high_unknown_rate', severity: 'high', description: 'Test', value: 50,
      threshold: 30, context: {}, recommendation: '', detectedAt: new Date(),
    }]

    const result = await generateSuggestions('tenant-1', patterns)
    expect(result).toHaveLength(10) // Devuelve las existentes sin generar nuevas
  })
})

describe('ImprovementEngine — getRecentSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debe devolver array vacío si no hay sugerencias', async () => {
    const result = await getRecentSuggestions('tenant-1', 48)
    expect(result).toEqual([])
  })

  it('debe parsear sugerencias desde logs', async () => {
    const { prisma } = await import('@/lib/db')
    vi.mocked(prisma.chatbotAuditLog.findMany).mockResolvedValueOnce([
      {
        id: 'sug-1',
        event: 'improvement_suggestion',
        severity: 'high',
        createdAt: new Date('2026-06-15T10:00:00Z'),
        metadata: {
          id: 'imp_abc123',
          type: 'add_training_examples',
          title: 'Mejorar clasificación de intents',
          description: '50% unknown detectado',
          priority: 'high',
          status: 'pending',
          implementationGuide: 'Agregar ejemplos...',
          estimatedImpact: 'Mejorar precisión',
          category: 'training',
          sourcePattern: 'high_unknown_rate',
        },
      },
    ])

    const result = await getRecentSuggestions('tenant-1', 48)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('add_training_examples')
    expect(result[0].title).toBe('Mejorar clasificación de intents')
    expect(result[0].status).toBe('pending')
  })
})

describe('ImprovementEngine — updateSuggestionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debe retornar false si la sugerencia no existe', async () => {
    const { prisma } = await import('@/lib/db')
    vi.mocked(prisma.chatbotAuditLog.findFirst).mockResolvedValueOnce(null)

    const result = await updateSuggestionStatus('tenant-1', 'no-existe', 'applied')
    expect(result).toBe(false)
  })

  it('debe actualizar el status de una sugerencia existente', async () => {
    const { prisma } = await import('@/lib/db')
    vi.mocked(prisma.chatbotAuditLog.findFirst).mockResolvedValueOnce({
      id: 'sug-1',
      metadata: { id: 'imp_abc', status: 'pending', type: 'add_training_examples' },
    })

    const result = await updateSuggestionStatus('tenant-1', 'imp_abc', 'applied')
    expect(result).toBe(true)
    expect(prisma.chatbotAuditLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sug-1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            status: 'applied',
          }),
        }),
      })
    )
  })
})
