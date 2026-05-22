import { prisma } from '@/lib/db'

/**
 * Contexto de ejecución de una automatización.
 * Contiene los IDs y datos de las entidades involucradas.
 */
export interface ExecutionContext {
  tenantId?: string
  leadId?: string
  citaId?: string
  servicioId?: string
  estudianteId?: string
  cursoId?: string
  inscripcionId?: string
  lead?: any
  cita?: any
  estudiante?: any
  curso?: any
  inscripcion?: any
  [key: string]: any
}

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
  dispatchAction: (config: any) => Promise<boolean>
}

/**
 * Firma de un action handler standalone.
 */
export type ActionHandler = (config: any, ctx: ActionContext) => Promise<boolean>
