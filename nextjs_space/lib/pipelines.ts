/**
 * Pipeline definitions and module mapping
 *
 * Maps CRM modules to predefined pipeline names.
 * When a tenant has certain modules enabled, corresponding pipelines
 * are automatically created/available.
 *
 * NOTE: This file must NOT import Prisma — it's imported by client components.
 * Server-only pipeline utilities are in lib/pipelines-server.ts
 */

// ─── Module → Pipeline mapping ────────────────────────────────────────────

export interface PipelineDefinition {
  nombre: string
  categoria: string
  descripcion: string
  orden: number
  icono: string
}

export const MODULE_PIPELINES: Record<string, PipelineDefinition[]> = {
  pipeline: [
    {
      nombre: 'CRM Ventas',
      categoria: 'ventas',
      descripcion: 'Pipeline de ventas principal',
      orden: 1,
      icono: '📈',
    },
  ],
  rrhh: [
    {
      nombre: 'RRHH',
      categoria: 'rrhh',
      descripcion: 'Pipeline de reclutamiento y selección',
      orden: 2,
      icono: '👥',
    },
  ],
  proyectos: [
    {
      nombre: 'Proyectos',
      categoria: 'proyectos',
      descripcion: 'Pipeline de proyectos y obras',
      orden: 3,
      icono: '🏗️',
    },
  ],
  inmobiliario: [
    {
      nombre: 'Captación',
      categoria: 'captacion',
      descripcion: 'Pipeline para captar propiedades de vendedores/propietarios',
      orden: 4,
      icono: '📋',
    },
    {
      nombre: 'Compra',
      categoria: 'compra',
      descripcion: 'Pipeline para acompañar compradores hasta el cierre',
      orden: 5,
      icono: '🔑',
    },
  ],
  finanzas: [
    {
      nombre: 'Finanzas',
      categoria: 'finanzas',
      descripcion: 'Pipeline de clientes financieros',
      orden: 6,
      icono: '💰',
    },
  ],
  logistica: [
    {
      nombre: 'Logística',
      categoria: 'logistica',
      descripcion: 'Pipeline de operaciones logísticas',
      orden: 7,
      icono: '🚚',
    },
  ],
}

// ─── Default stages per pipeline category ─────────────────────────────────

export interface StageDefinition {
  nombre: string
  probabilidad: number
  orden: number
  color: string
  esEtapaFinal: boolean
  tipoEtapaFinal?: string
}

export const DEFAULT_STAGES: StageDefinition[] = [
  { nombre: 'Calificación', probabilidad: 10, orden: 1, color: '#94a3b8', esEtapaFinal: false },
  { nombre: 'Contacto Inicial', probabilidad: 25, orden: 2, color: '#3b82f6', esEtapaFinal: false },
  { nombre: 'Propuesta', probabilidad: 50, orden: 3, color: '#8b5cf6', esEtapaFinal: false },
  { nombre: 'Negociación', probabilidad: 75, orden: 4, color: '#f59e0b', esEtapaFinal: false },
  { nombre: 'Cierre', probabilidad: 90, orden: 5, color: '#10b981', esEtapaFinal: false },
  { nombre: 'Ganado', probabilidad: 100, orden: 6, color: '#059669', esEtapaFinal: true, tipoEtapaFinal: 'ganado' },
  { nombre: 'Perdido', probabilidad: 0, orden: 7, color: '#ef4444', esEtapaFinal: true, tipoEtapaFinal: 'perdido' },
]

// ─── Pipeline categories that use custom stages ───────────────────────────

/**
 * Stages for Captación (property owner/seller pipeline):
 * Contacto → Visita/Tasación → Firma Contrato → Publicación → Negociación → Cierre
 */
export const CAPTACION_STAGES: StageDefinition[] = [
  { nombre: 'Contacto Inicial', probabilidad: 10, orden: 1, color: '#94a3b8', esEtapaFinal: false },
  { nombre: 'Visita y Tasación', probabilidad: 25, orden: 2, color: '#3b82f6', esEtapaFinal: false },
  { nombre: 'Contrato de Mandato', probabilidad: 45, orden: 3, color: '#8b5cf6', esEtapaFinal: false },
  { nombre: 'Publicación y Difusión', probabilidad: 60, orden: 4, color: '#f59e0b', esEtapaFinal: false },
  { nombre: 'Negociación con Comprador', probabilidad: 80, orden: 5, color: '#10b981', esEtapaFinal: false },
  { nombre: 'Cierre de Venta', probabilidad: 100, orden: 6, color: '#059669', esEtapaFinal: true, tipoEtapaFinal: 'ganado' },
  { nombre: 'Perdido / Archivado', probabilidad: 0, orden: 7, color: '#ef4444', esEtapaFinal: true, tipoEtapaFinal: 'perdido' },
]

