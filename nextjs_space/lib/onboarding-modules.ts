/**
 * Módulos y configuraciones compartidas para el flujo de onboarding.
 * Extraído para que tanto el componente UI como los tests puedan usar estas definiciones.
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ModuleGroup = {
  group: string
  modules: { id: string; label: string; icon: string; description: string }[]
}

// ─── Constantes ──────────────────────────────────────────────────────────────

export const CORE_MODULES = [
  'leads',
  'contactos',
  'empresas',
  'pipeline',
  'tareas',
  'analytics',
  'mensajes',
  'citas',
  'equipo',
  'configuracion',
  'conocimiento',
] as const

export type CoreModule = typeof CORE_MODULES[number]

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    group: 'CRM Esencial',
    modules: [
      { id: 'leads', label: 'Leads', icon: '👥', description: 'Gestión de prospectos' },
      { id: 'contactos', label: 'Contactos', icon: '✅', description: 'Base de contactos' },
      { id: 'empresas', label: 'Empresas', icon: '🏢', description: 'Cuentas/empresas' },
      { id: 'pipeline', label: 'Pipeline', icon: '📈', description: 'Pipeline de ventas' },
      { id: 'tareas', label: 'Tareas', icon: '📋', description: 'Gestión de tareas' },
      { id: 'analytics', label: 'Analytics', icon: '📊', description: 'Panel de analíticas' },
    ],
  },
  {
    group: 'Ventas y Documentos',
    modules: [
      { id: 'cotizaciones', label: 'Cotizaciones', icon: '📄', description: 'Presupuestos y cotizaciones' },
      { id: 'contratos', label: 'Contratos', icon: '📜', description: 'Contratos digitales' },
      { id: 'ordenes_venta', label: 'Órdenes de Venta', icon: '🛒', description: 'Facturación y órdenes' },
      { id: 'pronosticos', label: 'Pronósticos', icon: '🔮', description: 'Forecast de ventas' },
      { id: 'scoring', label: 'Scoring', icon: '🏆', description: 'Puntuación de leads' },
    ],
  },
  {
    group: 'Comunicación',
    modules: [
      { id: 'mensajes', label: 'Mensajes', icon: '💬', description: 'Centro de mensajería' },
      { id: 'citas', label: 'Citas', icon: '📅', description: 'Agendamiento' },
      { id: 'catalogo', label: 'Catálogo', icon: '🏷️', description: 'Productos/servicios' },
      { id: 'chatbot_whatsapp', label: 'Chatbot IA', icon: '🤖', description: 'Chatbot WhatsApp/Web' },
      { id: 'telefonia', label: 'Telefonía', icon: '📞', description: 'Llamadas VoIP' },
    ],
  },
  {
    group: 'Marketing',
    modules: [
      { id: 'campanas', label: 'Campañas', icon: '📣', description: 'Campañas multicanal' },
      { id: 'email_marketing', label: 'Email Marketing', icon: '✉️', description: 'Campañas de email' },
      { id: 'cms', label: 'Web Creator', icon: '🌐', description: 'Landing pages' },
      { id: 'social_manager', label: 'Hub Social', icon: '📱', description: 'Redes sociales' },
      { id: 'formularios', label: 'Formularios', icon: '📝', description: 'Formularios inteligentes' },
    ],
  },
  {
    group: 'Contabilidad y ERP',
    modules: [
      { id: 'finanzas', label: 'Finanzas', icon: '💰', description: 'Contabilidad, IVA, balances' },
      { id: 'conciliacion', label: 'Conciliación', icon: '🏦', description: 'Conciliación bancaria' },
      { id: 'rrhh', label: 'RRHH', icon: '👥', description: 'Nóminas y talento' },
      { id: 'inventario', label: 'Inventario', icon: '📦', description: 'Almacenes y stock' },
      { id: 'produccion', label: 'Producción', icon: '🏭', description: 'Manufactura y BOM' },
      { id: 'proyectos', label: 'Proyectos', icon: '🏗️', description: 'Obras y proyectos' },
      { id: 'logistica', label: 'Logística', icon: '🚚', description: 'Flota y envíos' },
      { id: 'activos', label: 'Activos', icon: '🚜', description: 'Maquinaria y equipos' },
    ],
  },
  {
    group: 'Extras',
    modules: [
      { id: 'cursos', label: 'Academia LMS', icon: '📚', description: 'Cursos y estudiantes' },
      { id: 'automatizaciones', label: 'Automatizaciones', icon: '⚙️', description: 'Motor visual' },
      { id: 'mi_tarjeta', label: 'Mi Tarjeta', icon: '💳', description: 'Tarjeta digital' },
      { id: 'white_label', label: 'Marca Blanca', icon: '🏷️', description: 'Tu propio branding' },
      { id: 'estrategia', label: 'Estrategia', icon: '🎯', description: 'KPIs y planificación' },
      { id: 'compliance_pro', label: 'Compliance PRO', icon: '🛡️', description: 'Control normativo y auditoría avanzada' },
    ],
  },
]

export const PERFIL_SUGGESTED_MODULES: Record<string, string[]> = {
  // ─── Verticales ──────────────────────────────────────────────────────────
  crm_ventas: [
    'cotizaciones', 'contratos', 'ordenes_venta', 'pronosticos', 'scoring',
    'mensajes', 'citas', 'chatbot_whatsapp', 'telefonia', 'catalogo',
    'campanas', 'email_marketing',
    'automatizaciones',
  ],
  agencia_marketing: [
    'campanas', 'email_marketing', 'cms', 'social_manager', 'formularios',
    'mensajes', 'citas', 'chatbot_whatsapp',
    'cotizaciones', 'contratos',
    'cursos',
    'automatizaciones',
  ],
  academia: [
    'cursos', 'estudiantes',
    'mensajes', 'citas', 'chatbot_whatsapp',
    'campanas', 'email_marketing', 'cms', 'formularios',
    'cotizaciones', 'contratos', 'ordenes_venta',
  ],
  asesoria_contable: [
    'finanzas', 'conciliacion', 'rrhh',
    'citas', 'mensajes', 'chatbot_whatsapp', 'catalogo',
    'cotizaciones', 'contratos', 'ordenes_venta',
    'inventario', 'proyectos',
  ],
  rrhh: [
    'rrhh', 'finanzas',
    'mensajes', 'citas', 'chatbot_whatsapp',
    'cursos',
    'contratos',
    'formularios',
  ],
  inmobiliaria: [
    'cotizaciones', 'contratos', 'ordenes_venta',
    'mensajes', 'citas', 'chatbot_whatsapp',
    'campanas', 'email_marketing', 'cms', 'formularios',
    'proyectos', 'inventario',
  ],
  industria: [
    'produccion', 'inventario', 'proyectos', 'calidad', 'activos', 'logistica',
    'finanzas', 'conciliacion',
    'mensajes', 'citas',
    'cotizaciones', 'contratos', 'ordenes_venta',
  ],
  facturacion: [
    'cotizaciones', 'contratos', 'ordenes_venta',
    'catalogo',
    'mensajes', 'citas',
    'finanzas',
  ],

  // ─── Legacy (mantener compatibilidad) ────────────────────────────────────
  gestoria: [
    'finanzas', 'conciliacion', 'rrhh', 'citas', 'mensajes',
    'chatbot_whatsapp', 'catalogo', 'cotizaciones', 'contratos',
    'ordenes_venta', 'inventario', 'proyectos',
  ],
  general: [
    'mensajes', 'citas', 'catalogo', 'chatbot_whatsapp',
    'campanas', 'cms', 'cotizaciones', 'contratos',
    'ordenes_venta', 'cursos',
  ],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Módulos CRM esenciales activados por defecto al crear una cuenta.
 * El resto se activan durante el onboarding o en Configuración.
 */
