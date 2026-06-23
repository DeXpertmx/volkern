import { describe, it, expect } from 'vitest'

import { needsSummarization, buildSummaryBlock } from '@/lib/chat/conversation-summarizer'
import type { ConversationSummary } from '@/lib/chat/conversation-summarizer'

describe('Summarizer — needsSummarization', () => {
  it('debe retornar true si messageCount >= threshold (12)', () => {
    expect(needsSummarization(12)).toBe(true)
    expect(needsSummarization(15)).toBe(true)
    expect(needsSummarization(20)).toBe(true)
  })

  it('debe retornar false si messageCount < threshold', () => {
    expect(needsSummarization(0)).toBe(false)
    expect(needsSummarization(5)).toBe(false)
    expect(needsSummarization(11)).toBe(false)
  })

  it('debe duplicar el threshold si ya hay un resumen v2', () => {
    // Con v2 existente, el threshold efectivo es 24
    expect(needsSummarization(12, 2)).toBe(false)
    expect(needsSummarization(23, 2)).toBe(false)
    expect(needsSummarization(24, 2)).toBe(true)
    expect(needsSummarization(30, 2)).toBe(true)
  })

  it('debe usar threshold normal si version no es 2', () => {
    expect(needsSummarization(12, 1)).toBe(true)
    expect(needsSummarization(12, 0)).toBe(true)
    expect(needsSummarization(12, undefined)).toBe(true)
  })
})

describe('Summarizer — buildSummaryBlock', () => {
  it('debe devolver string vacío si no hay summary', () => {
    expect(buildSummaryBlock(null)).toBe('')
    expect(buildSummaryBlock(undefined as any)).toBe('')
  })

  it('debe devolver string vacío si text está vacío', () => {
    const summary: ConversationSummary = {
      text: '', topics: [], decisions: [], customerInfo: {},
      timestamp: Date.now(), summarizedMessages: 0, version: 2,
    }
    expect(buildSummaryBlock(summary)).toBe('')
  })

  it('debe incluir el texto del resumen', () => {
    const summary: ConversationSummary = {
      text: 'Cliente interesado en facturación electrónica.',
      topics: [], decisions: [], customerInfo: {},
      timestamp: Date.now(), summarizedMessages: 5, version: 2,
    }
    const block = buildSummaryBlock(summary)
    expect(block).toContain('RESUMEN DE LA CONVERSACIÓN')
    expect(block).toContain('facturación electrónica')
    expect(block).toContain('FIN DEL RESUMEN')
  })

  it('debe incluir decisiones si existen', () => {
    const summary: ConversationSummary = {
      text: 'Conversación sobre plan empresarial.',
      topics: [], decisions: ['Enviar cotización', 'Llamar el lunes'],
      customerInfo: {}, timestamp: Date.now(), summarizedMessages: 3, version: 2,
    }
    const block = buildSummaryBlock(summary)
    expect(block).toContain('Decisiones/Acciones:')
    expect(block).toContain('Enviar cotización')
    expect(block).toContain('Llamar el lunes')
  })

  it('debe incluir datos del cliente si existen', () => {
    const summary: ConversationSummary = {
      text: 'Cliente proporcionó datos.',
      topics: [], decisions: [],
      customerInfo: { nombre: 'Ana García', empresa: 'Tech SA' },
      timestamp: Date.now(), summarizedMessages: 2, version: 2,
    }
    const block = buildSummaryBlock(summary)
    expect(block).toContain('Datos del cliente:')
    expect(block).toContain('Ana García')
    expect(block).toContain('Tech SA')
  })

  it('debe incluir temas si existen', () => {
    const summary: ConversationSummary = {
      text: 'Se habló de varios temas.',
      topics: ['facturación', 'soporte técnico'], decisions: [], customerInfo: {},
      timestamp: Date.now(), summarizedMessages: 4, version: 2,
    }
    const block = buildSummaryBlock(summary)
    expect(block).toContain('Temas cubiertos:')
    expect(block).toContain('facturación, soporte técnico')
  })

  it('debe incluir todos los componentes cuando existen', () => {
    const summary: ConversationSummary = {
      text: 'Resumen completo.',
      topics: ['ventas'], decisions: ['Reunión el jueves'],
      customerInfo: { nombre: 'Carlos' },
      timestamp: Date.now(), summarizedMessages: 6, version: 2,
    }
    const block = buildSummaryBlock(summary)
    expect(block).toContain('RESUMEN DE LA CONVERSACIÓN')
    expect(block).toContain('Decisiones/Acciones:')
    expect(block).toContain('Datos del cliente:')
    expect(block).toContain('Temas cubiertos:')
    expect(block).toContain('FIN DEL RESUMEN')
  })
})