/**
 * Stages for Compra (buyer pipeline):
 * Lead → Calificación → Búsqueda → Visitas → Oferta → Negociación → Cierre → Postventa
 */
export const COMPRA_STAGES: StageDefinition[] = [
  { nombre: 'Lead / Interesado', probabilidad: 5, orden: 1, color: '#94a3b8', esEtapaFinal: false },
  { nombre: 'Calificación de Necesidades', probabilidad: 20, orden: 2, color: '#3b82f6', esEtapaFinal: false },
  { nombre: 'Búsqueda de Propiedades', probabilidad: 35, orden: 3, color: '#6366f1', esEtapaFinal: false },
  { nombre: 'Visitas Programadas', probabilidad: 55, orden: 4, color: '#8b5cf6', esEtapaFinal: false },
  { nombre: 'Presentación de Oferta', probabilidad: 70, orden: 5, color: '#f59e0b', esEtapaFinal: false },
  { nombre: 'Negociación', probabilidad: 85, orden: 6, color: '#f97316', esEtapaFinal: false },
  { nombre: 'Cierre de Compra', probabilidad: 100, orden: 7, color: '#059669', esEtapaFinal: true, tipoEtapaFinal: 'ganado' },
  { nombre: 'Desistido / Perdido', probabilidad: 0, orden: 8, color: '#ef4444', esEtapaFinal: true, tipoEtapaFinal: 'perdido' },
]

/**
 * Stages for RRHH (recruitment & selection pipeline):
 * Postulación → Preselección → Entrevista Inicial → Evaluación Técnica → Entrevista Final → Oferta → Contratado
 */
export const RRHH_STAGES: StageDefinition[] = [
  { nombre: 'Postulación', probabilidad: 5, orden: 1, color: '#94a3b8', esEtapaFinal: false },
  { nombre: 'Preselección', probabilidad: 15, orden: 2, color: '#60a5fa', esEtapaFinal: false },
  { nombre: 'Entrevista Inicial', probabilidad: 30, orden: 3, color: '#818cf8', esEtapaFinal: false },
  { nombre: 'Evaluación Técnica', probabilidad: 45, orden: 4, color: '#a78bfa', esEtapaFinal: false },
  { nombre: 'Entrevista Final', probabilidad: 60, orden: 5, color: '#f59e0b', esEtapaFinal: false },
  { nombre: 'Oferta y Negociación', probabilidad: 80, orden: 6, color: '#10b981', esEtapaFinal: false },
  { nombre: 'Contratado', probabilidad: 100, orden: 7, color: '#059669', esEtapaFinal: true, tipoEtapaFinal: 'ganado' },
  { nombre: 'Rechazado / Archivado', probabilidad: 0, orden: 8, color: '#ef4444', esEtapaFinal: true, tipoEtapaFinal: 'perdido' },
]

/**
 * Stages for Proyectos (project management pipeline):
 * Iniciación → Planificación → Ejecución → Monitoreo → Cierre → Completado
 */
export const PROYECTOS_STAGES: StageDefinition[] = [
  { nombre: 'Iniciación / Kickoff', probabilidad: 10, orden: 1, color: '#94a3b8', esEtapaFinal: false },
  { nombre: 'Planificación', probabilidad: 25, orden: 2, color: '#3b82f6', esEtapaFinal: false },
  { nombre: 'Ejecución', probabilidad: 45, orden: 3, color: '#8b5cf6', esEtapaFinal: false },
  { nombre: 'Monitoreo y Control', probabilidad: 65, orden: 4, color: '#f59e0b', esEtapaFinal: false },
  { nombre: 'Cierre / Entrega', probabilidad: 90, orden: 5, color: '#10b981', esEtapaFinal: false },
  { nombre: 'Completado', probabilidad: 100, orden: 6, color: '#059669', esEtapaFinal: true, tipoEtapaFinal: 'ganado' },
  { nombre: 'Cancelado / Archivado', probabilidad: 0, orden: 7, color: '#ef4444', esEtapaFinal: true, tipoEtapaFinal: 'perdido' },
]

/**
 * Stages for Finanzas (financial services pipeline):
 * Lead → Calificación → Propuesta → Riesgo → Aprobación → Documentación → Cierre
 */
