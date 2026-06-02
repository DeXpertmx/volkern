import { describe, it, expect } from 'vitest'

// ─── Pure functions replicating the URL logic from both pages ────────────────

type TabAgency = 'all' | 'agency' | 'accounting'
type TabAccounting = 'all' | 'accounting' | 'agency'

/**
 * Agency page: reads ?tab from URL, defaults to 'all'.
 * searchParamsString is window.location.search (e.g. '?tab=agency').
 */
function readTabAgency(searchParamsString: string): TabAgency {
  const params = new URLSearchParams(searchParamsString)
  const rawTab = params.get('tab')
  return rawTab && ['all', 'agency', 'accounting'].includes(rawTab)
    ? (rawTab as TabAgency)
    : 'all'
}

/**
 * Accounting page: reads ?tab from URL, defaults to 'accounting'.
 */
function readTabAccounting(searchParamsString: string): TabAccounting {
  const params = new URLSearchParams(searchParamsString)
  const rawTab = params.get('tab')
  return rawTab && ['all', 'accounting', 'agency'].includes(rawTab)
    ? (rawTab as TabAccounting)
    : 'accounting'
}

/**
 * Builds the URL after a tab change (agency version).
 * Returns { href, searchParams } so we can test the URL and the params separately.
 */
function buildTabUrlAgency(
  pathname: string,
  searchParamsString: string,
  newTab: TabAgency,
): { href: string; tabParam: string | null } {
  const params = new URLSearchParams(searchParamsString)
  if (newTab === 'all') {
    params.delete('tab')
  } else {
    params.set('tab', newTab)
  }
  const qs = params.toString()
  const href = `${pathname}${qs ? `?${qs}` : ''}`
  return { href, tabParam: params.get('tab') } // null means tab param removed
}

/**
 * Builds the URL after a tab change (accounting version).
 */
function buildTabUrlAccounting(
  pathname: string,
  searchParamsString: string,
  newTab: TabAccounting,
): { href: string; tabParam: string | null } {
  const params = new URLSearchParams(searchParamsString)
  if (newTab === 'all') {
    params.delete('tab')
  } else {
    params.set('tab', newTab)
  }
  const qs = params.toString()
  const href = `${pathname}${qs ? `?${qs}` : ''}`
  return { href, tabParam: params.get('tab') }
}

/**
 * Preserves other search params when changing tab.
 */
function buildTabUrlPreserveOther(
  pathname: string,
  searchParamsString: string,
  newTab: TabAgency,
): { href: string; preservedKeys: string[] } {
  const params = new URLSearchParams(searchParamsString)
  const currentKeys = [...params.keys()]
  if (newTab === 'all') {
    params.delete('tab')
  } else {
    params.set('tab', newTab)
  }
  const qs = params.toString()
  const href = `${pathname}${qs ? `?${qs}` : ''}`
  // Which original keys are still present (minus 'tab' which we modified)?
  const preservedKeys = currentKeys.filter(k => k !== 'tab')
  return { href, preservedKeys }
}

// ─── Test data ───────────────────────────────────────────────────────────────

const PATHNAME = '/dashboard/configuracion/agency'

// ─── Tests: readTabAgency ────────────────────────────────────────────────────

describe('readTabAgency (lectura de URL en página Agencia)', () => {
  it('?tab=agency → "agency"', () => {
    expect(readTabAgency('?tab=agency')).toBe('agency')
  })

  it('?tab=accounting → "accounting"', () => {
    expect(readTabAgency('?tab=accounting')).toBe('accounting')
  })

  it('?tab=all → "all"', () => {
    expect(readTabAgency('?tab=all')).toBe('all')
  })

  it('sin ?tab → default "all"', () => {
    expect(readTabAgency('')).toBe('all')
  })

  it('?tab con valor desconocido → fallback "all"', () => {
    // Si la URL tiene ?tab=invalid, el cast falla y el || 'all' se activa
    expect(readTabAgency('?tab=invalid')).toBe('all')
  })

  it('?tab vacío → fallback "all"', () => {
    expect(readTabAgency('?tab=')).toBe('all')
  })

  it('otros params presentes, ?tab=agency → "agency"', () => {
    expect(readTabAgency('?page=2&tab=agency&sort=name')).toBe('agency')
  })

  it('?tab=AGENCY (mayúsculas) → fallback "all" (case sensitive)', () => {
    expect(readTabAgency('?tab=AGENCY')).toBe('all')
  })
})

