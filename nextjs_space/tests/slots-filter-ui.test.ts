import { describe, it, expect } from 'vitest'

// ─── Types (mirror of page.tsx) ──────────────────────────────────────────────

interface Slot {
  id: string
  nombre: string
  slug: string
  plan: string
  estado: string
  fechaCreacion: string
  enabledModules: string[]
  billingEmail?: string | null
  _count?: {
    leads: number
    users: number
  }
}

// ─── Filtering logic (same as inline in agency & accounting pages) ───────────

type TabAgency = 'all' | 'agency' | 'accounting'
type TabAccounting = 'all' | 'accounting' | 'agency'

function filterAgencySlots(slots: Slot[], tab: TabAgency): Slot[] {
  return tab === 'all'
    ? slots
    : slots.filter(s => (tab === 'agency' ? s.plan === 'agency-slot' : s.plan === 'accounting-slot'))
}

function filterAccountingSlots(slots: Slot[], tab: TabAccounting): Slot[] {
  return tab === 'all'
    ? slots
    : slots.filter(s => (tab === 'accounting' ? s.plan === 'accounting-slot' : s.plan === 'agency-slot'))
}

function computeStats(slots: Slot[]) {
  return {
    total: slots.length,
    active: slots.filter(s => s.estado === 'activo').length,
    leads: slots.reduce((acc, s) => acc + (s._count?.leads || 0), 0),
    users: slots.reduce((acc, s) => acc + (s._count?.users || 0), 0),
  }
}

// ─── Test Data ───────────────────────────────────────────────────────────────

const agencySlots: Slot[] = [
  { id: 'a1', nombre: 'Inmobiliaria Norte', slug: 'inmob-norte', plan: 'agency-slot', estado: 'activo', fechaCreacion: '', enabledModules: ['CRM', 'LEADS'], _count: { leads: 45, users: 3 } },
  { id: 'a2', nombre: 'Agencia Sur', slug: 'agencia-sur', plan: 'agency-slot', estado: 'activo', fechaCreacion: '', enabledModules: ['CRM', 'PIPELINE'], _count: { leads: 120, users: 7 } },
]

const accountingSlots: Slot[] = [
  { id: 'c1', nombre: 'Comercializadora Sur', slug: 'comerc-sur', plan: 'accounting-slot', estado: 'activo', fechaCreacion: '', enabledModules: ['CONTABILIDAD', 'FACTURACION'], _count: { leads: 200, users: 5 } },
  { id: 'c2', nombre: 'Fábrica del Valle', slug: 'fabrica-valle', plan: 'accounting-slot', estado: 'inactivo', fechaCreacion: '', enabledModules: ['CONTABILIDAD'], _count: { leads: 15, users: 2 } },
]

const mixOfSlots: Slot[] = [...agencySlots, ...accountingSlots]
const mixPlusDeleted: Slot[] = [
  ...mixOfSlots,
  { id: 'd1', nombre: 'Eliminada', slug: 'elim', plan: 'agency-slot', estado: 'eliminado', fechaCreacion: '', enabledModules: [] },
]

// ─── Tests: filterAgencySlots ────────────────────────────────────────────────

describe('filterAgencySlots (página Agencia)', () => {
  it('tab "all" devuelve todos los slots sin filtrar', () => {
    expect(filterAgencySlots(mixOfSlots, 'all')).toHaveLength(4)
  })

  it('tab "agency" devuelve solo agency-slot', () => {
    const result = filterAgencySlots(mixOfSlots, 'agency')
    expect(result).toHaveLength(2)
    result.forEach(s => expect(s.plan).toBe('agency-slot'))
  })

  it('tab "accounting" devuelve solo accounting-slot', () => {
    const result = filterAgencySlots(mixOfSlots, 'accounting')
    expect(result).toHaveLength(2)
    result.forEach(s => expect(s.plan).toBe('accounting-slot'))
  })

  it('tab "all" con slot eliminado lo incluye', () => {
    const result = filterAgencySlots(mixPlusDeleted, 'all')
    expect(result).toHaveLength(5)
  })

  it('tab "agency" excluye accounting-slot correctamente', () => {
    const result = filterAgencySlots(mixOfSlots, 'agency')
    const accountingIds = result.filter(s => s.plan === 'accounting-slot')
    expect(accountingIds).toHaveLength(0)
  })

  it('array vacío devuelve array vacío', () => {
    expect(filterAgencySlots([], 'all')).toHaveLength(0)
    expect(filterAgencySlots([], 'agency')).toHaveLength(0)
    expect(filterAgencySlots([], 'accounting')).toHaveLength(0)
  })

  it('no muta el array original', () => {
    const original = [...mixOfSlots]
    filterAgencySlots(mixOfSlots, 'agency')
    expect(mixOfSlots).toEqual(original)
  })
})

