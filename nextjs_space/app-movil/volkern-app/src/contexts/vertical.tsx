import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import type { HubCategory, HubModule } from '../types';

interface VerticalContextType {
  activeVertical: HubCategory | null
  activeModules: HubModule[]
  setActiveVertical: (category: HubCategory | null) => void
  clearVertical: () => void
}

const VerticalContext = createContext<VerticalContextType>({
  activeVertical: null,
  activeModules: [],
  setActiveVertical: () => {},
  clearVertical: () => {},
})

export function VerticalProvider({ children, categories, getModules }: {
  children: React.ReactNode
  categories: HubCategory[]
  getModules: (categoryId: string) => HubModule[]
}) {
  const [activeVertical, setActiveVertical] = useState<HubCategory | null>(null)

  const activeModules = useMemo(
    () => activeVertical ? getModules(activeVertical.id) : [],
    [activeVertical, getModules]
  )

  const clearVertical = useCallback(() => setActiveVertical(null), [])

  const value = useMemo(
    () => ({ activeVertical, activeModules, setActiveVertical, clearVertical }),
    [activeVertical, activeModules, setActiveVertical, clearVertical]
  )

  return (
    <VerticalContext.Provider value={value}>
      {children}
    </VerticalContext.Provider>
  )
}

export function useVertical(): VerticalContextType {
  const ctx = useContext(VerticalContext)
  if (!ctx) throw new Error('useVertical must be used within a VerticalProvider')
  return ctx
}