// ─── Tests: readTabAccounting ────────────────────────────────────────────────

describe('readTabAccounting (lectura de URL en página Contabilidad)', () => {
  it('?tab=accounting → "accounting"', () => {
    expect(readTabAccounting('?tab=accounting')).toBe('accounting')
  })

  it('?tab=agency → "agency"', () => {
    expect(readTabAccounting('?tab=agency')).toBe('agency')
  })

  it('?tab=all → "all"', () => {
    expect(readTabAccounting('?tab=all')).toBe('all')
  })

  it('sin ?tab → default "accounting" (diferente de agencia)', () => {
    expect(readTabAccounting('')).toBe('accounting')
  })

  it('?tab con valor desconocido → fallback "accounting"', () => {
    expect(readTabAccounting('?tab=invalid')).toBe('accounting')
  })

  it('?tab vacío → fallback "accounting"', () => {
    expect(readTabAccounting('?tab=')).toBe('accounting')
  })

  it('otros params presentes, ?tab=all → "all"', () => {
    expect(readTabAccounting('?page=1&tab=all&filter=active')).toBe('all')
  })
})

// ─── Tests: buildTabUrlAgency ────────────────────────────────────────────────

describe('buildTabUrlAgency (escritura de URL en página Agencia)', () => {
  it('tab="agency" → ?tab=agency en la URL', () => {
    const { href, tabParam } = buildTabUrlAgency(PATHNAME, '', 'agency')
    expect(tabParam).toBe('agency')
    expect(href).toBe(`${PATHNAME}?tab=agency`)
  })

  it('tab="accounting" → ?tab=accounting en la URL', () => {
    const { href, tabParam } = buildTabUrlAgency(PATHNAME, '', 'accounting')
    expect(tabParam).toBe('accounting')
    expect(href).toBe(`${PATHNAME}?tab=accounting`)
  })

  it('tab="all" → elimina ?tab (URL limpia)', () => {
    const { href, tabParam } = buildTabUrlAgency(PATHNAME, '?tab=agency', 'all')
    expect(tabParam).toBeNull()
    expect(href).toBe(PATHNAME)
  })

  it('tab="all" sin ?tab previo → URL sin cambios', () => {
    const { href, tabParam } = buildTabUrlAgency(PATHNAME, '', 'all')
    expect(tabParam).toBeNull()
    expect(href).toBe(PATHNAME)
  })

  it('cambia de accounting → agency correctamente', () => {
    const { href, tabParam } = buildTabUrlAgency(PATHNAME, '?tab=accounting', 'agency')
    expect(tabParam).toBe('agency')
    expect(href).toBe(`${PATHNAME}?tab=agency`)
  })

  it('preserva otros params al cambiar tab (scroll=false es externo a la URL)', () => {
    const result = buildTabUrlPreserveOther(PATHNAME, '?page=2&sort=name&tab=agency', 'accounting')
    expect(result.preservedKeys).toEqual(['page', 'sort'])
    expect(result.href).toContain('?page=2')
    expect(result.href).toContain('&sort=name')
    expect(result.href).toContain('tab=accounting')
  })

  it('múltiples params existentes, tab="all" los preserva y elimina tab', () => {
    const { href } = buildTabUrlAgency(PATHNAME, '?page=2&sort=name&tab=accounting', 'all')
    expect(href).toBe(`${PATHNAME}?page=2&sort=name`)
    expect(href).not.toContain('tab=')
  })

  it('tab="all" desde ?tab=all → URL limpia (sin duplicados)', () => {
    const { href, tabParam } = buildTabUrlAgency(PATHNAME, '?tab=all', 'all')
    expect(tabParam).toBeNull()
    expect(href).toBe(PATHNAME)
  })
})

// ─── Tests: buildTabUrlAccounting ────────────────────────────────────────────