export const FINANZAS_STAGES: StageDefinition[] = [
  { nombre: 'Lead / Prospecto', probabilidad: 5, orden: 1, color: '#94a3b8', esEtapaFinal: false },
  { nombre: 'Calificación Crediticia', probabilidad: 20, orden: 2, color: '#3b82f6', esEtapaFinal: false },
  { nombre: 'Propuesta Financiera', probabilidad: 35, orden: 3, color: '#6366f1', esEtapaFinal: false },
  { nombre: 'Evaluación de Riesgo', probabilidad: 50, orden: 4, color: '#8b5cf6', esEtapaFinal: false },
  { nombre: 'Negociación y Aprobación', probabilidad: 70, orden: 5, color: '#f59e0b', esEtapaFinal: false },
  { nombre: 'Documentación / Contrato', probabilidad: 85, orden: 6, color: '#10b981', esEtapaFinal: false },
  { nombre: 'Cierre / Desembolso', probabilidad: 100, orden: 7, color: '#059669', esEtapaFinal: true, tipoEtapaFinal: 'ganado' },
  { nombre: 'Rechazado / Desistido', probabilidad: 0, orden: 8, color: '#ef4444', esEtapaFinal: true, tipoEtapaFinal: 'perdido' },
]

/**
 * Stages for Logística (logistics pipeline):
 * Solicitud → Planificación → Asignación → Carga → Tránsito → Entrega → Completado
 */
export const LOGISTICA_STAGES: StageDefinition[] = [
  { nombre: 'Solicitud / Pedido', probabilidad: 5, orden: 1, color: '#94a3b8', esEtapaFinal: false },
  { nombre: 'Planificación de Ruta', probabilidad: 15, orden: 2, color: '#3b82f6', esEtapaFinal: false },
  { nombre: 'Asignación de Recursos', probabilidad: 30, orden: 3, color: '#6366f1', esEtapaFinal: false },
  { nombre: 'Carga / Despacho', probabilidad: 45, orden: 4, color: '#8b5cf6', esEtapaFinal: false },
  { nombre: 'En Tránsito', probabilidad: 65, orden: 5, color: '#f59e0b', esEtapaFinal: false },
  { nombre: 'Entrega', probabilidad: 85, orden: 6, color: '#10b981', esEtapaFinal: false },
  { nombre: 'Completado', probabilidad: 100, orden: 7, color: '#059669', esEtapaFinal: true, tipoEtapaFinal: 'ganado' },
  { nombre: 'Incidencia / Devuelto', probabilidad: 0, orden: 8, color: '#ef4444', esEtapaFinal: true, tipoEtapaFinal: 'perdido' },
]

/**
 * Returns the stage definitions for a given pipeline category.
 * Falls back to DEFAULT_STAGES if no custom mapping exists.
 */
export function getStagesForCategory(categoria: string): StageDefinition[] {
  const stagesMap: Record<string, StageDefinition[]> = {
    captacion: CAPTACION_STAGES,
    compra: COMPRA_STAGES,
    rrhh: RRHH_STAGES,
    proyectos: PROYECTOS_STAGES,
    finanzas: FINANZAS_STAGES,
    logistica: LOGISTICA_STAGES,
  }
  return stagesMap[categoria] || DEFAULT_STAGES
}

// ─── Max pipelines per plan (shared with server-side code) ────────────────

export const PIPELINE_LIMITS_BY_PLAN: Record<string, number> = {
  trial: 1,
  starter: 1,
  basico: 1,
  growth: 3,
  profesional: 3,
  pro: 5,
  'pro-agency': 10,
  'pro-accounting': 5,
}

/**
 * Returns the pipeline definitions that should be available for a tenant
 * based on their enabled modules.
 */
export function getPipelinesForModules(enabledModules: string[]): PipelineDefinition[] {
  const pipelines: PipelineDefinition[] = []
  const seen = new Set<string>()

  for (const module of enabledModules) {
    const modulePipelines = MODULE_PIPELINES[module] || []
    for (const pipe of modulePipelines) {
      if (!seen.has(pipe.categoria)) {
        seen.add(pipe.categoria)
        pipelines.push({ ...pipe })
      }
    }
  }

  // Always include CRM Ventas if not already included
  if (!seen.has('ventas')) {
    pipelines.unshift({
      nombre: 'CRM Ventas',
      categoria: 'ventas',
      descripcion: 'Pipeline de ventas principal',
      orden: 1,
      icono: '📈',
    })
  }

  return pipelines.sort((a, b) => a.orden - b.orden)
}

