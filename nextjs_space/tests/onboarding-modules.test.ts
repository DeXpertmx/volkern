import { describe, it, expect } from 'vitest'
import {
  MODULE_GROUPS,
  PERFIL_SUGGESTED_MODULES,
  CORE_MODULES,
  getDefaultModules,
  isCoreModule,
  getSuggestedModulesForProfile,
  applyProfileSelection,
  getAllModuleIds,
  type ModuleGroup,
} from '@/lib/onboarding-modules'
import { ALL_MODULES } from '@/lib/plans'

// ============================================================
// MODULE_GROUPS
// ============================================================
describe('MODULE_GROUPS', () => {
  it('debe ser un array con exactamente 6 grupos', () => {
    expect(Array.isArray(MODULE_GROUPS)).toBe(true)
    expect(MODULE_GROUPS.length).toBe(6)
  })

  it('cada grupo debe tener nombre y array de módulos', () => {
    for (const group of MODULE_GROUPS) {
      expect(typeof group.group).toBe('string')
      expect(group.group.length).toBeGreaterThan(0)
      expect(Array.isArray(group.modules)).toBe(true)
      expect(group.modules.length).toBeGreaterThan(0)
    }
  })

  it('cada módulo debe tener id, label, icon, description', () => {
    for (const group of MODULE_GROUPS) {
      for (const mod of group.modules) {
        expect(typeof mod.id).toBe('string')
        expect(typeof mod.label).toBe('string')
        expect(typeof mod.icon).toBe('string')
        expect(typeof mod.description).toBe('string')
        expect(mod.id.length).toBeGreaterThan(0)
        expect(mod.label.length).toBeGreaterThan(0)
      }
    }
  })

  it('todos los IDs de módulos deben ser únicos (sin duplicados entre grupos)', () => {
    const allIds = getAllModuleIds()
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('los nombres de grupo deben ser únicos', () => {
    const groupNames = MODULE_GROUPS.map(g => g.group)
    expect(new Set(groupNames).size).toBe(groupNames.length)
  })

  it('debe contener los grupos esperados', () => {
    const groupNames = new Set(MODULE_GROUPS.map(g => g.group))
    expect(groupNames.has('CRM Esencial')).toBe(true)
    expect(groupNames.has('Ventas y Documentos')).toBe(true)
    expect(groupNames.has('Comunicación')).toBe(true)
    expect(groupNames.has('Marketing')).toBe(true)
    expect(groupNames.has('Contabilidad y ERP')).toBe(true)
    expect(groupNames.has('Extras')).toBe(true)
  })

  it('CRM Esencial debe tener exactamente 6 módulos', () => {
    const crmGroup = MODULE_GROUPS.find(g => g.group === 'CRM Esencial')
    expect(crmGroup).toBeDefined()
    expect(crmGroup!.modules.length).toBe(6)
  })

  it('CRM Esencial debe contener leads, contactos, empresas, pipeline, tareas, analytics', () => {
    const crmGroup = MODULE_GROUPS.find(g => g.group === 'CRM Esencial')
    const ids = crmGroup!.modules.map(m => m.id)
    expect(ids).toContain('leads')
    expect(ids).toContain('contactos')
    expect(ids).toContain('empresas')
    expect(ids).toContain('pipeline')
    expect(ids).toContain('tareas')
    expect(ids).toContain('analytics')
  })

  it('Contabilidad y ERP debe ser el grupo más grande (8 módulos)', () => {
    const erpGroup = MODULE_GROUPS.find(g => g.group === 'Contabilidad y ERP')
    expect(erpGroup!.modules.length).toBe(8)
  })

  it('todos los IDs deben existir en ALL_MODULES (validez)', () => {
    const validIds = new Set(ALL_MODULES.map(m => m.id))
    for (const id of getAllModuleIds()) {
      expect(validIds.has(id)).toBe(true)
    }
  })

  it('todos los IDs deben seguir snake_case', () => {
    for (const id of getAllModuleIds()) {
      expect(id).toMatch(/^[a-z_]+$/)
    }
  })
})

// ============================================================
// getAllModuleIds
// ============================================================
describe('getAllModuleIds', () => {
  it('debe retornar un array con todos los módulos de todos los grupos', () => {
    const ids = getAllModuleIds()
    const manualCount = MODULE_GROUPS.reduce((sum, g) => sum + g.modules.length, 0)
    expect(ids.length).toBe(manualCount)
  })

  it('debe ser determinista (misma salida cada llamada)', () => {
    expect(getAllModuleIds()).toEqual(getAllModuleIds())
  })
})

// ============================================================
// CORE_MODULES
// ============================================================
describe('CORE_MODULES', () => {
  it('debe tener exactamente 11 módulos', () => {
    expect(CORE_MODULES.length).toBe(11)
  })

  it('debe contener los módulos CRM fundamentales', () => {
    expect(CORE_MODULES).toContain('leads')
    expect(CORE_MODULES).toContain('contactos')
    expect(CORE_MODULES).toContain('empresas')
    expect(CORE_MODULES).toContain('pipeline')
    expect(CORE_MODULES).toContain('tareas')
    expect(CORE_MODULES).toContain('analytics')
  })

  it('debe contener los módulos de administración', () => {
    expect(CORE_MODULES).toContain('equipo')
    expect(CORE_MODULES).toContain('configuracion')
    expect(CORE_MODULES).toContain('conocimiento')
  })

  it('debe contener mensajes y citas (comunicación esencial)', () => {
    expect(CORE_MODULES).toContain('mensajes')
    expect(CORE_MODULES).toContain('citas')
  })

  it('todos los CORE_MODULES deben ser IDs válidos en ALL_MODULES', () => {
    const validIds = new Set(ALL_MODULES.map(m => m.id))
    for (const mod of CORE_MODULES) {
      expect(validIds.has(mod)).toBe(true)
    }
  })

  it('no debe contener módulos opcionales de pago', () => {
    expect(CORE_MODULES).not.toContain('white_label')
    expect(CORE_MODULES).not.toContain('custom_domain')
    expect(CORE_MODULES).not.toContain('agency')
    expect(CORE_MODULES).not.toContain('finanzas')
    expect(CORE_MODULES).not.toContain('campanas')
  })
})

// ============================================================
// isCoreModule
// ============================================================
describe('isCoreModule', () => {
  it('debe devolver true para módulos core', () => {
    expect(isCoreModule('leads')).toBe(true)
    expect(isCoreModule('contactos')).toBe(true)
    expect(isCoreModule('empresas')).toBe(true)
    expect(isCoreModule('pipeline')).toBe(true)
    expect(isCoreModule('tareas')).toBe(true)
    expect(isCoreModule('analytics')).toBe(true)
    expect(isCoreModule('mensajes')).toBe(true)
    expect(isCoreModule('citas')).toBe(true)
    expect(isCoreModule('equipo')).toBe(true)
    expect(isCoreModule('configuracion')).toBe(true)
    expect(isCoreModule('conocimiento')).toBe(true)
  })

  it('debe devolver false para módulos no core', () => {
    expect(isCoreModule('finanzas')).toBe(false)
    expect(isCoreModule('campanas')).toBe(false)
    expect(isCoreModule('cursos')).toBe(false)
    expect(isCoreModule('rrhh')).toBe(false)
    expect(isCoreModule('inventario')).toBe(false)
    expect(isCoreModule('white_label')).toBe(false)
  })

  it('debe devolver false para strings vacíos o no válidos', () => {
    expect(isCoreModule('')).toBe(false)
    expect(isCoreModule('random')).toBe(false)
    expect(isCoreModule('nonexistent')).toBe(false)
  })

  it('debe ser determinista', () => {
    expect(isCoreModule('leads')).toBe(isCoreModule('leads'))
    expect(isCoreModule('random')).toBe(isCoreModule('random'))
  })
})

// ============================================================
// getDefaultModules
// ============================================================
describe('getDefaultModules', () => {
  it('debe retornar exactamente 11 módulos', () => {
    const defaults = getDefaultModules()
    expect(defaults.length).toBe(11)
  })

  it('todos los módulos por defecto deben ser core', () => {
    const defaults = getDefaultModules()
    const coreSet = new Set(CORE_MODULES)
    for (const mod of defaults) {
      expect(coreSet.has(mod)).toBe(true)
    }
  })

  it('debe incluir todos los CRM esenciales', () => {
    const defaults = getDefaultModules()
    expect(defaults).toContain('leads')
    expect(defaults).toContain('contactos')
    expect(defaults).toContain('empresas')
    expect(defaults).toContain('pipeline')
    expect(defaults).toContain('tareas')
    expect(defaults).toContain('analytics')
  })

  it('debe incluir mensajes y citas', () => {
    const defaults = getDefaultModules()
    expect(defaults).toContain('mensajes')
    expect(defaults).toContain('citas')
  })

  it('debe incluir administración', () => {
    const defaults = getDefaultModules()
    expect(defaults).toContain('equipo')
    expect(defaults).toContain('configuracion')
    expect(defaults).toContain('conocimiento')
  })

  it('NO debe incluir módulos que antes estaban en signup (24 → 12 reducción)', () => {
    const defaults = getDefaultModules()
    // Todos estos fueron removidos en la reducción
    expect(defaults).not.toContain('catalogo')
    expect(defaults).not.toContain('campanas')
    expect(defaults).not.toContain('email_marketing')
    expect(defaults).not.toContain('cms')
    expect(defaults).not.toContain('builder_premium')
    expect(defaults).not.toContain('cursos')
    expect(defaults).not.toContain('estudiantes')
    expect(defaults).not.toContain('automatizaciones')
    expect(defaults).not.toContain('cotizaciones')
    expect(defaults).not.toContain('contratos')
    expect(defaults).not.toContain('ordenes_venta')
    expect(defaults).not.toContain('mi_tarjeta')
  })

  it('los IDs deben ser únicos (sin duplicados)', () => {
    const defaults = getDefaultModules()
    expect(new Set(defaults).size).toBe(defaults.length)
  })

  it('debe ser determinista', () => {
    expect(getDefaultModules()).toEqual(getDefaultModules())
  })
})

// ============================================================
// PERFIL_SUGGESTED_MODULES
// ============================================================
describe('PERFIL_SUGGESTED_MODULES', () => {
  it('debe tener exactamente 9 perfiles (7 verticales + 2 legacy)', () => {
    const keys = Object.keys(PERFIL_SUGGESTED_MODULES)
    expect(keys).toHaveLength(9)
    // 7 verticales
    expect(keys).toContain('crm_ventas')
    expect(keys).toContain('agencia_marketing')
    expect(keys).toContain('academia')
    expect(keys).toContain('asesoria_contable')
    expect(keys).toContain('rrhh')
    expect(keys).toContain('inmobiliaria')
    expect(keys).toContain('industria')
    // 2 legacy
    expect(keys).toContain('gestoria')
    expect(keys).toContain('general')
  })

  it('cada perfil debe tener al menos 8 módulos sugeridos', () => {
    for (const [profile, modules] of Object.entries(PERFIL_SUGGESTED_MODULES)) {
      expect(modules.length).toBeGreaterThanOrEqual(8)
    }
  })

  it('gestoria debe tener exactamente 12 módulos', () => {
    expect(PERFIL_SUGGESTED_MODULES.gestoria.length).toBe(12)
  })

  it('general debe tener exactamente 10 módulos', () => {
    expect(PERFIL_SUGGESTED_MODULES.general.length).toBe(10)
  })

  it('crm_ventas debe tener exactamente 13 módulos', () => {
    expect(PERFIL_SUGGESTED_MODULES.crm_ventas.length).toBe(13)
  })

  it('agencia_marketing debe tener exactamente 12 módulos', () => {
    expect(PERFIL_SUGGESTED_MODULES.agencia_marketing.length).toBe(12)
  })

  it('academia debe tener exactamente 12 módulos', () => {
    expect(PERFIL_SUGGESTED_MODULES.academia.length).toBe(12)
  })

  it('asesoria_contable debe tener exactamente 12 módulos', () => {
    expect(PERFIL_SUGGESTED_MODULES.asesoria_contable.length).toBe(12)
  })

  it('rrhh debe tener exactamente 8 módulos', () => {
    expect(PERFIL_SUGGESTED_MODULES.rrhh.length).toBe(8)
  })

  it('inmobiliaria debe tener exactamente 12 módulos', () => {
    expect(PERFIL_SUGGESTED_MODULES.inmobiliaria.length).toBe(12)
  })

  it('industria debe tener exactamente 13 módulos', () => {
    expect(PERFIL_SUGGESTED_MODULES.industria.length).toBe(13)
  })

  it('todos los módulos sugeridos deben ser IDs válidos en ALL_MODULES', () => {
    const validIds = new Set(ALL_MODULES.map(m => m.id))
    for (const modules of Object.values(PERFIL_SUGGESTED_MODULES)) {
      for (const mod of modules) {
        expect(validIds.has(mod)).toBe(true)
      }
    }
  })

  it('gestoria debe incluir módulos contables y fiscales', () => {
    const g = PERFIL_SUGGESTED_MODULES.gestoria
    expect(g).toContain('finanzas')
    expect(g).toContain('conciliacion')
    expect(g).toContain('rrhh')
    expect(g).toContain('inventario')
    expect(g).toContain('proyectos')
  })

  it('general debe incluir módulos de marketing', () => {
    const g = PERFIL_SUGGESTED_MODULES.general
    expect(g).toContain('campanas')
    expect(g).toContain('cms')
    expect(g).toContain('cursos')
  })

  it('inmobiliaria debe incluir módulos de ventas y marketing', () => {
    const g = PERFIL_SUGGESTED_MODULES.inmobiliaria
    expect(g).toContain('cotizaciones')
    expect(g).toContain('contratos')
    expect(g).toContain('campanas')
    expect(g).toContain('cms')
    expect(g).toContain('proyectos')
  })

  it('industria debe incluir módulos ERP pesados', () => {
    const g = PERFIL_SUGGESTED_MODULES.industria
    expect(g).toContain('produccion')
    expect(g).toContain('inventario')
    expect(g).toContain('calidad')
    expect(g).toContain('activos')
    expect(g).toContain('logistica')
  })

  it('academia debe incluir módulos educativos', () => {
    const g = PERFIL_SUGGESTED_MODULES.academia
    expect(g).toContain('cursos')
    expect(g).toContain('estudiantes')
  })

  it('rrhh debe incluir módulos de talento', () => {
    const g = PERFIL_SUGGESTED_MODULES.rrhh
    expect(g).toContain('rrhh')
    expect(g).toContain('finanzas')
    expect(g).toContain('cursos')
  })

  it('crm_ventas debe incluir módulos de ventas avanzadas', () => {
    const g = PERFIL_SUGGESTED_MODULES.crm_ventas
    expect(g).toContain('pronosticos')
    expect(g).toContain('scoring')
    expect(g).toContain('telefonia')
  })

  it('agencia_marketing debe incluir módulos de marketing avanzado', () => {
    const g = PERFIL_SUGGESTED_MODULES.agencia_marketing
    expect(g).toContain('social_manager')
    expect(g).toContain('formularios')
    expect(g).toContain('cms')
  })

  it('al menos 6 perfiles deben incluir comunicación básica (mensajes, citas, chatbot)', () => {
    const withComms = Object.entries(PERFIL_SUGGESTED_MODULES).filter(
      ([_, modules]) => modules.includes('mensajes') && modules.includes('citas') && modules.includes('chatbot_whatsapp')
    )
    expect(withComms.length).toBeGreaterThanOrEqual(6)
  })

  it('al menos 6 perfiles deben incluir módulos de ventas (cotizaciones, contratos)', () => {
    const withSales = Object.entries(PERFIL_SUGGESTED_MODULES).filter(
      ([_, modules]) => modules.includes('cotizaciones') && modules.includes('contratos')
    )
    expect(withSales.length).toBeGreaterThanOrEqual(6)
  })

  it('los módulos sugeridos no core deben ser distintos de CORE_MODULES (mensajes y citas son la excepción intencional)', () => {
    const coreSet = new Set(CORE_MODULES)
    const expectedOverlap = new Set(['mensajes', 'citas']) // Intencional: son core Y sugeridos
    for (const [profile, modules] of Object.entries(PERFIL_SUGGESTED_MODULES)) {
      for (const mod of modules) {
        if (expectedOverlap.has(mod)) continue
        expect(coreSet.has(mod)).toBe(false)
      }
    }
  })

  it('los IDs en cada perfil deben ser únicos', () => {
    for (const modules of Object.values(PERFIL_SUGGESTED_MODULES)) {
      expect(new Set(modules).size).toBe(modules.length)
    }
  })

  it('debe haber solapamiento intencional entre perfiles (módulos compartidos)', () => {
    const gestoria = new Set(PERFIL_SUGGESTED_MODULES.gestoria)
    const general = PERFIL_SUGGESTED_MODULES.general
    const shared = general.filter(m => gestoria.has(m))
    expect(shared.length).toBeGreaterThan(5)
  })

  it('inmobiliaria e industria deben compartir módulos ERP comunes', () => {
    const inmob = new Set(PERFIL_SUGGESTED_MODULES.inmobiliaria)
    const ind = PERFIL_SUGGESTED_MODULES.industria
    const shared = ind.filter(m => inmob.has(m))
    // Ambos comparten: cotizaciones, contratos, ordenes_venta, mensajes, citas, inventario, proyectos
    expect(shared).toContain('inventario')
    expect(shared).toContain('proyectos')
    expect(shared).toContain('cotizaciones')
  })
})

// ============================================================
// getSuggestedModulesForProfile
// ============================================================
describe('getSuggestedModulesForProfile', () => {
  it('debe retornar los módulos de cada vertical correctamente', () => {
    expect(getSuggestedModulesForProfile('gestoria')).toEqual(PERFIL_SUGGESTED_MODULES.gestoria)
    expect(getSuggestedModulesForProfile('general')).toEqual(PERFIL_SUGGESTED_MODULES.general)
    expect(getSuggestedModulesForProfile('inmobiliaria')).toEqual(PERFIL_SUGGESTED_MODULES.inmobiliaria)
    expect(getSuggestedModulesForProfile('industria')).toEqual(PERFIL_SUGGESTED_MODULES.industria)
    expect(getSuggestedModulesForProfile('crm_ventas')).toEqual(PERFIL_SUGGESTED_MODULES.crm_ventas)
  })

  it('debe retornar array vacío para perfil desconocido', () => {
    expect(getSuggestedModulesForProfile('')).toEqual([])
    expect(getSuggestedModulesForProfile('admin')).toEqual([])
    expect(getSuggestedModulesForProfile('nonexistent')).toEqual([])
  })
})

// ============================================================
// applyProfileSelection
// ============================================================
describe('applyProfileSelection', () => {
  it('gestoria: debe incluir finanzas, conciliacion, rrhh (fiscal/contable)', () => {
    const result = applyProfileSelection(new Set(), 'gestoria')
    expect(result.has('finanzas')).toBe(true)
    expect(result.has('conciliacion')).toBe(true)
    expect(result.has('rrhh')).toBe(true)
  })

  it('general: debe incluir campanas, cms, cursos (marketing)', () => {
    const result = applyProfileSelection(new Set(), 'general')
    expect(result.has('campanas')).toBe(true)
    expect(result.has('cms')).toBe(true)
    expect(result.has('cursos')).toBe(true)
  })

  it('ambos perfiles deben incluir comunicación (mensajes, citas, chatbot)', () => {
    for (const profile of ['gestoria', 'general']) {
      const result = applyProfileSelection(new Set(), profile)
      expect(result.has('mensajes')).toBe(true)
      expect(result.has('citas')).toBe(true)
      expect(result.has('chatbot_whatsapp')).toBe(true)
    }
  })

  it('applyProfileSelection desde set vacío debe preservar todos los CORE_MODULES', () => {
    for (const profile of ['gestoria', 'general']) {
      const result = applyProfileSelection(new Set(), profile)
      for (const mod of CORE_MODULES) {
        expect(result.has(mod)).toBe(true)
      }
    }
  })

  it('perfil desconocido retorna solo los CORE_MODULES (siempre activos)', () => {
    const result = applyProfileSelection(new Set(), 'unknown')
    expect(result.size).toBe(CORE_MODULES.length)
    for (const mod of CORE_MODULES) {
      expect(result.has(mod)).toBe(true)
    }
  })

  it('debe preservar módulos core que ya estaban seleccionados', () => {
    const initial = new Set(['leads', 'contactos', 'pipeline'])
    const result = applyProfileSelection(initial, 'gestoria')
    expect(result.has('leads')).toBe(true)
    expect(result.has('contactos')).toBe(true)
    expect(result.has('pipeline')).toBe(true)
  })

  it('industria: debe incluir produccion, inventario, activos', () => {
    const result = applyProfileSelection(new Set(), 'industria')
    expect(result.has('produccion')).toBe(true)
    expect(result.has('inventario')).toBe(true)
    expect(result.has('activos')).toBe(true)
  })

  it('inmobiliaria: debe incluir proyectos y formularios', () => {
    const result = applyProfileSelection(new Set(), 'inmobiliaria')
    expect(result.has('proyectos')).toBe(true)
    expect(result.has('formularios')).toBe(true)
  })

  it('crm_ventas: debe incluir pronosticos y scoring', () => {
    const result = applyProfileSelection(new Set(), 'crm_ventas')
    expect(result.has('pronosticos')).toBe(true)
    expect(result.has('scoring')).toBe(true)
  })

  it('academia: debe incluir cursos y estudiantes', () => {
    const result = applyProfileSelection(new Set(), 'academia')
    expect(result.has('cursos')).toBe(true)
    expect(result.has('estudiantes')).toBe(true)
  })
})

// ============================================================
// Coherencia entre signup defaults y CORE_MODULES
// ============================================================
describe('Coherencia signup ↔ core ↔ onboarding', () => {
  it('getDefaultModules() debe ser un subconjunto de CORE_MODULES', () => {
    const defaults = new Set(getDefaultModules())
    const coreSet = new Set(CORE_MODULES)
    for (const mod of defaults) {
      expect(coreSet.has(mod)).toBe(true)
    }
  })

  it('CORE_MODULES debe ser un subconjunto de ALL_MODULES', () => {
    const validIds = new Set(ALL_MODULES.map(m => m.id))
    for (const mod of CORE_MODULES) {
      expect(validIds.has(mod)).toBe(true)
    }
  })

  it('todos los módulos de MODULE_GROUPS deben estar en ALL_MODULES', () => {
    const validIds = new Set(ALL_MODULES.map(m => m.id))
    for (const id of getAllModuleIds()) {
      expect(validIds.has(id)).toBe(true)
    }
  })

  it('getDefaultModules y CORE_MODULES deben contener exactamente los mismos 11 módulos', () => {
    const defaults = new Set(getDefaultModules())
    const coreSet = new Set(CORE_MODULES)

    // Son idénticos en contenido
    expect(defaults.size).toBe(11)
    expect(coreSet.size).toBe(11)
    expect(defaults).toEqual(coreSet)
  })

  it('los módulos en PERFIL_SUGGESTED_MODULES que no son core no deben estar en getDefaultModules', () => {
    const defaults = new Set(getDefaultModules())
    const coreSet = new Set(CORE_MODULES)
    for (const modules of Object.values(PERFIL_SUGGESTED_MODULES)) {
      for (const mod of modules) {
        if (coreSet.has(mod)) continue // mensajes y citas son core Y sugeridos
        expect(defaults.has(mod)).toBe(false)
      }
    }
  })
})

// ============================================================
// Escenarios de onboarding (tests de lógica de negocio)
// ============================================================
describe('Escenarios de onboarding', () => {
  it('gestoría: finanzas y conciliación deben estar en los sugeridos', () => {
    const result = applyProfileSelection(new Set(getDefaultModules()), 'gestoria')
    expect(result.has('finanzas')).toBe(true)
    expect(result.has('conciliacion')).toBe(true)
  })

  it('gestoría: no debe incluir módulos de marketing (campanas, cms)', () => {
    const result = applyProfileSelection(new Set(getDefaultModules()), 'gestoria')
    expect(result.has('campanas')).toBe(false)
    expect(result.has('cms')).toBe(false)
    expect(result.has('cursos')).toBe(false)
  })

  it('general: debe incluir campanas y cms (marketing)', () => {
    const result = applyProfileSelection(new Set(getDefaultModules()), 'general')
    expect(result.has('campanas')).toBe(true)
    expect(result.has('cms')).toBe(true)
  })

  it('general: no debe incluir módulos ERP pesados (finanzas, rrhh, produccion)', () => {
    const result = applyProfileSelection(new Set(getDefaultModules()), 'general')
    expect(result.has('finanzas')).toBe(false)
    expect(result.has('rrhh')).toBe(false)
    expect(result.has('produccion')).toBe(false)
    expect(result.has('inventario')).toBe(false)
  })

  it('aplicar industria: el resultado debe incluir logistica y calidad', () => {
    const result = applyProfileSelection(new Set(getDefaultModules()), 'industria')
    expect(result.has('logistica')).toBe(true)
    expect(result.has('calidad')).toBe(true)
  })

  it('total de módulos disponibles en MODULE_GROUPS debe coincidir con ALL_MODULES filter', () => {
    const allOnboardingIds = new Set(getAllModuleIds())
    const allPlanIds = new Set(ALL_MODULES.map(m => m.id))

    // Verificar que no hay módulos en el onboarding que no estén en ALL_MODULES
    for (const id of allOnboardingIds) {
      expect(allPlanIds.has(id)).toBe(true)
    }

    // Contar cuántos módulos de ALL_MODULES NO están en el onboarding picker
    const missingFromOnboarding = [...allPlanIds].filter(id => !allOnboardingIds.has(id))
    // Es aceptable que algunos módulos avanzados no estén en el picker de onboarding
    // (ej: finanzas_consolidado, calidad, taskforce, api_access, etc.)
    expect(missingFromOnboarding.length).toBeGreaterThan(0)
    expect(missingFromOnboarding.length).toBeLessThan(ALL_MODULES.length)
  })
})