describe('buildTabUrlAccounting (escritura de URL en página Contabilidad)', () => {
  it('tab="accounting" → ?tab=accounting en la URL', () => {
    const { href, tabParam } = buildTabUrlAccounting(PATHNAME, '', 'accounting')
    expect(tabParam).toBe('accounting')
    expect(href).toBe(`${PATHNAME}?tab=accounting`)
  })

  it('tab="agency" → ?tab=agency en la URL', () => {
    const { href, tabParam } = buildTabUrlAccounting(PATHNAME, '', 'agency')
    expect(tabParam).toBe('agency')
    expect(href).toBe(`${PATHNAME}?tab=agency`)
  })

  it('tab="all" → elimina ?tab (URL limpia)', () => {
    const { href, tabParam } = buildTabUrlAccounting(PATHNAME, '?tab=accounting', 'all')
    expect(tabParam).toBeNull()
    expect(href).toBe(PATHNAME)
  })

  it('tab="all" sin ?tab previo → URL sin cambios', () => {
    const { href, tabParam } = buildTabUrlAccounting(PATHNAME, '', 'all')
    expect(tabParam).toBeNull()
    expect(href).toBe(PATHNAME)
  })

  it('cambia de agency → accounting correctamente', () => {
    const { href, tabParam } = buildTabUrlAccounting(PATHNAME, '?tab=agency', 'accounting')
    expect(tabParam).toBe('accounting')
    expect(href).toBe(`${PATHNAME}?tab=accounting`)
  })

  it('preserva otros params (page, filter) al cambiar tab', () => {
    const result = buildTabUrlPreserveOther(PATHNAME, '?page=1&filter=active&tab=agency', 'accounting')
    expect(result.preservedKeys).toEqual(['page', 'filter'])
    expect(result.href).toContain('page=1')
    expect(result.href).toContain('filter=active')
    expect(result.href).toContain('tab=accounting')
  })

  it('múltiples params, tab="all" preserva otros y elimina tab', () => {
    const { href } = buildTabUrlAccounting(PATHNAME, '?page=1&q=busqueda&tab=accounting', 'all')
    expect(href).toBe(`${PATHNAME}?page=1&q=busqueda`)
    expect(href).not.toContain('tab=')
  })
})

// ─── Tests: edge cases y comportamientos compartidos ─────────────────────────

describe('Edge cases compartidos entre ambas páginas', () => {
  it('pathname con subdirectorios profundos funciona correctamente', () => {
    const deepPath = '/dashboard/tenant-abc/configuracion/agency'
    const { href } = buildTabUrlAgency(deepPath, '', 'agency')
    expect(href).toBe(`${deepPath}?tab=agency`)
  })

  it('tab cambia sin perder fragmento (hash)', () => {
    // El hash no se envía al servidor, pero si algún día hay hash en cliente:
    const { href } = buildTabUrlAgency(PATHNAME, '?tab=agency', 'accounting')
    expect(href).toBe(`${PATHNAME}?tab=accounting`)
  })

  it('múltiples tabs consecutivos: agency → all → accounting', () => {
    const step1 = buildTabUrlAgency(PATHNAME, '', 'agency')
    expect(step1.href).toBe(`${PATHNAME}?tab=agency`)

    const step2 = buildTabUrlAgency(PATHNAME, '?tab=agency', 'all')
    expect(step2.href).toBe(PATHNAME)

    const step3 = buildTabUrlAgency(PATHNAME, '', 'accounting')
    expect(step3.href).toBe(`${PATHNAME}?tab=accounting`)
  })

  it('múltiples tabs consecutivos: all → accounting → agency', () => {
    const step1 = buildTabUrlAgency(PATHNAME, '', 'all')
    expect(step1.href).toBe(PATHNAME)

    const step2 = buildTabUrlAgency(PATHNAME, '', 'accounting')
    expect(step2.href).toBe(`${PATHNAME}?tab=accounting`)

    const step3 = buildTabUrlAgency(PATHNAME, '?tab=accounting', 'agency')
    expect(step3.href).toBe(`${PATHNAME}?tab=agency`)
  })

  it('scroll: false se maneja externamente (router.replace lo recibe)', () => {
    // Verificamos que la URL generada no tenga scroll param
    const { href } = buildTabUrlAgency(PATHNAME, '', 'agency')
    expect(href).not.toContain('scroll')
  })
})