// ─── Tests: filterAccountingSlots ────────────────────────────────────────────

describe('filterAccountingSlots (página Contabilidad)', () => {
  it('tab "all" devuelve todos los slots sin filtrar', () => {
    expect(filterAccountingSlots(mixOfSlots, 'all')).toHaveLength(4)
  })

  it('tab "accounting" devuelve solo accounting-slot', () => {
    const result = filterAccountingSlots(mixOfSlots, 'accounting')
    expect(result).toHaveLength(2)
    result.forEach(s => expect(s.plan).toBe('accounting-slot'))
  })

  it('tab "agency" devuelve solo agency-slot', () => {
    const result = filterAccountingSlots(mixOfSlots, 'agency')
    expect(result).toHaveLength(2)
    result.forEach(s => expect(s.plan).toBe('agency-slot'))
  })

  it('accounting y agency no se solapan', () => {
    const accounting = filterAccountingSlots(mixOfSlots, 'accounting')
    const agency = filterAccountingSlots(mixOfSlots, 'agency')
    const accountingIds = new Set(accounting.map(s => s.id))
    const agencyIds = new Set(agency.map(s => s.id))
    for (const id of accountingIds) {
      expect(agencyIds.has(id)).toBe(false)
    }
  })

  it('array vacío devuelve array vacío', () => {
    expect(filterAccountingSlots([], 'all')).toHaveLength(0)
    expect(filterAccountingSlots([], 'accounting')).toHaveLength(0)
    expect(filterAccountingSlots([], 'agency')).toHaveLength(0)
  })
})

// ─── Tests: computeStats ─────────────────────────────────────────────────────

describe('computeStats', () => {
  it('calcula total, active, leads, users correctamente', () => {
    const stats = computeStats(mixOfSlots)
    expect(stats.total).toBe(4)
    expect(stats.active).toBe(3)   // 2 agency + 1 accounting (c2 is inactive)
    expect(stats.leads).toBe(380)  // 45 + 120 + 200 + 15
    expect(stats.users).toBe(17)   // 3 + 7 + 5 + 2
  })

  it('array vacío devuelve ceros', () => {
    const stats = computeStats([])
    expect(stats).toEqual({ total: 0, active: 0, leads: 0, users: 0 })
  })

  it('slots sin _count suman 0', () => {
    const slots: Slot[] = [
      { id: 'x1', nombre: 'Sin count', slug: 'x1', plan: 'agency-slot', estado: 'activo', fechaCreacion: '', enabledModules: [] },
    ]
    const stats = computeStats(slots)
    expect(stats.leads).toBe(0)
    expect(stats.users).toBe(0)
  })

  it('estado "eliminado" no cuenta como activo', () => {
    const stats = computeStats(mixPlusDeleted)
    expect(stats.total).toBe(5)
    expect(stats.active).toBe(3) // 2 agency activos + 1 accounting activo
  })
})

// ─── Tests: defaults ─────────────────────────────────────────────────────────

describe('Valores por defecto de las páginas', () => {
  it('Agencia debe mostrar "all" como default (todos los slots)', () => {
    const defaultTab: TabAgency = 'all'
    const result = filterAgencySlots(mixOfSlots, defaultTab)
    expect(result).toHaveLength(4)
  })

  it('Contabilidad debe mostrar "accounting" como default (solo contables)', () => {
    const defaultTab: TabAccounting = 'accounting'
    const result = filterAccountingSlots(mixOfSlots, defaultTab)
    expect(result).toHaveLength(2)
    result.forEach(s => expect(s.plan).toBe('accounting-slot'))
  })
})
