import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks
vi.mock('@/lib/db', () => {
  const mockPrisma = {
    chatbotAuditLog: {
      create: vi.fn(),
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
    choices: [{ message: { content: '[]' } }],
  }),
}))

import { extractFacts, formatFact, formatFacts, buildFactsBlock, ExtractedFact } from '@/lib/agents/fact-extractor'

describe('FactExtractor — formatFact', () => {
  it('debe formatear fact de contact_info', () => {
    const fact: ExtractedFact = { category: 'contact_info', value: 'Nombre: Juan Pérez', confidence: 0.95 }
    expect(formatFact(fact)).toBe('Contacto: Nombre: Juan Pérez')
  })

  it('debe formatear fact de pain_point', () => {
    const fact: ExtractedFact = { category: 'pain_point', value: 'Problema: dificultad con inventario', confidence: 0.85 }
    expect(formatFact(fact)).toBe('Problema: Problema: dificultad con inventario')
  })

  it('debe formatear fact de interés', () => {
    const fact: ExtractedFact = { category: 'interest', value: 'Interesado en módulo de facturación', confidence: 0.8 }
    expect(formatFact(fact)).toBe('Interés: Interesado en módulo de facturación')
  })

  it('debe usar "Info" para categoría no reconocida', () => {
    const fact: ExtractedFact = { category: 'general' as any, value: 'Dato general', confidence: 0.7 }
    expect(formatFact(fact)).toBe('Info: Dato general')
  })
})

describe('FactExtractor — formatFacts', () => {
  it('debe formatear múltiples facts', () => {
    const facts: ExtractedFact[] = [
      { category: 'contact_info', value: 'Nombre: Ana', confidence: 0.9 },
      { category: 'pain_point', value: 'Problema: lento', confidence: 0.8 },
    ]
    const result = formatFacts(facts)
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('Contacto: Nombre: Ana')
    expect(result[1]).toBe('Problema: Problema: lento')
  })

  it('debe devolver array vacío si no hay facts', () => {
    expect(formatFacts([])).toEqual([])
  })
})

describe('FactExtractor — buildFactsBlock', () => {
  it('debe construir bloque con facts agrupados por categoría', () => {
    const facts = [
      'Contacto: Nombre: Juan Pérez',
      'Contacto: Email: juan@test.com',
      'Problema: Dificultad con facturación',
    ]
    const block = buildFactsBlock(facts)
    expect(block).toContain('📋 INFORMACIÓN DEL CLIENTE')
    expect(block).toContain('Nombre: Juan Pérez')
    expect(block).toContain('Email: juan@test.com')
    expect(block).toContain('Dificultad con facturación')
  })

  it('debe devolver string vacío si no hay facts', () => {
    expect(buildFactsBlock([])).toBe('')
  })

  it('debe manejar facts sin categoría (solo valor)', () => {
    const facts = ['Info: Dato simple']
    const block = buildFactsBlock(facts)
    expect(block).toContain('Dato simple')
  })
})

describe('FactExtractor — extractFacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debe devolver array vacío para mensaje muy corto', async () => {
    const result = await extractFacts('Hola', [])
    expect(result).toEqual([])
  })

  it('debe devolver array vacío si el LLM responde con array vacío', async () => {
    const { callAssistantWithFallback } = await import('@/lib/assistant/openrouter-client')
    vi.mocked(callAssistantWithFallback).mockResolvedValueOnce({
      choices: [{ message: { content: '[]' } }],
    } as any)

    const result = await extractFacts('Me llamo Juan Pérez y trabajo en una empresa de logística', [])
    expect(result).toEqual([])
  })

  it('debe devolver facts válidos si el LLM responde con datos', async () => {
    const { callAssistantWithFallback } = await import('@/lib/assistant/openrouter-client')
    vi.mocked(callAssistantWithFallback).mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify([
            { category: 'contact_info', value: 'Nombre: Juan Pérez', confidence: 0.95 },
            { category: 'pain_point', value: 'Problema: gestión de inventario manual', confidence: 0.85 },
          ]),
        },
      }],
    } as any)

    const result = await extractFacts('Me llamo Juan Pérez, tengo problemas con el inventario manual', [])
    expect(result).toHaveLength(2)
    expect(result[0].category).toBe('contact_info')
    expect(result[0].confidence).toBeGreaterThanOrEqual(0.6)
  })

  it('debe filtrar facts con confianza baja (< 0.6)', async () => {
    const { callAssistantWithFallback } = await import('@/lib/assistant/openrouter-client')
    vi.mocked(callAssistantWithFallback).mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify([
            { category: 'contact_info', value: 'Nombre: Test', confidence: 0.95 },
            { category: 'preference', value: 'Quizás le guste X', confidence: 0.45 },
          ]),
        },
      }],
    } as any)

    const result = await extractFacts('Soy Test', [])
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('contact_info')
  })

  it('debe deduplicar facts contra existentes', async () => {
    const { callAssistantWithFallback } = await import('@/lib/assistant/openrouter-client')
    vi.mocked(callAssistantWithFallback).mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify([
            { category: 'contact_info', value: 'Nombre: Juan Pérez', confidence: 0.95 },
          ]),
        },
      }],
    } as any)

    const existing = ['Contacto: Nombre: Juan Pérez']
    const result = await extractFacts('Me llamo Juan Pérez', existing)
    expect(result).toHaveLength(0)
  })

  it('debe manejar error del LLM gracefulmente', async () => {
    const { callAssistantWithFallback } = await import('@/lib/assistant/openrouter-client')
    vi.mocked(callAssistantWithFallback).mockRejectedValueOnce(new Error('API Error'))

    const result = await extractFacts('Hola, soy un cliente nuevo', [])
    expect(result).toEqual([])
  })
})
