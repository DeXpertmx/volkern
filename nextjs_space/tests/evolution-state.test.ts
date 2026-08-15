import { describe, expect, it } from 'vitest'

import { mapEvolutionState } from '@/lib/evolution-instances'

describe('mapEvolutionState', () => {
  it('mapea open → connected', () => {
    expect(mapEvolutionState('open')).toBe('connected')
  })

  it('mapea connecting → connecting', () => {
    expect(mapEvolutionState('connecting')).toBe('connecting')
  })

  it('mapea close/close-removed/disconnected → disconnected', () => {
    expect(mapEvolutionState('close')).toBe('disconnected')
    expect(mapEvolutionState('close-removed')).toBe('disconnected')
    expect(mapEvolutionState('disconnected')).toBe('disconnected')
  })

  it('tolera estados indefinidos o vacíos', () => {
    expect(mapEvolutionState(undefined)).toBe('disconnected')
    expect(mapEvolutionState('')).toBe('disconnected')
  })
})