export function getDefaultModules(): string[] {
  return [
    'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
    'mensajes', 'citas',
    'equipo', 'configuracion', 'conocimiento',
  ]
}

/**
 * Verifica si un módulo está en la lista de CORE_MODULES.
 */
export function isCoreModule(moduleId: string): boolean {
  return (CORE_MODULES as readonly string[]).includes(moduleId)
}

/**
 * Obtiene los módulos sugeridos para un perfil dado.
 * Retorna array vacío si el perfil no está definido.
 */
export function getSuggestedModulesForProfile(profile: string): string[] {
  return PERFIL_SUGGESTED_MODULES[profile] || []
}

/**
 * Aplica la selección de un perfil al set de módulos actual,
 * preservando los módulos core y añadiendo los sugeridos.
 */
export function applyProfileSelection(
  _currentModules: Set<string>,
  profile: string
): Set<string> {
  const suggested = getSuggestedModulesForProfile(profile)
  // CORE_MODULES siempre deben estar activos (no se pueden desactivar)
  const next = new Set<string>(CORE_MODULES)

  // Añadir sugeridos del perfil (algunos pueden ser también core, no hay problema)
  for (const mod of suggested) {
    next.add(mod)
  }

  return next
}

/**
 * Retorna todos los IDs de módulos disponibles (flat de MODULE_GROUPS).
 */
export function getAllModuleIds(): string[] {
  const ids: string[] = []
  for (const group of MODULE_GROUPS) {
    for (const mod of group.modules) {
      ids.push(mod.id)
    }
  }
  return ids
}
