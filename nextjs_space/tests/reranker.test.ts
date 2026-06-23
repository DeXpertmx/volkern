import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => {
  const mockPrisma = {
    chatbotAuditLog: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
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

import { buildKbBlock, RankedResult } from '@/lib/knowledge/reranker'

describe('Reranker — buildKbBlock', () => {
  it('debe devolver string vacío si no hay resultados', () => {
    expect(buildKbBlock([])).toBe('')
  })

  it('debe construir bloque con 1 resultado', () => {
    const results: RankedResult[] = [{
      id: '1', title: 'Cómo usar facturación', content: 'Guía de facturación electrónica...',
      category: 'SOP', tags: ['facturación'], relevanceScore: 85, relevanceReason: 'Responde la consulta',
    }]
    const block = buildKbBlock(results)
    expect(block).toContain('INFORMACIÓN DE REFERENCIA')
    expect(block).toContain('Cómo usar facturación')
    expect(block).toContain('relevancia: 85%')
    expect(block).toContain('🟢')
  })

  it('debe mostrar badge 🟡 para relevancia media', () => {
    const results: RankedResult[] = [{
      id: '2', title: 'Tema medio', content: 'Contenido del artículo...',
      category: 'TECHNICAL', tags: [], relevanceScore: 55, relevanceReason: 'Parcialmente relevante',
    }]
    const block = buildKbBlock(results)
    expect(block).toContain('🟡')
    expect(block).toContain('relevancia: 55%')
  })

  it('debe mostrar badge ⚪ para relevancia baja', () => {
    const results: RankedResult[] = [{
      id: '3', title: 'Tema bajo', content: 'Contenido...',
      category: 'POLICY', tags: [], relevanceScore: 35, relevanceReason: 'Poco relevante',
    }]
    const block = buildKbBlock(results)
    expect(block).toContain('⚪')
    expect(block).toContain('relevancia: 35%')
  })

  it('debe manejar múltiples resultados', () => {
    const results: RankedResult[] = [
      { id: '1', title: 'Artículo A', content: 'Contenido A...', category: 'SOP', tags: [], relevanceScore: 90, relevanceReason: 'Alta' },
      { id: '2', title: 'Artículo B', content: 'Contenido B...', category: 'TECHNICAL', tags: [], relevanceScore: 70, relevanceReason: 'Media' },
    ]
    const block = buildKbBlock(results)
    expect(block).toContain('Artículo A')
    expect(block).toContain('Artículo B')
    // Ambos tienen score >= 70 → 🟢
    expect(block.match(/🟢/g)).toHaveLength(2)
  })
})

describe('Reranker — rerankResults (con mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debe devolver array vacío si no hay resultados de entrada', async () => {
    const { rerankResults } = await import('@/lib/knowledge/reranker')
    const result = await rerankResults('consulta de prueba', [])
    expect(result).toEqual([])
  })

  it('debe evaluar un solo resultado como caso edge', async () => {
    const { callAssistantWithFallback } = await import('@/lib/assistant/openrouter-client')
    vi.mocked(callAssistantWithFallback).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ score: 85, reason: 'Respuesta directa' }) } }],
    } as any)

    const { rerankResults } = await import('@/lib/knowledge/reranker')
    const result = await rerankResults('facturación', [
      { id: '1', title: 'Facturación', content: 'Guía completa', category: 'SOP', tags: ['facturas'] },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].relevanceScore).toBe(85)
  })

  it('debe retornar vacío si la evaluación da score bajo', async () => {
    const { callAssistantWithFallback } = await import('@/lib/assistant/openrouter-client')
    vi.mocked(callAssistantWithFallback).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ score: 20, reason: 'Irrelevante' }) } }],
    } as any)

    const { rerankResults } = await import('@/lib/knowledge/reranker')
    const result = await rerankResults('facturación', [
      { id: '1', title: 'Recetas de cocina', content: 'Cómo cocinar pasta', category: 'GENERAL', tags: [] },
    ])
    expect(result).toEqual([])
  })

  it('debe caer en fallback por similitud si el LLM falla', async () => {
    const { callAssistantWithFallback } = await import('@/lib/assistant/openrouter-client')
    vi.mocked(callAssistantWithFallback).mockRejectedValueOnce(new Error('API Error'))

    const { rerankResults } = await import('@/lib/knowledge/reranker')
    const result = await rerankResults('consulta', [
      { id: '1', title: 'Test', content: 'Contenido', category: 'SOP', tags: [], similarity: 0.8 },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].relevanceScore).toBe(80)
    expect(result[0].relevanceReason).toBe('Relevancia por similitud semántica')
  })

  it('debe incluir originalSimilarity cuando está disponible', async () => {
    const { callAssistantWithFallback } = await import('@/lib/assistant/openrouter-client')
    vi.mocked(callAssistantWithFallback).mockRejectedValueOnce(new Error('API Error'))

    const { rerankResults } = await import('@/lib/knowledge/reranker')
    const result = await rerankResults('consulta', [
      { id: '1', title: 'Test', content: 'Contenido', category: 'SOP', tags: [], similarity: 0.75 },
    ])
    expect(result[0].originalSimilarity).toBe(0.75)
  })
})
