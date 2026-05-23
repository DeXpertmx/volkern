import { prisma } from '@/lib/db'

/**
 * Contexto de ejecución de una automatización.
 * Contiene los IDs y datos de las entidades involucradas.
 * Campos tipados explícitamente para los más usados; extensible vía índice.
 */
export interface ExecutionContext {
  tenantId?: string
  leadId?: string
  citaId?: string
  servicioId?: string
  estudianteId?: string
  cursoId?: string
  inscripcionId?: string
  lead?: Record<string, any>
  cita?: Record<string, any>
  estudiante?: Record<string, any>
  curso?: Record<string, any>
  inscripcion?: Record<string, any>
  [key: string]: unknown
}

/** Configuración genérica para dispatchAction */
export type ActionConfig = Record<string, unknown>

/**
 * Contexto inyectado a cada action handler.
 * Proporciona acceso al estado, logging, reemplazo de variables,
 * y un dispatcher para encadenar acciones (resuelve interdependencias).
 */
export interface ActionContext {
  state: ExecutionContext
  automationId: string
  executionId: string
  log: (nodeId: string, nodeType: string, status: string, message: string) => Promise<void>
  replaceVariables: (text: string) => string
  dispatchAction: (config: ActionConfig) => Promise<boolean>
}

/**
 * Firma de un action handler standalone.
 */
export type ActionHandler = (config: ActionConfig, ctx: ActionContext) => Promise<boolean>
